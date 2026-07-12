// AI Interview Panel endpoints (Stage 2 + Stage 3 streaming). Same auth
// pattern as ragService: every call carries the caller's Firebase ID token;
// the backend's require_auth + session-uid check does the real access control.
import { auth } from "../lib/firebase";
import { postJson } from "./ragService";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function startPanel(sessionId, experienceLevel) {
  return postJson("/panel/start", {
    session_id: sessionId ?? null,
    experience_level: experienceLevel ?? null,
  });
}

export async function nextTurn(sessionId) {
  return postJson("/panel/next-turn", { session_id: sessionId });
}

export async function submitAnswer(sessionId, turnId, answer) {
  return postJson("/panel/submit-answer", {
    session_id: sessionId,
    turn_id: turnId,
    answer,
  });
}

// Stage 3: streaming next-turn. Uses fetch()+ReadableStream, NOT the
// EventSource API — EventSource can't send an Authorization header (its
// constructor takes only a URL, and it only issues GETs), and this app's
// entire auth model is "Firebase ID token in the Authorization header"
// (see authHeaders() in every service file). fetch() sends the exact same
// headers as every other authenticated call here; the only difference is
// we read response.body incrementally instead of awaiting response.json().
//
// onEvent(event) is called once per SSE frame, in order, with the parsed
// JSON object: {type: "meta"|"delta"|"done"|"action"|"error", ...}.
// Returns the final "done"/"action" event (or throws on HTTP/stream error).
export async function nextTurnStream(sessionId, onEvent) {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);

  const response = await fetch(`${API_BASE_URL}/panel/next-turn/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  if (!response.ok) {
    // Pre-stream failures (401 auth, 404 session) are plain JSON errors —
    // the backend only switches to SSE once all request-time checks pass.
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || `Request failed (HTTP ${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent = null;

  // TCP reads don't align with SSE frames — a chunk can end mid-frame — so
  // accumulate into a buffer and only parse frames that are provably
  // complete (terminated by the \n\n frame delimiter). The unterminated
  // tail stays in the buffer for the next read.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop(); // last piece may be incomplete — keep it

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data: ")) continue;
      const event = JSON.parse(line.slice("data: ".length));
      if (event.type === "error") {
        throw new Error(event.detail || "Stream failed.");
      }
      onEvent(event);
      if (event.type === "done" || event.type === "action") {
        finalEvent = event;
      }
    }
  }

  if (!finalEvent) {
    throw new Error("Stream ended without completing.");
  }
  return finalEvent;
}
