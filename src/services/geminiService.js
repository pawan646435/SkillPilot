const FETCH_NEWS_URL = "https://fetchnews-whrhzzz3ca-el.a.run.app";
const FETCH_GROQ_CHAT_URL = "https://fetchgroqchat-whrhzzz3ca-el.a.run.app";

function getErrorMessage(error, fallback) {
  return error?.message || error?.details?.message || fallback;
}

function stripJsonFences(text) {
  return String(text || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
}

async function callGroqProxy(messages) {
  try {
    const data = await postCallableJson(FETCH_GROQ_CHAT_URL, { messages }, "AI proxy request failed.");
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("Invalid AI proxy response.");
    }

    return content;
  } catch (error) {
    throw new Error(getErrorMessage(error, "AI proxy request failed."));
  }
}

async function postJson(url, payload, fallback) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  let text = "";

  try {
    data = await response.json();
  } catch {
    text = await response.text().catch(() => "");
  }

  if (!response.ok) {
    const message =
      data?.error?.details ||
      data?.error?.message ||
      data?.message ||
      text ||
      `${fallback} (HTTP ${response.status})`;
    throw new Error(message);
  }

  return data;
}

async function postCallableJson(url, payload, fallback) {
  const data = await postJson(url, { data: payload }, fallback);
  return data?.result ?? data?.data ?? data;
}

async function callStructuredAI(prompt) {
  const raw = await callGroqProxy([
    {
      role: "system",
      content: "Return only valid JSON. Do not add markdown, code fences, or explanatory text.",
    },
    { role: "user", content: prompt },
  ]);
  return stripJsonFences(raw);
}

function parseJsonResponse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallback);
  }
}

export async function getNewsFromProxy(category, query, pageNum = 1) {
  try {
    const data = await postCallableJson(
      FETCH_NEWS_URL,
      {
        category: category?.id || category || "technology",
        query: query || category?.query || "",
        pageNum,
      },
      "News proxy request failed."
    );

    return data || {};
  } catch (error) {
    throw new Error(getErrorMessage(error, "News proxy request failed."));
  }
}

export async function generateGeminiResponse(messages) {
  return callGroqProxy(messages);
}

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

  const text = await callStructuredAI(prompt);
  return parseJsonResponse(text, "Interview question proxy returned invalid JSON.");
}

export async function evaluateAnswer(question, answer, role, difficulty) {
  if (!answer || answer.trim().length < 5) {
    return {
      score: 0,
      feedback: "No answer was provided.",
      strengths: [],
      improvements: ["Always attempt to answer - even a partial answer shows thought process."],
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

  const text = await callStructuredAI(prompt);
  return parseJsonResponse(text, "Interview evaluation proxy returned invalid JSON.");
}

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

  const text = await callStructuredAI(prompt);
  return parseJsonResponse(text, "Final report proxy returned invalid JSON.");
}
