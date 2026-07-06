"""submitAssessmentAnswer — Python port of functions/src/assessments.js.

Same run/submit split as Clash: `mode="run"` judges but never persists
(candidate test-driven feedback), `mode="submit"` judges, scores, and writes
to the `submissions` Firestore collection.
"""
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

from app.dependencies.auth import DecodedUser, require_auth
from app.services.firestore_client import async_add, async_get, get_db
from app.services.judge import MAX_CODE_SIZE, SUPPORTED_LANGUAGES, evaluate_submission

router = APIRouter(prefix="/assessments", tags=["assessments"])


class SubmitAssessmentAnswerRequest(BaseModel):
    assessmentId: str
    problemId: str
    code: str
    language: str = "javascript"
    mode: str = "submit"  # "run" | "submit"


class JudgeCase(BaseModel):
    index: int
    passed: bool
    hidden: bool
    error: str | None = None
    output: object = None
    expected: object = None


class SubmitAssessmentAnswerResponse(BaseModel):
    success: bool = True
    mode: str
    submissionId: str | None = None
    status: str
    score: int | None = None
    passed: int
    total: int
    executionTime: int
    cases: list[JudgeCase]


async def _load_problem(problem_id: str) -> dict:
    db = get_db()
    snap = await async_get(db.collection("problems").document(problem_id))
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Problem not found.")

    problem = snap.to_dict()
    if not isinstance(problem.get("testCases"), list) or not problem["testCases"]:
        raise HTTPException(status_code=412, detail="Problem has no test cases.")

    return problem


async def _load_assessment_problem_entry(assessment_id: str, problem_id: str) -> dict:
    db = get_db()
    snap = await async_get(db.collection("assessments").document(assessment_id))
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    assessment = snap.to_dict()
    entry = next((p for p in (assessment.get("problems") or []) if p.get("id") == problem_id), None)
    if not entry:
        raise HTTPException(status_code=412, detail="This problem is not part of the given assessment.")

    return entry


def _derive_status(result: dict) -> str:
    """Mirrors deriveStatus in assessments.js — common online-judge status conventions."""
    if result["total"] > 0 and result["passed"] == result["total"]:
        return "ACCEPTED"

    has_timeout = any(c.get("error") == "Execution timeout" for c in result["cases"])
    if has_timeout:
        return "TIME_LIMIT_EXCEEDED"

    has_runtime_error = any(c.get("error") and c.get("error") != "Execution timeout" for c in result["cases"])
    if has_runtime_error:
        return "RUNTIME_ERROR"

    return "WRONG_ANSWER"


@router.post("/submit", response_model=SubmitAssessmentAnswerResponse)
async def submit_assessment_answer(body: SubmitAssessmentAnswerRequest, user: DecodedUser = Depends(require_auth)):
    if not body.assessmentId or not body.problemId or not body.code:
        raise HTTPException(status_code=400, detail="assessmentId, problemId, and code are required.")
    if body.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language.")
    if len(body.code) > MAX_CODE_SIZE:
        raise HTTPException(status_code=400, detail="Code is too large or invalid.")

    # Independent reads (neither depends on the other's result) — run concurrently
    # instead of sequentially waiting on two separate Firestore round trips.
    problem, problem_entry = await asyncio.gather(
        _load_problem(body.problemId),
        _load_assessment_problem_entry(body.assessmentId, body.problemId),
    )

    result = await evaluate_submission(body.language, body.code, problem["testCases"])
    status = _derive_status(result)

    if body.mode == "run":
        return SubmitAssessmentAnswerResponse(
            mode="run",
            status=status,
            passed=result["passed"],
            total=result["total"],
            executionTime=result["elapsedMs"],
            cases=result["cases"],
        )

    max_marks = int(problem_entry.get("marks") or 10)
    score = max_marks if status == "ACCEPTED" else round((result["passed"] / max(result["total"], 1)) * max_marks)

    db = get_db()
    submission_payload = {
        "assessmentId": body.assessmentId,
        "problemId": body.problemId,
        "candidateId": user.uid,
        "candidateName": user.name or "Unknown",
        "code": body.code,
        "language": body.language,
        "status": status,
        "score": score,
        "executionTime": result["elapsedMs"],
        "passed": result["passed"],
        "total": result["total"],
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    _, submission_ref = await async_add(db.collection("submissions"), submission_payload)

    return SubmitAssessmentAnswerResponse(
        mode="submit",
        submissionId=submission_ref.id,
        status=status,
        score=score,
        passed=result["passed"],
        total=result["total"],
        executionTime=result["elapsedMs"],
        cases=result["cases"],
    )
