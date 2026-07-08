// AI Interview Panel endpoints (Stage 2). Same auth pattern as ragService:
// every call carries the caller's Firebase ID token; the backend's
// require_auth + session-uid check does the real access control.
import { postJson } from "./ragService";

export async function startPanel(sessionId) {
  return postJson("/panel/start", { session_id: sessionId ?? null });
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
