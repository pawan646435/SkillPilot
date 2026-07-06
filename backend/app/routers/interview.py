"""AI Interview question generation, answer evaluation, and final report.

Ported from the prompt-building logic that used to live client-side in
groqService.js (generateInterviewQuestion/evaluateAnswer/generateFinalReport),
which called the generic fetchGroqChat proxy. Moving the actual prompt
construction server-side means the frontend just sends typed request bodies
instead of shipping prompt strings over the wire — see Task 4 note on
Pydantic models replacing untyped onCall payloads.

MCQ-answer grading and "no answer submitted" short-circuits stay client-side
(groqService.js) since they're pure local comparisons that never called Groq
to begin with — porting them here would just add a network round trip for
something that needs no AI call and no secret.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies.auth import DecodedUser, require_auth
from app.services import groq_client

router = APIRouter(prefix="/interview", tags=["interview"])


class PreviousQA(BaseModel):
    question: str


class QuestionRequest(BaseModel):
    role: str
    difficulty: str
    previousQA: list[PreviousQA] = Field(default_factory=list)
    questionType: str = "subjective"  # "subjective" | "mcq"


class QuestionResponse(BaseModel):
    question: str
    topic: str
    hint: str = ""
    options: list[str] | None = None
    correctAnswer: str | None = None


class EvaluateRequest(BaseModel):
    question: str
    answer: str
    role: str
    difficulty: str


class EvaluateResponse(BaseModel):
    score: int
    feedback: str
    strengths: list[str]
    improvements: list[str]
    modelAnswer: str


class QAItem(BaseModel):
    question: str
    topic: str = ""
    answer: str | None = None
    score: float = 0


class ReportRequest(BaseModel):
    role: str
    difficulty: str
    allQA: list[QAItem]


class ReportResponse(BaseModel):
    overallScore: int
    grade: str
    summary: str
    topStrengths: list[str]
    criticalImprovements: list[str]
    hiringRecommendation: str
    recommendationReason: str
    nextSteps: list[str]


class RawChatRequest(BaseModel):
    messages: list[dict]


def _build_question_prompt(role: str, difficulty: str, previous_qa: list[PreviousQA], question_type: str) -> str:
    history = ""
    if previous_qa:
        lines = "\n".join(f"Q{i + 1}: {qa.question}" for i, qa in enumerate(previous_qa))
        history = f"\nPrevious questions already asked:\n{lines}\n"

    if question_type == "mcq":
        return f"""You are a senior technical interviewer at a top-tier tech company conducting a real interview.
Role being interviewed for: {role}
Difficulty level: {difficulty}
{history}
Create the next multiple-choice interview question. Vary the topic from previous questions.
Provide exactly 4 answer options. Only one must be correct.

You MUST respond ONLY with a valid JSON object. No explanation, no markdown, just JSON:
{{
  "question": "the interview question here",
  "topic": "topic category (e.g. System Design, JavaScript, React, Algorithms, etc.)",
  "hint": "a subtle one-sentence hint if the candidate is unsure",
  "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
  "correctAnswer": "the exact text of the correct option from options array"
}}"""

    return f"""You are a senior technical interviewer at a top-tier tech company conducting a real interview.
Role being interviewed for: {role}
Difficulty level: {difficulty}
{history}
Ask the next interview question. Vary the topic from previous questions. Be concise and direct like a real interviewer.

You MUST respond ONLY with a valid JSON object. No explanation, no markdown, just JSON:
{{
  "question": "the interview question here",
  "topic": "topic category (e.g. System Design, JavaScript, React, Algorithms, etc.)",
  "hint": "a subtle one-sentence hint if the candidate gets stuck"
}}"""


def _build_evaluate_prompt(question: str, answer: str, role: str, difficulty: str) -> str:
    return f"""You are evaluating a candidate's interview answer. Be honest but fair.

Role: {role}
Difficulty: {difficulty}
Question: "{question}"
Candidate's Answer: "{answer}"

Score strictly on a scale of 0-10 where: 0=no answer, 3=very weak, 5=average, 7=good, 8=strong, 10=perfect.

You MUST respond ONLY with a valid JSON object. No explanation, no markdown, just JSON:
{{
  "score": <number 0-10>,
  "feedback": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"],
  "modelAnswer": "<what a great answer would include in 2-3 sentences>"
}}"""


def _build_report_prompt(role: str, difficulty: str, all_qa: list[QAItem]) -> str:
    qa_breakdown = "\n\n".join(
        f'Q{i + 1} [{qa.topic}]: {qa.question}\nAnswer: {qa.answer or "(no answer)"}\nScore: {qa.score}/10'
        for i, qa in enumerate(all_qa)
    )
    avg_score = sum(qa.score for qa in all_qa) / len(all_qa) if all_qa else 0

    return f"""Generate a final interview performance report for a candidate.

Role: {role}
Difficulty: {difficulty}
Average Score: {avg_score:.1f}/10
Number of Questions: {len(all_qa)}

Full Q&A Breakdown:
{qa_breakdown}

You MUST respond ONLY with a valid JSON object. No explanation, no markdown, just JSON:
{{
  "overallScore": <number 0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "<3-4 sentence overall assessment of the candidate's performance>",
  "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "criticalImprovements": ["<area 1>", "<area 2>", "<area 3>"],
  "hiringRecommendation": "<Strong Hire / Hire / Consider / No Hire>",
  "recommendationReason": "<1-2 sentence justification>",
  "nextSteps": ["<resource or action 1>", "<resource or action 2>", "<resource or action 3>"]
}}"""


async def _call_structured(prompt: str) -> dict:
    """Mirrors groqService.js's callStructuredAI + parseJsonResponse: no
    response_format enforcement (the original fetchGroqChatHandler never set
    one), just a strong prompt instruction plus fence-stripping on our side."""
    content = await groq_client.fetch_groq_content(
        [
            {"role": "system", "content": "Return only valid JSON. Do not add markdown, code fences, or explanatory text."},
            {"role": "user", "content": prompt},
        ]
    )
    cleaned = groq_client.strip_json_fences(content)
    import json
    return json.loads(cleaned)


@router.post("/question", response_model=QuestionResponse)
async def generate_question(body: QuestionRequest, user: DecodedUser = Depends(require_auth)):
    prompt = _build_question_prompt(body.role, body.difficulty, body.previousQA, body.questionType)
    data = await _call_structured(prompt)
    return QuestionResponse(
        question=data.get("question", ""),
        topic=data.get("topic", ""),
        hint=data.get("hint", ""),
        options=data.get("options"),
        correctAnswer=data.get("correctAnswer"),
    )


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_answer(body: EvaluateRequest, user: DecodedUser = Depends(require_auth)):
    prompt = _build_evaluate_prompt(body.question, body.answer, body.role, body.difficulty)
    data = await _call_structured(prompt)
    return EvaluateResponse(
        score=int(data.get("score", 0)),
        feedback=data.get("feedback", ""),
        strengths=data.get("strengths", []),
        improvements=data.get("improvements", []),
        modelAnswer=data.get("modelAnswer", ""),
    )


@router.post("/report", response_model=ReportResponse)
async def generate_report(body: ReportRequest, user: DecodedUser = Depends(require_auth)):
    prompt = _build_report_prompt(body.role, body.difficulty, body.allQA)
    data = await _call_structured(prompt)
    return ReportResponse(
        overallScore=int(data.get("overallScore", 0)),
        grade=data.get("grade", ""),
        summary=data.get("summary", ""),
        topStrengths=data.get("topStrengths", []),
        criticalImprovements=data.get("criticalImprovements", []),
        hiringRecommendation=data.get("hiringRecommendation", ""),
        recommendationReason=data.get("recommendationReason", ""),
        nextSteps=data.get("nextSteps", []),
    )


@router.post("/raw-chat")
async def raw_chat(body: RawChatRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    """Generic passthrough returning the full Groq response envelope, mirroring
    the original groq.js fetchGroqChatHandler exactly. Not called by any
    current page — kept only because groqService.js's generateGroqResponse
    export must keep working unchanged per the migration's frontend-signature
    constraint."""
    return await groq_client.fetch_groq_chat(body.messages)
