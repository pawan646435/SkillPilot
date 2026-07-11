"""The three AI Interview Panel agents (Stage 2 of the RAG pipeline).

This is the first code that actually *calls* Stage 1's
retrieve_relevant_chunks() — Stage 1 built ingestion + retrieval and left
them unwired on purpose.

Three personas, two fundamentally different information sources:

- **technical** and **hiring_manager** ground their questions in the
  candidate's RESUME: each retrieves chunks from the session's
  contextChunks (Stage 1's embeddings) using its *own* queries — the
  technical interviewer searches for architecture/project substance, the
  hiring manager for leadership/collaboration language. Same chunk store,
  different query vectors, therefore (often) different chunks.
- **panel_lead** never retrieves at all. Its input is the interview
  TRANSCRIPT (the turns subcollection this module writes), which at
  synthesis time is small enough to hand to the LLM whole. Retrieval
  exists to select a few relevant pieces from a store that's too big to
  inject entirely; the transcript has no such problem, so retrieving over
  it would only risk dropping parts of the very conversation the lead is
  supposed to weigh. Hence retrievedChunkIds is always [] on panel_lead
  turns.

Every turn written here is tagged promptVersion=PROMPT_VERSION so that when
prompts change later, stored turns remain attributable to the exact prompt
that produced them (Stage 4's evals will compare quality across versions).
"""
import asyncio

from firebase_admin import firestore

from app.services import groq_client
from app.services.firestore_client import async_get, get_db
from app.services.retrieval import retrieve_relevant_chunks

PROMPT_VERSION = "panel-v1"

# Minimum cosine similarity the TOP retrieved chunk must clear before any
# chunk text is injected into a prompt. Below this, the "best match" is
# indistinguishable from noise, so injecting it would ground the question in
# text that merely *happens* to be the least-unrelated chunk. Instead we fall
# back to a generic (non-resume-grounded) question and record
# usedFallback=True on the turn.
#
# 0.15 was measured, not guessed (Stage 2 tuning run, 2026-07-09, emulator):
# against the test resume, on-topic queries scored 0.19-0.47; against a
# leadership-free API changelog (a genuine bad match), every agent query
# scored between -0.10 and 0.12. 0.15 sits in the gap between those two
# clusters. Known limit of all-MiniLM-L6-v2: an irrelevant-but-resume-flavored
# query (Stage 1's cooking control) scored 0.1651 here and clears the bar —
# this threshold catches "the document has nothing in this territory", not
# fine-grained irrelevance (a retrieval-tuned embedding model would be the
# production fix — see Stage 1 doc §9). Re-tune the same way if the embedding
# model or chunking ever changes.
MIN_TOP_SIMILARITY = 0.15

_RETRIEVAL_TOP_K = 2

# Each resume-grounded agent cycles through its own retrieval queries, one
# per question turn (turn 1 -> queries[0], turn 2 -> queries[1], ...).
# Phrased as full questions rather than keyword lists: measured against the
# same test resume, question phrasing scored higher on 3 of 4 queries (e.g.
# "technical projects/technologies" 0.2456 -> 0.2839 as a question) because
# the model was trained on sentence-to-sentence similarity, and resume prose
# is closer to a question's shape than to a keyword list's.
AGENT_RETRIEVAL_QUERIES: dict[str, list[str]] = {
    "technical": [
        "What distributed systems, architecture, and system design work has this person done?",
        "What programming languages, databases, and technologies has this person worked with?",
    ],
    "hiring_manager": [
        "Does this candidate have experience leading, mentoring, or managing a team?",
        "Has this person handled disagreement, conflict, or difficult situations with colleagues?",
    ],
}

_PERSONA_SYSTEM_PROMPTS = {
    "technical": (
        "You are the Technical Interviewer on a three-person interview panel. "
        "You assess depth of engineering skill: architecture decisions, tradeoffs, "
        "debugging instincts, and whether claimed experience holds up under probing. "
        "You are direct and specific, like a senior engineer, not a quiz machine."
    ),
    "hiring_manager": (
        "You are the Hiring Manager on a three-person interview panel. "
        "You assess how this person operates with other humans: leadership, "
        "collaboration, communication, conflict, and ownership. You ask "
        "behavioral questions ('tell me about a time...'), not technical ones."
    ),
    "panel_lead": (
        "You are the Panel Lead of a three-person interview panel. You did not ask "
        "questions yourself; your job is to weigh the full interview transcript — the "
        "Technical Interviewer's and Hiring Manager's questions, the candidate's "
        "answers, and each interviewer's evaluation — into one final, decisive "
        "hiring recommendation."
    ),
}


def _question_user_prompt(agent: str, context_block: str, previous_questions: list[str]) -> str:
    """Builds the user-role prompt for a question turn. context_block is either
    real retrieved resume excerpts or the fallback instruction."""
    history = ""
    if previous_questions:
        lines = "\n".join(f"- {q}" for q in previous_questions)
        history = f"\nYou already asked this candidate:\n{lines}\nDo not repeat these topics.\n"

    focus = (
        "technical question probing the specific experience shown"
        if agent == "technical"
        else "behavioral question probing the specific experience shown"
    )

    return f"""{context_block}
{history}
Ask your next interview question: ONE {focus}. If resume excerpts are provided above, ground the question in a concrete detail from them (name the project/technology/situation, like a real interviewer who read the resume). Keep it to 1-3 sentences.

You MUST respond ONLY with a valid JSON object:
{{
  "question": "the question text",
  "topic": "short topic label"
}}"""


def _context_block(chunks: list[dict]) -> str:
    if not chunks:
        # Fallback (Task 3): nothing in the resume matched this agent's query
        # well enough to trust. A generic question beats a question "grounded"
        # in an irrelevant excerpt.
        return (
            "No sufficiently relevant resume content was found for this topic. "
            "Ask a strong generic question for a software engineering candidate "
            "instead — do NOT pretend to reference their resume."
        )
    excerpts = "\n\n".join(f"[Resume excerpt {i + 1}]\n{c['text']}" for i, c in enumerate(chunks))
    return f"Relevant excerpts from the candidate's resume:\n\n{excerpts}"


def _evaluation_user_prompt(agent: str, question: str, answer: str) -> str:
    lens = (
        "technical depth, correctness, and specificity"
        if agent == "technical"
        else "leadership, collaboration, communication, and ownership signals"
    )
    return f"""You asked the candidate:
"{question}"

The candidate answered:
"{answer}"

Evaluate this answer through your lens ({lens}). Score 0-10 where 0=no answer, 3=very weak, 5=average, 7=good, 8=strong, 10=exceptional.

You MUST respond ONLY with a valid JSON object:
{{
  "score": <number 0-10>,
  "feedback": "<2-3 sentence assessment>",
  "strengths": ["<strength>", "..."],
  "concerns": ["<concern>", "..."]
}}"""


def _turns_ref(session_id: str):
    return get_db().collection("interviewSessions").document(session_id).collection("turns")


async def _get_turns_ordered(session_id: str) -> list[dict]:
    """All turns for a session, oldest first. Ordered by the explicit
    turnIndex we write (not createdAt) so ordering never depends on
    server-timestamp resolution."""
    docs = await async_get(_turns_ref(session_id))
    turns = [{"id": doc.id, **doc.to_dict()} for doc in docs]
    turns.sort(key=lambda t: t["turnIndex"])
    return turns


async def _write_turn(session_id: str, data: dict) -> str:
    """Appends a turn doc with the next turnIndex and returns its id."""
    turns_ref = _turns_ref(session_id)
    existing = await async_get(turns_ref)
    doc_ref = turns_ref.document()
    await asyncio.to_thread(
        doc_ref.set,
        {
            **data,
            "turnIndex": len(existing),
            "promptVersion": PROMPT_VERSION,
            "createdAt": firestore.SERVER_TIMESTAMP,
        },
    )
    return doc_ref.id


async def prepare_question_turn(session_id: str, agent: str, turn_number: int) -> dict:
    """Everything a question turn needs BEFORE the LLM speaks: pick this
    agent's retrieval query, retrieve, apply the similarity threshold, and
    collect the agent's previous questions. Split out of _generate_question
    in Stage 3 so the streaming endpoint runs the identical retrieval/
    fallback logic without duplicating it — same inputs in, same grounding
    decisions out, regardless of how the completion is then fetched."""
    queries = AGENT_RETRIEVAL_QUERIES[agent]
    query = queries[(turn_number - 1) % len(queries)]

    retrieved = await retrieve_relevant_chunks(session_id, query, top_k=_RETRIEVAL_TOP_K)

    # Task 3 (Stage 2): trust retrieval only if its single best match clears
    # the noise floor. Chunks below the threshold are dropped even when the
    # top passes, so a strong #1 never drags an unrelated #2 into the prompt.
    used_fallback = not retrieved or retrieved[0]["similarity"] < MIN_TOP_SIMILARITY
    chunks = [] if used_fallback else [c for c in retrieved if c["similarity"] >= MIN_TOP_SIMILARITY]

    previous_questions = [
        t["content"] for t in await _get_turns_ordered(session_id)
        if t["agent"] == agent and t["type"] == "question"
    ]

    return {
        "agent": agent,
        "query": query,
        "retrieved": retrieved,
        "chunks": chunks,
        "used_fallback": used_fallback,
        "previous_questions": previous_questions,
    }


async def persist_question_turn(session_id: str, prep: dict, question: str, topic: str) -> dict:
    """Writes the question turn doc — the single Firestore write for this
    turn, shared verbatim by the buffered and streaming paths so both
    produce identically-shaped documents. For the streaming path this runs
    only after the full stream has been consumed: the turns collection IS
    the orchestrator's state, so a turn must either fully exist or not
    exist at all — a partial question written mid-stream would advance the
    interview past a question the candidate never saw."""
    retrieved = prep["retrieved"]
    chunks = prep["chunks"]

    turn_id = await _write_turn(session_id, {
        "agent": prep["agent"],
        "type": "question",
        "content": question,
        "topic": topic,
        "retrievedChunkIds": [c["id"] for c in chunks],
        "usedFallback": prep["used_fallback"],
        "retrievalQuery": prep["query"],
        "topSimilarity": retrieved[0]["similarity"] if retrieved else None,
    })

    return {
        "turn_id": turn_id,
        "agent": prep["agent"],
        "type": "question",
        "question": question,
        "topic": topic,
        "used_fallback": prep["used_fallback"],
        "retrieval_query": prep["query"],
        # Full retrieval detail (including rejected chunks' scores) goes back
        # to the caller for the dev test page; only the injected chunks' IDs
        # are persisted on the turn itself.
        "retrieved_chunks": [
            {"id": c["id"], "similarity": c["similarity"], "injected": c in chunks, "text": c["text"]}
            for c in retrieved
        ],
    }


def question_messages(prep: dict) -> list[dict]:
    """Prompt messages for the buffered (JSON-mode) question call."""
    return [
        {"role": "system", "content": _PERSONA_SYSTEM_PROMPTS[prep["agent"]]},
        {"role": "user", "content": _question_user_prompt(
            prep["agent"], _context_block(prep["chunks"]), prep["previous_questions"])},
    ]


def question_messages_plain(prep: dict) -> list[dict]:
    """Prompt messages for the STREAMING question call: identical persona,
    context block, and history — only the response-format instruction
    differs (plain text instead of a JSON object), because streaming JSON
    syntax character-by-character at a user is unreadable. Known trade-off:
    no topic label comes back on this path (streamed turns store topic="");
    both paths still tag promptVersion=panel-v1 even though this format
    instruction differs — a production system would version the variant."""
    base = _question_user_prompt(prep["agent"], _context_block(prep["chunks"]), prep["previous_questions"])
    # Swap the JSON-format contract for a plain-text one.
    plain = base.split("You MUST respond ONLY with")[0].rstrip()
    plain += "\n\nRespond with ONLY the question text itself — no JSON, no preamble, no quotes."
    return [
        {"role": "system", "content": _PERSONA_SYSTEM_PROMPTS[prep["agent"]]},
        {"role": "user", "content": plain},
    ]


async def _generate_question(session_id: str, agent: str, turn_number: int) -> dict:
    """Buffered question-turn pipeline (Stage 2 behavior, unchanged):
    prepare (retrieve + threshold) -> Groq JSON call -> persist turn."""
    prep = await prepare_question_turn(session_id, agent, turn_number)

    data = await groq_client.fetch_groq_json(question_messages(prep))

    question = str(data.get("question", "")).strip()
    if not question:
        raise groq_client.GroqError("Model returned an empty question.", 500)

    return await persist_question_turn(session_id, prep, question, str(data.get("topic", "")))


async def _evaluate_answer(session_id: str, question_turn_id: str, candidate_answer: str, agent: str) -> dict:
    """Shared evaluation pipeline: persist the candidate's answer as an
    'answer' turn, have the same persona that asked the question score it,
    persist the 'evaluation' turn. Evaluations judge the answer against the
    question alone — no resume retrieval, so retrievedChunkIds stays []."""
    question_doc = await async_get(_turns_ref(session_id).document(question_turn_id))
    if not question_doc.exists:
        raise ValueError("Question turn not found.")
    question_turn = question_doc.to_dict()
    if question_turn["agent"] != agent or question_turn["type"] != "question":
        raise ValueError("Turn is not a question asked by this agent.")

    # The 'agent' on answer turns records whose question is being answered
    # (the lane), since the speaker is always the candidate.
    await _write_turn(session_id, {
        "agent": agent,
        "type": "answer",
        "content": candidate_answer,
        "answersTurnId": question_turn_id,
        "retrievedChunkIds": [],
    })

    data = await groq_client.fetch_groq_json([
        {"role": "system", "content": _PERSONA_SYSTEM_PROMPTS[agent]},
        {"role": "user", "content": _evaluation_user_prompt(agent, question_turn["content"], candidate_answer)},
    ])

    score = max(0, min(10, int(data.get("score", 0))))
    feedback = str(data.get("feedback", ""))

    turn_id = await _write_turn(session_id, {
        "agent": agent,
        "type": "evaluation",
        "content": feedback,
        "score": score,
        "strengths": data.get("strengths", []),
        "concerns": data.get("concerns", []),
        "evaluatesTurnId": question_turn_id,
        "retrievedChunkIds": [],
    })

    return {
        "turn_id": turn_id,
        "agent": agent,
        "type": "evaluation",
        "score": score,
        "feedback": feedback,
        "strengths": data.get("strengths", []),
        "concerns": data.get("concerns", []),
    }


async def generate_technical_question(session_id: str, turn_number: int) -> dict:
    return await _generate_question(session_id, "technical", turn_number)


async def evaluate_technical_answer(session_id: str, turn_id: str, candidate_answer: str) -> dict:
    return await _evaluate_answer(session_id, turn_id, candidate_answer, "technical")


async def generate_hiring_manager_question(session_id: str, turn_number: int) -> dict:
    return await _generate_question(session_id, "hiring_manager", turn_number)


async def evaluate_hiring_manager_answer(session_id: str, turn_id: str, candidate_answer: str) -> dict:
    return await _evaluate_answer(session_id, turn_id, candidate_answer, "hiring_manager")


def _transcript_line(turn: dict) -> str:
    speaker = {
        "question": f"{turn['agent'].replace('_', ' ').title()} asked",
        "answer": "Candidate answered",
        "evaluation": f"{turn['agent'].replace('_', ' ').title()} scored it {turn.get('score', '?')}/10",
    }[turn["type"]]
    return f"{speaker}: {turn['content']}"


async def synthesize_final_report(session_id: str) -> dict:
    """Panel Lead: reads the FULL turns transcript in order and produces one
    weighted final report in a single Groq call. No retrieve_relevant_chunks
    here — the input is the transcript, not the resume, and the whole
    transcript fits in the prompt (see module docstring)."""
    turns = await _get_turns_ordered(session_id)
    qa_turns = [t for t in turns if t["type"] in ("question", "answer", "evaluation")]
    if not any(t["type"] == "evaluation" for t in qa_turns):
        raise ValueError("Nothing to synthesize: no evaluated answers yet.")

    transcript = "\n\n".join(_transcript_line(t) for t in qa_turns)

    prompt = f"""Here is the full interview transcript, in order:

{transcript}

Produce the panel's final report. Weight the tracks explicitly: technical competence 60%, leadership/collaboration/culture 40%. Be decisive — pick one recommendation.

You MUST respond ONLY with a valid JSON object:
{{
  "hireRecommendation": "<Strong Hire / Hire / Consider / No Hire>",
  "technicalSummary": "<2-3 sentences on the technical track>",
  "culturalFitSummary": "<2-3 sentences on the leadership/collaboration track>",
  "overallScore": <number 0-100, using the 60/40 weighting>
}}"""

    data = await groq_client.fetch_groq_json([
        {"role": "system", "content": _PERSONA_SYSTEM_PROMPTS["panel_lead"]},
        {"role": "user", "content": prompt},
    ])

    report = {
        "hireRecommendation": str(data.get("hireRecommendation", "")),
        "technicalSummary": str(data.get("technicalSummary", "")),
        "culturalFitSummary": str(data.get("culturalFitSummary", "")),
        "overallScore": max(0, min(100, int(data.get("overallScore", 0)))),
        "synthesizedBy": "panel_lead",
    }

    turn_id = await _write_turn(session_id, {
        "agent": "panel_lead",
        "type": "synthesis",
        "content": f"{report['hireRecommendation']} ({report['overallScore']}/100)",
        "retrievedChunkIds": [],  # reads the transcript above, not the resume
    })

    session_ref = get_db().collection("interviewSessions").document(session_id)
    await asyncio.to_thread(
        session_ref.set,
        {
            "finalReport": {**report, "createdAt": firestore.SERVER_TIMESTAMP},
            "status": "PANEL_COMPLETE",
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    return {"turn_id": turn_id, "agent": "panel_lead", "type": "synthesis", "report": report}
