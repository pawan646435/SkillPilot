"""Code Clash: run/submit/finalize/generate/join — Python port of clash.js.

Room state and the clashQuestions bank still live in Firestore, read/written
here via the firebase-admin Python SDK exactly as the Node handlers did via
firebase-admin (Node). The AI question generation flow (prompt -> sanitize ->
run the reference solution against its own test cases -> persist) is ported
1:1, including the self-validation step.
"""
import json
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

from app.config import GROQ_MODEL
from app.dependencies.auth import DecodedUser, require_auth
from app.services import groq_client
from app.services.firestore_client import async_add, async_get, async_set, async_update, get_db
from app.services.judge import MAX_CODE_SIZE, SUPPORTED_LANGUAGES, evaluate_submission

router = APIRouter(prefix="/clash", tags=["clash"])

SUPPORTED_STACKS = {"DSA", "FRONTEND", "BACKEND", "SYSTEM_DESIGN", "JAVASCRIPT", "PYTHON", "DEVOPS"}
SUPPORTED_DIFFICULTIES = {"EASY", "MEDIUM", "HARD"}
MAX_GENERATION_COUNT = 10
MAX_GENERATION_ATTEMPTS = 5


# ── Request/response models ──

class RunSubmitRequest(BaseModel):
    roomId: str
    questionId: str
    code: str
    language: str = "javascript"


class JudgeCase(BaseModel):
    index: int
    passed: bool
    hidden: bool
    error: str | None = None
    output: Any = None
    expected: Any = None


class JudgeResult(BaseModel):
    passed: int
    total: int
    elapsedMs: int
    points: int
    cases: list[JudgeCase]


class RunSubmitResponse(BaseModel):
    success: bool = True
    mode: str
    result: JudgeResult


class FinalizeRequest(BaseModel):
    roomId: str


class FinalizeResponse(BaseModel):
    success: bool = True
    winnerUid: str | None
    player1Score: int
    player2Score: int


class GenerateQuestionsRequest(BaseModel):
    stack: str = "DSA"
    difficulty: str = "MEDIUM"
    language: str = "javascript"
    count: int = 1


class GeneratedQuestion(BaseModel):
    id: str
    title: str
    description: str
    stack: str
    difficulty: str
    tags: list[str]
    starterCode: dict
    source: str
    generator: dict


class GenerateQuestionsResponse(BaseModel):
    success: bool = True
    questions: list[GeneratedQuestion]


class JoinRoomRequest(BaseModel):
    roomId: str


class JoinRoomResponse(BaseModel):
    success: bool = True
    role: str
    room: dict


# ── Helpers (ported from clash.js) ──

def _get_default_starter_code(language: str) -> str:
    if language == "python":
        return "def solution(*args):\n    return None\n"
    if language == "java":
        return "public class Solution {\n  public Object solution(Object... args) {\n    return null;\n  }\n}\n"
    if language == "cpp":
        return (
            "#include <iostream>\n#include <vector>\n#include <string>\n\n"
            'std::string solution(const std::vector<std::string>& args) { return ""; }'
        )
    return "function solution(...args) {\n  return null;\n}\n"


def _normalize_tags(tags: Any) -> list[str]:
    if not isinstance(tags, list):
        return []
    seen = []
    for tag in tags:
        cleaned = str(tag or "").strip().upper()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
        if len(seen) >= 8:
            break
    return seen


_STACK_GUIDANCE = {
    "DSA": "Generate algorithmic problems focused on arrays, strings, hash maps, sorting, binary search, trees, graphs, stacks, queues, or dynamic programming.",
    "FRONTEND": "Generate UI logic coding problems. Focus on data transformation, component state logic, DOM tree algorithms, handling tree structures like JSON, array filtering, pagination logic, or string parsing. Do NOT use DOM APIs; keep it pure JS logic.",
    "BACKEND": "Generate backend logic problems. Focus on API response transformations, request rate limiting logic, data aggregation algorithms, SQL query simulation, or building trees from flattened DB rows.",
    "SYSTEM_DESIGN": "Generate systems logic problems. Focus on distributed tracing IDs, consistent hashing simulation, retry algorithms with exponential backoff, load balancer routing, or cache eviction like LRU/LFU.",
    "DEVOPS": "Generate DevOps logic problems. Focus on parsing cron expressions, CIDR subnet matching, parsing log file formats, sorting semantic versions, calculating uptime percentiles, or YAML tree traversal.",
    "JAVASCRIPT": "Generate pure-function coding problems inspired by JavaScript concepts like objects, arrays, closures, string parsing, async-style task ordering, or data transformation. Do not require DOM, browser APIs, events, or npm packages.",
    "PYTHON": "Generate pure-function coding problems inspired by Python-style data processing with lists, dictionaries, tuples, counters, parsing, or iteration patterns. Do not require files, stdin, or external modules.",
}


def _get_generation_prompt(stack: str, difficulty: str, language: str, count: int) -> str:
    return f"""You are generating live coding battle questions for a head-to-head coding arena.

Return ONLY valid JSON with no markdown and no explanation.

Output schema:
{{
  "questions": [
    {{
      "title": "short question title",
      "description": "full problem statement with examples or constraints. It must explicitly say the player should implement a function named solution.",
      "tags": ["UPPERCASE_TAG"],
      "starterCode": "starter code in {language} defining a function named solution",
      "referenceSolution": "correct {language} code defining a function named solution",
      "testCases": [
        {{
          "input": ["arg1", "arg2"],
          "expected": "expected value",
          "isHidden": false
        }}
      ]
    }}
  ]
}}

Requirements:
- Generate exactly {count} unique questions.
- Difficulty must be {difficulty}.
- Stack/topic must be {stack}.
- The execution language is {language}.
- Every question must be solvable as a pure function.
- No randomness, network, filesystem, DOM, browser APIs, databases, stdin, stdout parsing, or external packages.
- Keep each problem deterministic and judge-friendly.
- Every test case input MUST be an array of function arguments.
- If the function takes a single array argument, the input must be nested, for example [[1,2,3]].
- Include at least 3 test cases per question.
- Include at least 1 visible test case and at least 1 hidden test case per question.
- The referenceSolution must pass every generated test case.
- starterCode should be minimal and valid, but not already solved.

Topic guidance:
{_STACK_GUIDANCE.get(stack, _STACK_GUIDANCE["DSA"])}"""


def _sanitize_generated_question(raw_question: dict, stack: str, difficulty: str, language: str) -> dict:
    if not isinstance(raw_question, dict):
        raise ValueError("Question payload must be an object.")

    title = str(raw_question.get("title") or "").strip()
    description = str(raw_question.get("description") or "").strip()
    starter_code = str(raw_question.get("starterCode") or "").strip() or _get_default_starter_code(language)
    reference_solution = str(raw_question.get("referenceSolution") or "").strip()
    test_cases = raw_question.get("testCases") if isinstance(raw_question.get("testCases"), list) else []

    if not title:
        raise ValueError("Question title is required.")
    if not description:
        raise ValueError("Question description is required.")
    if not reference_solution:
        raise ValueError("Question reference solution is required.")
    if len(test_cases) < 3:
        raise ValueError("Question must include at least 3 test cases.")
    if not re.search(r"\bsolution\b", starter_code):
        raise ValueError("Starter code must define a solution function.")
    if not re.search(r"\bsolution\b", reference_solution):
        raise ValueError("Reference solution must define a solution function.")

    normalized_cases = []
    for index, test_case in enumerate(test_cases):
        if not isinstance(test_case, dict):
            raise ValueError(f"Test case {index + 1} is invalid.")
        if "input" not in test_case:
            raise ValueError(f"Test case {index + 1} is missing input.")
        if "expected" not in test_case:
            raise ValueError(f"Test case {index + 1} is missing expected output.")
        if not isinstance(test_case["input"], list):
            raise ValueError(f"Test case {index + 1} input must be an array of function arguments.")

        normalized_cases.append({
            "input": test_case["input"],
            "expected": test_case["expected"],
            "isHidden": bool(test_case.get("isHidden")),
        })

    if not any(not case["isHidden"] for case in normalized_cases):
        raise ValueError("Question must include at least one visible test case.")
    if not any(case["isHidden"] for case in normalized_cases):
        raise ValueError("Question must include at least one hidden test case.")

    return {
        "title": title,
        "description": description,
        "stack": stack,
        "difficulty": difficulty,
        "tags": _normalize_tags(raw_question.get("tags")),
        "starterCode": {language: starter_code},
        "testCases": normalized_cases,
        "referenceSolution": reference_solution,
        "source": "AI",
        "generator": {"provider": "GROQ", "model": GROQ_MODEL, "language": language},
    }


async def _validate_generated_question(question: dict, language: str) -> None:
    result = await evaluate_submission(language, question["referenceSolution"], question["testCases"])
    if result["passed"] != result["total"]:
        raise ValueError("Reference solution did not pass generated test cases.")


async def _store_generated_question(question: dict, uid: str) -> dict:
    db = get_db()
    payload = {
        "title": question["title"],
        "description": question["description"],
        "stack": question["stack"],
        "difficulty": question["difficulty"],
        "tags": question["tags"],
        "starterCode": question["starterCode"],
        "testCases": [
            {
                "input": json.dumps(tc["input"]),
                "expected": json.dumps(tc["expected"]),
                "isHidden": bool(tc["isHidden"]),
            }
            for tc in question["testCases"]
        ],
        "source": question["source"],
        "generator": question["generator"],
        "createdBy": uid,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    _, doc_ref = await async_add(db.collection("clashQuestions"), payload)
    return {
        "id": doc_ref.id,
        "title": payload["title"],
        "description": payload["description"],
        "stack": payload["stack"],
        "difficulty": payload["difficulty"],
        "tags": payload["tags"],
        "starterCode": payload["starterCode"],
        "source": payload["source"],
        "generator": payload["generator"],
    }


async def _generate_clash_questions_batch(stack: str, difficulty: str, language: str, count: int, uid: str) -> list[dict]:
    generated: list[dict] = []
    seen_titles: set[str] = set()

    for _attempt in range(MAX_GENERATION_ATTEMPTS):
        if len(generated) >= count:
            break

        remaining = count - len(generated)
        response = await groq_client.fetch_groq_json(
            [
                {"role": "system", "content": "Return only valid JSON. Do not use markdown or code fences."},
                {"role": "user", "content": _get_generation_prompt(stack, difficulty, language, remaining)},
            ],
            temperature=0.4,
            max_tokens=8000,
        )

        questions = response.get("questions") if isinstance(response.get("questions"), list) else []

        for raw_question in questions:
            if len(generated) >= count:
                break
            try:
                question = _sanitize_generated_question(raw_question, stack, difficulty, language)
                title_key = question["title"].upper()
                if title_key in seen_titles:
                    continue

                await _validate_generated_question(question, language)
                stored = await _store_generated_question(question, uid)
                generated.append(stored)
                seen_titles.add(title_key)
            except Exception as exc:  # noqa: BLE001 - mirrors the Node try/catch-and-skip loop
                print("Skipping invalid generated clash question:", exc)

    if not generated:
        raise HTTPException(status_code=500, detail="AI could not generate a valid clash question right now.")

    return generated


async def _load_question(question_id: str) -> dict:
    db = get_db()
    snap = await async_get(db.collection("clashQuestions").document(question_id))
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Question not found.")

    question = snap.to_dict()
    if not isinstance(question.get("testCases"), list) or not question["testCases"]:
        raise HTTPException(status_code=412, detail="Question has no test cases.")

    return question


async def _assert_room_membership(room_id: str, uid: str):
    db = get_db()
    room_ref = db.collection("battles").document(room_id)
    room_snap = await async_get(room_ref)
    if not room_snap.exists:
        raise HTTPException(status_code=404, detail="Room not found.")

    room = room_snap.to_dict()
    is_player1 = (room.get("player1") or {}).get("uid") == uid
    is_player2 = (room.get("player2") or {}).get("uid") == uid
    if not is_player1 and not is_player2:
        raise HTTPException(status_code=403, detail="You are not part of this room.")

    return room_ref, room


def _get_room_questions_for_client(room: dict) -> list[dict]:
    questions = room.get("questions") if isinstance(room.get("questions"), list) else []
    return [
        {
            "id": q.get("id", ""),
            "title": q.get("title", "Untitled"),
            "description": q.get("description", ""),
            "difficulty": q.get("difficulty", "MEDIUM"),
            "tags": q.get("tags") if isinstance(q.get("tags"), list) else [],
            "starterCode": q.get("starterCode") if isinstance(q.get("starterCode"), dict) else {},
        }
        for q in questions
    ]


def _sanitize_room_for_client(room: dict, room_id: str) -> dict:
    return {
        "roomId": room_id,
        "status": room.get("status", "WAITING"),
        "config": room.get("config") or {},
        "questions": _get_room_questions_for_client(room),
        "player1": room.get("player1"),
        "player2": room.get("player2"),
        "scores": room.get("scores") or {},
        "currentQuestionIndex": int(room.get("currentQuestionIndex") or 0),
    }


def _validate_run_submit(body: RunSubmitRequest):
    if not body.roomId or not body.questionId or not body.code:
        raise HTTPException(status_code=400, detail="roomId, questionId, and code are required.")
    if body.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language.")
    if len(body.code) > MAX_CODE_SIZE:
        raise HTTPException(status_code=400, detail="Code is too large or invalid.")


# ── Routes ──

@router.post("/run", response_model=RunSubmitResponse)
async def run_clash_code(body: RunSubmitRequest, user: DecodedUser = Depends(require_auth)):
    _validate_run_submit(body)
    await _assert_room_membership(body.roomId, user.uid)
    question = await _load_question(body.questionId)
    result = await evaluate_submission(body.language, body.code, question["testCases"])
    return RunSubmitResponse(mode="run", result=result)


@router.post("/submit", response_model=RunSubmitResponse)
async def submit_clash_answer(body: RunSubmitRequest, user: DecodedUser = Depends(require_auth)):
    _validate_run_submit(body)
    room_ref, _room = await _assert_room_membership(body.roomId, user.uid)
    question = await _load_question(body.questionId)
    result = await evaluate_submission(body.language, body.code, question["testCases"])

    await async_update(room_ref, {
        f"submissions.{user.uid}.{body.questionId}": {
            "code": body.code,
            "language": body.language,
            "passed": result["passed"],
            "total": result["total"],
            "elapsedMs": result["elapsedMs"],
            "points": result["points"],
            "submittedAt": firestore.SERVER_TIMESTAMP,
        },
        f"scores.{user.uid}": firestore.Increment(result["points"]),
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    return RunSubmitResponse(mode="submit", result=result)


@router.post("/finalize", response_model=FinalizeResponse)
async def finalize_clash_match(body: FinalizeRequest, user: DecodedUser = Depends(require_auth)):
    room_ref, room = await _assert_room_membership(body.roomId, user.uid)

    player1_uid = (room.get("player1") or {}).get("uid")
    player2_uid = (room.get("player2") or {}).get("uid")
    if not player1_uid or not player2_uid:
        raise HTTPException(status_code=412, detail="Both players must be present to finalize.")

    scores = room.get("scores") or {}
    p1_score = int(scores.get(player1_uid, 0))
    p2_score = int(scores.get(player2_uid, 0))

    winner_uid = None
    if p1_score > p2_score:
        winner_uid = player1_uid
    elif p2_score > p1_score:
        winner_uid = player2_uid

    await async_set(
        room_ref,
        {
            "status": "FINISHED",
            "result": {
                "winnerUid": winner_uid,
                "player1Score": p1_score,
                "player2Score": p2_score,
                "finalizedAt": firestore.SERVER_TIMESTAMP,
            },
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    return FinalizeResponse(winnerUid=winner_uid, player1Score=p1_score, player2Score=p2_score)


@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
async def generate_clash_questions(body: GenerateQuestionsRequest, user: DecodedUser = Depends(require_auth)):
    if body.stack not in SUPPORTED_STACKS:
        raise HTTPException(status_code=400, detail="Unsupported clash stack.")
    if body.difficulty not in SUPPORTED_DIFFICULTIES:
        raise HTTPException(status_code=400, detail="Unsupported clash difficulty.")
    if body.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported clash language.")

    normalized_count = max(1, min(body.count, MAX_GENERATION_COUNT))
    questions = await _generate_clash_questions_batch(body.stack, body.difficulty, body.language, normalized_count, user.uid)
    return GenerateQuestionsResponse(questions=questions)


@router.post("/join", response_model=JoinRoomResponse)
async def join_clash_room(body: JoinRoomRequest, user: DecodedUser = Depends(require_auth)):
    db = get_db()
    room_ref = db.collection("battles").document(body.roomId)
    room_snap = await async_get(room_ref)
    if not room_snap.exists:
        raise HTTPException(status_code=404, detail="Room not found.")

    room = room_snap.to_dict()
    room_language = (room.get("config") or {}).get("language", "javascript")
    room_questions = _get_room_questions_for_client(room)
    initial_code = (
        (room_questions[0].get("starterCode") or {}).get(room_language) if room_questions else None
    ) or _get_default_starter_code(room_language)

    if (room.get("player1") or {}).get("uid") == user.uid:
        return JoinRoomResponse(role="player1", room=_sanitize_room_for_client(room, body.roomId))

    if (room.get("player2") or {}).get("uid") == user.uid:
        return JoinRoomResponse(role="player2", room=_sanitize_room_for_client(room, body.roomId))

    if room.get("status") != "WAITING" or room.get("player2"):
        raise HTTPException(status_code=412, detail="Room is not available to join.")

    display_name = user.name or "Hacker 2"
    await async_update(room_ref, {
        "status": "BATTLE",
        "player2": {
            "uid": user.uid,
            "name": display_name,
            "code": initial_code,
            "language": room_language,
        },
        f"scores.{user.uid}": 0,
        "battleStartedAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    updated_snap = await async_get(room_ref)
    updated_room = updated_snap.to_dict()
    return JoinRoomResponse(role="player2", room=_sanitize_room_for_client(updated_room, body.roomId))
