"""Stage 4 eval runner for the AI Interview Panel.

Loads backend/evals/golden_set.json and, for each case, runs the SAME
production code path panel.py's /panel/next-turn uses to generate a
question: panel_agents.generate_technical_question /
generate_hiring_manager_question. Nothing here re-implements retrieval,
thresholding, or prompt assembly -- those functions are imported and called
as-is, exactly like the router does.

This makes REAL Groq calls (no mocking) and REAL Firestore writes (against
the local emulator, never production). Why real calls matter: a mocked LLM
call would only ever return whatever canned string the mock was told to
return, so it could never catch what Stage 1's own testing already proved
matters here -- the model's actual behavior at the noise floor (an
irrelevant-but-resume-flavored query scoring 0.1651, just above the 0.15
threshold) was a genuine surprise that a mock, by construction, cannot
reproduce. An eval that mocks the one non-deterministic part of the system
is an eval of your scaffolding, not of your system.

Each invocation of this script IS one eval run: it processes the golden set
once (optionally repeated --runs times for the same case set), prints a
pass/fail summary, writes full raw results to a timestamped JSON file, and
(unless --no-firestore) records one summary document in Firestore's
evalRuns collection.

Usage (from backend/, with FIRESTORE_EMULATOR_HOST already exported):
    python scripts/run_evals.py
    python scripts/run_evals.py --case-id technical_distributed_systems --runs 3
    python scripts/run_evals.py --label task4-panel-v2 --no-firestore
"""
import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if not os.getenv("FIRESTORE_EMULATOR_HOST"):
    sys.exit(
        "FIRESTORE_EMULATOR_HOST is not set. This script writes throwaway "
        "sessions and eval records -- it must never run against production "
        "Firestore. Start the local emulator and export "
        "FIRESTORE_EMULATOR_HOST=localhost:8080 (see backend/README.md) "
        "before running."
    )

from app.services import embeddings, groq_client, panel_agents  # noqa: E402
from app.services.chunking import chunk_with_metadata  # noqa: E402
from app.services.firestore_client import async_add, get_db  # noqa: E402
from app.services.http_client import start_http_client, stop_http_client  # noqa: E402

GOLDEN_SET_PATH = Path(__file__).resolve().parent.parent / "evals" / "golden_set.json"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "evals" / "results"

_GENERATE = {
    "technical": panel_agents.generate_technical_question,
    "hiring_manager": panel_agents.generate_hiring_manager_question,
}

_MIN_QUESTION_LEN = 10
_MAX_QUESTION_LEN = 400


async def _seed_session(resume_text: str) -> str:
    """Ingests resume_text into a fresh session using the SAME chunking and
    embedding functions rag.py's /rag/ingest endpoint calls -- not a
    simplified stand-in. Skips only the HTTP/auth layer, since the eval
    targets panel_agents, not the ingest endpoint's request contract."""
    db = get_db()
    session_ref = db.collection("interviewSessions").document()

    chunks = chunk_with_metadata(resume_text)
    vectors = await asyncio.to_thread(embeddings.embed_batch, [c["text"] for c in chunks])

    chunks_ref = session_ref.collection("contextChunks")

    def _write():
        batch = db.batch()
        for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
            batch.set(chunks_ref.document(), {
                "text": chunk["text"], "embedding": vector,
                "order": i, "tokenCount": chunk["tokenCount"],
            })
        batch.set(session_ref, {
            "uid": "eval-harness", "status": "CONTEXT_READY", "config": {},
        })
        batch.commit()

    await asyncio.to_thread(_write)
    return session_ref.id


async def run_case(case: dict) -> dict:
    session_id = await _seed_session(case["resume_text"])

    start = time.monotonic()
    result = await _GENERATE[case["agent"]](session_id, case["turn_number"])
    duration_s = round(time.monotonic() - start, 3)

    question = result["question"]
    retrieved = result["retrieved_chunks"]
    top_similarity = retrieved[0]["similarity"] if retrieved else None
    expect = case["expect"]

    fallback_match = result["used_fallback"] == expect["used_fallback"]
    non_empty = len(question.strip()) > 0
    length_ok = _MIN_QUESTION_LEN <= len(question) <= _MAX_QUESTION_LEN

    grounding_keywords = expect.get("grounding_keywords", [])
    grounding_hit = None
    if grounding_keywords:
        q_lower = question.lower()
        grounding_hit = any(kw.lower() in q_lower for kw in grounding_keywords)

    failure_reasons = []
    if not fallback_match:
        failure_reasons.append(
            f"used_fallback={result['used_fallback']}, expected={expect['used_fallback']}")
    if not non_empty:
        failure_reasons.append("question is empty")
    if not length_ok:
        failure_reasons.append(f"question length {len(question)} outside [{_MIN_QUESTION_LEN},{_MAX_QUESTION_LEN}]")
    if grounding_hit is False:
        failure_reasons.append(f"question did not contain any of {grounding_keywords}")

    passed = not failure_reasons

    return {
        "case_id": case["id"],
        "agent": case["agent"],
        "turn_number": case["turn_number"],
        "session_id": session_id,
        "prompt_version": panel_agents.PROMPT_VERSION,
        "passed": passed,
        "failure_reasons": failure_reasons,
        "expected_used_fallback": expect["used_fallback"],
        "actual_used_fallback": result["used_fallback"],
        "retrieval_fired": len(retrieved) > 0,
        "top_similarity": top_similarity,
        "grounding_keyword_hit": grounding_hit,
        "question": question,
        "topic": result.get("topic"),
        "duration_seconds": duration_s,
        "retrieved_chunks": retrieved,
    }


async def run_golden_set(golden_set: dict, case_ids: list[str] | None = None) -> list[dict]:
    cases = golden_set["cases"]
    if case_ids:
        wanted = set(case_ids)
        cases = [c for c in cases if c["id"] in wanted]
        missing = wanted - {c["id"] for c in cases}
        if missing:
            sys.exit(f"No case(s) with id {sorted(missing)} in golden set.")

    results = []
    for case in cases:
        print(f"Running case: {case['id']} ({case['agent']}, turn {case['turn_number']})...")
        result = await run_case(case)
        status = "PASS" if result["passed"] else "FAIL"
        print(f"  [{status}] used_fallback={result['actual_used_fallback']} "
              f"top_similarity={result['top_similarity']} "
              f"({result['duration_seconds']}s)")
        print(f"  question: {result['question']!r}")
        if result["failure_reasons"]:
            print(f"  failure_reasons: {result['failure_reasons']}")
        results.append(result)
    return results


async def write_eval_run_record(results: list[dict], label: str) -> str:
    db = get_db()
    passed = sum(1 for r in results if r["passed"])
    doc = {
        "label": label,
        "promptVersion": panel_agents.PROMPT_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "totalCases": len(results),
        "passedCases": passed,
        "failedCases": len(results) - passed,
        "cases": [
            {
                "caseId": r["case_id"],
                "agent": r["agent"],
                "passed": r["passed"],
                "usedFallback": r["actual_used_fallback"],
                "topSimilarity": r["top_similarity"],
                "question": r["question"],
                "durationSeconds": r["duration_seconds"],
                "failureReasons": r["failure_reasons"],
            }
            for r in results
        ],
    }
    _, doc_ref = await async_add(db.collection("evalRuns"), doc)
    return doc_ref.id


async def main_async(args):
    golden_set = json.loads(GOLDEN_SET_PATH.read_text())
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    await start_http_client()
    try:
        for run_index in range(1, args.runs + 1):
            run_label = args.label if args.runs == 1 else f"{args.label}-run{run_index}"
            print(f"\n=== Eval run: {run_label} (promptVersion={panel_agents.PROMPT_VERSION}) ===")

            results = await run_golden_set(golden_set, case_ids=args.case_ids)

            passed = sum(1 for r in results if r["passed"])
            print(f"\n--- Summary: {passed}/{len(results)} passed ---")
            for r in results:
                print(f"  {'PASS' if r['passed'] else 'FAIL'}  {r['case_id']}")

            timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            out_path = RESULTS_DIR / f"{timestamp}_{run_label}.json"
            out_path.write_text(json.dumps(results, indent=2, default=str))
            print(f"Raw results written to {out_path}")

            if not args.no_firestore:
                doc_id = await write_eval_run_record(results, run_label)
                print(f"Firestore evalRuns/{doc_id} written")
    finally:
        await stop_http_client()


def main():
    parser = argparse.ArgumentParser(description="Run the Stage 4 eval golden set.")
    parser.add_argument("--case-ids", default=None, help="Comma-separated case ids to run (default: all).")
    parser.add_argument("--runs", type=int, default=1, help="Repeat the case set N times in a row.")
    parser.add_argument("--label", default="manual-run", help="Label stored on the Firestore evalRuns doc(s).")
    parser.add_argument("--no-firestore", action="store_true", help="Skip writing to Firestore evalRuns.")
    args = parser.parse_args()
    args.case_ids = args.case_ids.split(",") if args.case_ids else None
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
