"""AI Interview Panel orchestration endpoints (Stage 2).

This router is the hand-rolled state machine that decides "who speaks next".
The plan is fixed and sequential:

    technical Q1 -> answer -> hiring_manager Q1 -> answer ->
    technical Q2 -> answer -> hiring_manager Q2 -> answer -> synthesis

Rather than storing a cursor on the session doc, /panel/next-turn *derives*
the current position from the turns subcollection itself (how many questions
exist, whether the latest one has an evaluation). The transcript is the
state — there's no second copy to drift out of sync with it.

Deliberately NOT a framework (LangGraph etc.): the entire orchestration
problem here is "walk a fixed list, don't skip the answer step", which is an
if/else over a count. A graph framework would hide exactly the part Stage 2
exists to teach.

The old single-agent flow in routers/interview.py is untouched; this is a
new, additive surface.
"""
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from firebase_admin import firestore
from pydantic import BaseModel

from app.dependencies.auth import DecodedUser, require_auth
from app.services import groq_client, panel_agents
from app.services.firestore_client import async_get, async_set, get_db
from app.services.groq_client import GroqError

router = APIRouter(prefix="/panel", tags=["panel"])

# The fixed interview plan: which agent asks the Nth question. After all of
# these are asked AND answered, the only remaining step is synthesis.
_QUESTION_PLAN = ["technical", "hiring_manager", "technical", "hiring_manager"]

_GENERATE = {
    "technical": panel_agents.generate_technical_question,
    "hiring_manager": panel_agents.generate_hiring_manager_question,
}
_EVALUATE = {
    "technical": panel_agents.evaluate_technical_answer,
    "hiring_manager": panel_agents.evaluate_hiring_manager_answer,
}


class StartRequest(BaseModel):
    session_id: str | None = None
    experience_level: Literal["fresher", "experienced"] | None = None


class NextTurnRequest(BaseModel):
    session_id: str


class SubmitAnswerRequest(BaseModel):
    session_id: str
    turn_id: str
    answer: str


async def _get_owned_session(session_id: str, uid: str):
    """Loads a session, 404ing identically for 'missing' and 'not yours'
    (same non-revealing pattern as routers/rag.py)."""
    session_ref = get_db().collection("interviewSessions").document(session_id)
    doc = await async_get(session_ref)
    if not doc.exists or doc.to_dict().get("uid") != uid:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session_ref, doc.to_dict()


@router.post("/start")
async def start_panel(body: StartRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    """Marks a session as an active panel interview. Reuses a session that
    /rag/ingest already populated with resume chunks when session_id is
    passed; otherwise creates a fresh (context-less) session, in which every
    question turn will take the Task 3 generic-fallback path.

    experience_level is set once here and read back by panel_agents.py's
    prepare_question_turn on every subsequent question turn -- resuming an
    already-PANEL_ACTIVE session (the early return below) intentionally
    does NOT let a later call change it mid-interview."""
    db = get_db()

    if body.session_id:
        session_ref, session = await _get_owned_session(body.session_id, user.uid)
        if session.get("status") == "PANEL_ACTIVE":
            return {"session_id": session_ref.id, "status": "PANEL_ACTIVE", "resumed": True}
    else:
        session_ref = db.collection("interviewSessions").document()

    await async_set(session_ref, {
        "uid": user.uid,
        "status": "PANEL_ACTIVE",
        "panelPlan": _QUESTION_PLAN,
        "promptVersion": panel_agents.PROMPT_VERSION,
        "experienceLevel": body.experience_level or panel_agents.DEFAULT_EXPERIENCE_LEVEL,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    return {
        "session_id": session_ref.id,
        "status": "PANEL_ACTIVE",
        "resumed": False,
        "experience_level": body.experience_level or panel_agents.DEFAULT_EXPERIENCE_LEVEL,
    }


async def _derive_position(session_id: str) -> dict:
    """Reads the turns transcript and decides what happens next — the shared
    brain of /next-turn and /next-turn/stream. Returns one of:
      {"kind": "complete"}                        — synthesis already exists
      {"kind": "awaiting_answer", "pending": t}   — newest question unanswered
      {"kind": "question", "agent", "turn_number"} — next planned question
      {"kind": "synthesis"}                        — plan exhausted, wrap up
    """
    turns = await panel_agents._get_turns_ordered(session_id)
    questions = [t for t in turns if t["type"] == "question"]
    evaluated_ids = {t.get("evaluatesTurnId") for t in turns if t["type"] == "evaluation"}

    if any(t["type"] == "synthesis" for t in turns):
        return {"kind": "complete"}

    # The candidate owes an answer: the newest question has no evaluation yet.
    if questions and questions[-1]["id"] not in evaluated_ids:
        return {"kind": "awaiting_answer", "pending": questions[-1]}

    if len(questions) < len(_QUESTION_PLAN):
        agent = _QUESTION_PLAN[len(questions)]
        # turn_number is per-agent (technical Q2 is that agent's 2nd
        # question), which picks its 2nd retrieval query.
        turn_number = sum(1 for q in questions if q["agent"] == agent) + 1
        return {"kind": "question", "agent": agent, "turn_number": turn_number}

    return {"kind": "synthesis"}


@router.post("/next-turn")
async def next_turn(body: NextTurnRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    """Advances the interview: figures out where we are in the plan from the
    turns already on record, then either generates the next agent's question,
    runs synthesis, or tells the caller it's the candidate's turn to answer."""
    await _get_owned_session(body.session_id, user.uid)

    position = await _derive_position(body.session_id)

    if position["kind"] == "complete":
        session_doc = await async_get(get_db().collection("interviewSessions").document(body.session_id))
        return {"action": "complete", "final_report": session_doc.to_dict().get("finalReport")}

    if position["kind"] == "awaiting_answer":
        pending = position["pending"]
        return {
            "action": "awaiting_answer",
            "turn_id": pending["id"],
            "agent": pending["agent"],
            "question": pending["content"],
        }

    try:
        if position["kind"] == "question":
            result = await _GENERATE[position["agent"]](body.session_id, position["turn_number"])
            return {"action": "question", **result}

        result = await panel_agents.synthesize_final_report(body.session_id)
        return {"action": "synthesis", **result}
    except GroqError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


def _sse(event: dict) -> str:
    """One SSE frame: a `data:` line + the blank line that terminates the
    frame. Same wire format Groq sends us, now sent onward to the browser."""
    return f"data: {json.dumps(event)}\n\n"


@router.post("/next-turn/stream")
async def next_turn_stream(body: NextTurnRequest, user: DecodedUser = Depends(require_auth)):
    """Streaming twin of /next-turn (Stage 3). Same auth dependency, same
    ownership check, same position derivation — auth and orchestration are
    request-time concerns and don't care that the response will trickle out.

    Only the question-generation case actually streams. The other actions
    (awaiting_answer / synthesis / complete) return as a single SSE event:
    they're either instant lookups or (synthesis) a JSON-mode call that
    can't be streamed readably — see the Stage 3 doc for why that's left
    buffered for now.

    Event protocol (each `data:` line is one JSON object):
      {"type": "meta", ...}    first — who's speaking, retrieval detail
      {"type": "delta", "text": "..."}  zero or more — append to display
      {"type": "done", ...}    last on success — turn_id + full question
      {"type": "action", ...}  single event for the non-streaming cases
      {"type": "error", ...}   mid-stream failure (HTTP 200 already went out,
                               so errors after that point must ride inside
                               the stream — a status code can't be unsent)

    Everything before the StreamingResponse is constructed still raises
    plain HTTPExceptions (404 for missing/foreign sessions) exactly like
    the buffered endpoint — at that point no bytes have been sent, so
    normal error semantics still apply.
    """
    await _get_owned_session(body.session_id, user.uid)

    position = await _derive_position(body.session_id)

    async def event_stream():
        try:
            if position["kind"] == "complete":
                session_doc = await async_get(
                    get_db().collection("interviewSessions").document(body.session_id))
                yield _sse({"type": "action", "action": "complete",
                            "final_report": session_doc.to_dict().get("finalReport")})
                return

            if position["kind"] == "awaiting_answer":
                pending = position["pending"]
                yield _sse({"type": "action", "action": "awaiting_answer",
                            "turn_id": pending["id"], "agent": pending["agent"],
                            "question": pending["content"]})
                return

            if position["kind"] == "synthesis":
                result = await panel_agents.synthesize_final_report(body.session_id)
                # result's own "type" key ("synthesis", from synthesize_final_report's
                # turn-shaped return) must NOT win here -- the SSE envelope's "type"
                # has a different vocabulary (meta/delta/done/action/error) that
                # nextTurnStream() dispatches on. Spreading **result first, then
                # setting type/action explicitly after, prevents the dict-literal
                # collision that silently produced type="synthesis" instead of
                # type="action" here (found via a real end-to-end panel run that
                # completed all 4 turns but then hung waiting for a terminal event).
                yield _sse({**result, "type": "action", "action": "synthesis"})
                return

            # The streaming case: prepare (identical retrieval + threshold
            # logic to the buffered path), stream deltas as they arrive,
            # persist ONCE after the stream is fully consumed.
            prep = await panel_agents.prepare_question_turn(
                body.session_id, position["agent"], position["turn_number"])

            yield _sse({
                "type": "meta",
                "action": "question",
                "agent": prep["agent"],
                "used_fallback": prep["used_fallback"],
                "retrieval_query": prep["query"],
                "retrieved_chunks": [
                    {"id": c["id"], "similarity": c["similarity"],
                     "injected": c in prep["chunks"], "text": c["text"]}
                    for c in prep["retrieved"]
                ],
            })

            parts: list[str] = []
            async for delta in groq_client.stream_groq_content(
                    panel_agents.question_messages_plain(prep)):
                parts.append(delta)
                yield _sse({"type": "delta", "text": delta})

            question = "".join(parts).strip()
            if not question:
                yield _sse({"type": "error", "detail": "Model returned an empty question."})
                return

            # The single Firestore write. If the client disconnected above,
            # this generator was cancelled at a yield and never reaches here
            # — no partial turn is ever written (verified in the Stage 3
            # interruption test).
            result = await panel_agents.persist_question_turn(
                body.session_id, prep, question, topic="")

            yield _sse({"type": "done", "action": "question",
                        "turn_id": result["turn_id"], "agent": result["agent"],
                        "question": question, "used_fallback": result["used_fallback"]})

        except GroqError as exc:
            yield _sse({"type": "error", "detail": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        # Defensive: tell any proxy in the path not to buffer or cache the
        # stream (Cloud Run itself passes chunked responses through fine).
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/submit-answer")
async def submit_answer(body: SubmitAnswerRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    """Records the candidate's answer to a question turn and has the persona
    that asked it score it."""
    answer = body.answer.strip()
    if not answer:
        raise HTTPException(status_code=400, detail="answer must not be empty.")

    await _get_owned_session(body.session_id, user.uid)

    turn_doc = await async_get(panel_agents._turns_ref(body.session_id).document(body.turn_id))
    if not turn_doc.exists:
        raise HTTPException(status_code=404, detail="Turn not found.")
    turn = turn_doc.to_dict()
    if turn.get("type") != "question" or turn.get("agent") not in _EVALUATE:
        raise HTTPException(status_code=400, detail="Turn is not an answerable question.")

    turns = await panel_agents._get_turns_ordered(body.session_id)
    if any(t.get("evaluatesTurnId") == body.turn_id for t in turns if t["type"] == "evaluation"):
        raise HTTPException(status_code=409, detail="This question was already answered.")

    try:
        result = await _EVALUATE[turn["agent"]](body.session_id, body.turn_id, answer)
    except GroqError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"action": "evaluation", **result}
