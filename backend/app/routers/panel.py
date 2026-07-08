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
from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

from app.dependencies.auth import DecodedUser, require_auth
from app.services import panel_agents
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
    question turn will take the Task 3 generic-fallback path."""
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
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    return {"session_id": session_ref.id, "status": "PANEL_ACTIVE", "resumed": False}


@router.post("/next-turn")
async def next_turn(body: NextTurnRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    """Advances the interview: figures out where we are in the plan from the
    turns already on record, then either generates the next agent's question,
    runs synthesis, or tells the caller it's the candidate's turn to answer."""
    await _get_owned_session(body.session_id, user.uid)

    turns = await panel_agents._get_turns_ordered(body.session_id)
    questions = [t for t in turns if t["type"] == "question"]
    evaluated_ids = {t.get("evaluatesTurnId") for t in turns if t["type"] == "evaluation"}

    if any(t["type"] == "synthesis" for t in turns):
        session_doc = await async_get(get_db().collection("interviewSessions").document(body.session_id))
        return {"action": "complete", "final_report": session_doc.to_dict().get("finalReport")}

    # The candidate owes an answer: the newest question has no evaluation yet.
    if questions and questions[-1]["id"] not in evaluated_ids:
        pending = questions[-1]
        return {
            "action": "awaiting_answer",
            "turn_id": pending["id"],
            "agent": pending["agent"],
            "question": pending["content"],
        }

    try:
        if len(questions) < len(_QUESTION_PLAN):
            agent = _QUESTION_PLAN[len(questions)]
            # turn_number is per-agent (technical Q2 is that agent's 2nd
            # question), which picks its 2nd retrieval query.
            turn_number = sum(1 for q in questions if q["agent"] == agent) + 1
            result = await _GENERATE[agent](body.session_id, turn_number)
            return {"action": "question", **result}

        result = await panel_agents.synthesize_final_report(body.session_id)
        return {"action": "synthesis", **result}
    except GroqError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


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
