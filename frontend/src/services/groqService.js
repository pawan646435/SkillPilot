import { auth } from "../lib/firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function getErrorMessage(error, fallback) {
  return error?.message || error?.details?.message || fallback;
}

async function authHeaders() {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}

async function postJson(path, payload, fallback) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
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
    const message = data?.detail || data?.message || text || `${fallback} (HTTP ${response.status})`;
    throw new Error(typeof message === "string" ? message : fallback);
  }

  return data;
}

export async function getNewsFromProxy(category, query, pageNum = 1) {
  try {
    const data = await postJson(
      "/news",
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

// Generic passthrough for the full Groq response envelope. Not currently
// called by any page — kept only so this export's signature keeps working
// for any future/external caller, backed by POST /interview/raw-chat.
export async function generateGroqResponse(messages) {
  try {
    return await postJson("/interview/raw-chat", { messages }, "AI proxy request failed.");
  } catch (error) {
    throw new Error(getErrorMessage(error, "AI proxy request failed."));
  }
}

export async function generateInterviewQuestion(role, difficulty, previousQA = [], questionType = "subjective") {
  try {
    return await postJson(
      "/interview/question",
      {
        role,
        difficulty,
        previousQA: previousQA.map((qa) => ({ question: qa.question })),
        questionType,
      },
      "Interview question proxy returned invalid JSON."
    );
  } catch (error) {
    throw new Error(getErrorMessage(error, "Interview question proxy returned invalid JSON."));
  }
}

export async function evaluateAnswer(question, answer, role, difficulty, questionType = "subjective", correctAnswer = null) {
  // ── MCQ: instant evaluation without AI call ──
  if (questionType === "mcq") {
    const isCorrect = correctAnswer && answer && answer.trim() === correctAnswer.trim();
    return {
      score: isCorrect ? 10 : 0,
      feedback: isCorrect
        ? "Correct! You selected the right answer."
        : `Incorrect. The correct answer was: "${correctAnswer || "(unknown)"}".`,
      strengths: isCorrect ? ["Picked the correct option"] : [],
      improvements: isCorrect ? [] : ["Review this topic and understand why the correct answer is right"],
      modelAnswer: correctAnswer || "",
    };
  }

  // ── Subjective: no answer submitted, skip the AI call ──
  if (!answer || answer.trim().length < 5) {
    return {
      score: 0,
      feedback: "No answer was provided.",
      strengths: [],
      improvements: ["Always attempt to answer - even a partial answer shows thought process."],
      modelAnswer: "A complete answer would address the key concepts of the question directly.",
    };
  }

  try {
    return await postJson(
      "/interview/evaluate",
      { question, answer, role, difficulty },
      "Interview evaluation proxy returned invalid JSON."
    );
  } catch (error) {
    throw new Error(getErrorMessage(error, "Interview evaluation proxy returned invalid JSON."));
  }
}

export async function generateFinalReport(role, difficulty, allQA) {
  try {
    return await postJson(
      "/interview/report",
      {
        role,
        difficulty,
        allQA: allQA.map((qa) => ({
          question: qa.question,
          topic: qa.topic,
          answer: qa.answer,
          score: qa.score,
        })),
      },
      "Final report proxy returned invalid JSON."
    );
  } catch (error) {
    throw new Error(getErrorMessage(error, "Final report proxy returned invalid JSON."));
  }
}
