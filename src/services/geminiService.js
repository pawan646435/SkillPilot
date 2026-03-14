// src/services/geminiService.js
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function callAI(prompt) {
  if (!GROQ_API_KEY) {
    throw new Error("Missing VITE_GROQ_API_KEY in .env file");
  }

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: "json_object" }
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error: ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  // Strip markdown code fences if model wraps JSON in them
  return raw.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();
}

/**
 * Generate the next interview question.
 * Returns: { question, topic, hint }
 */
export async function generateInterviewQuestion(role, difficulty, previousQA = []) {
  const history =
    previousQA.length > 0
      ? `\nPrevious questions already asked:\n${previousQA.map((qa, i) => `Q${i + 1}: ${qa.question}`).join("\n")}\n`
      : "";

  const prompt = `You are a senior technical interviewer at a top-tier tech company conducting a real interview.
Role being interviewed for: ${role}
Difficulty level: ${difficulty}
${history}
Ask the next interview question. Vary the topic from previous questions. Be concise and direct like a real interviewer.

You MUST respond ONLY with a valid JSON object. No explanation, no markdown, just JSON:
{
  "question": "the interview question here",
  "topic": "topic category (e.g. System Design, JavaScript, React, Algorithms, etc.)",
  "hint": "a subtle one-sentence hint if the candidate gets stuck"
}`;

  const text = await callAI(prompt);
  return JSON.parse(text);
}

/**
 * Evaluate a candidate's answer.
 * Returns: { score, feedback, strengths, improvements, modelAnswer }
 */
export async function evaluateAnswer(question, answer, role, difficulty) {
  if (!answer || answer.trim().length < 5) {
    return {
      score: 0,
      feedback: "No answer was provided.",
      strengths: [],
      improvements: ["Always attempt to answer — even a partial answer shows thought process."],
      modelAnswer: "A complete answer would address the key concepts of the question directly.",
    };
  }

  const prompt = `You are evaluating a candidate's interview answer. Be honest but fair.

Role: ${role}
Difficulty: ${difficulty}
Question: "${question}"
Candidate's Answer: "${answer}"

Score strictly on a scale of 0-10 where: 0=no answer, 3=very weak, 5=average, 7=good, 8=strong, 10=perfect.

You MUST respond ONLY with a valid JSON object. No explanation, no markdown, just JSON:
{
  "score": <number 0-10>,
  "feedback": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"],
  "modelAnswer": "<what a great answer would include in 2-3 sentences>"
}`;

  const text = await callAI(prompt);
  return JSON.parse(text);
}

/**
 * Generate a comprehensive final interview report.
 * Returns: { overallScore, grade, summary, topStrengths, criticalImprovements, hiringRecommendation, recommendationReason, nextSteps }
 */
export async function generateFinalReport(role, difficulty, allQA) {
  const qaBreakdown = allQA
    .map(
      (item, i) =>
        `Q${i + 1} [${item.topic}]: ${item.question}\nAnswer: ${item.answer || "(no answer)"}\nScore: ${item.score}/10`
    )
    .join("\n\n");

  const avgScore = allQA.reduce((sum, qa) => sum + (qa.score || 0), 0) / allQA.length;

  const prompt = `Generate a final interview performance report for a candidate.

Role: ${role}
Difficulty: ${difficulty}
Average Score: ${avgScore.toFixed(1)}/10
Number of Questions: ${allQA.length}

Full Q&A Breakdown:
${qaBreakdown}

You MUST respond ONLY with a valid JSON object. No explanation, no markdown, just JSON:
{
  "overallScore": <number 0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "<3-4 sentence overall assessment of the candidate's performance>",
  "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "criticalImprovements": ["<area 1>", "<area 2>", "<area 3>"],
  "hiringRecommendation": "<Strong Hire / Hire / Consider / No Hire>",
  "recommendationReason": "<1-2 sentence justification>",
  "nextSteps": ["<resource or action 1>", "<resource or action 2>", "<resource or action 3>"]
}`;

  const text = await callAI(prompt);
  return JSON.parse(text);
}