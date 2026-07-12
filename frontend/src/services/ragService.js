import { auth } from "../lib/firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function authHeaders() {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}

export async function postJson(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `Request failed (HTTP ${response.status})`);
  }

  return data;
}

// Like postJson but for multipart/form-data bodies -- doesn't set
// Content-Type itself (the browser sets it, including the multipart
// boundary, only when left unset) but still carries the same Authorization
// header every other authenticated call here does.
async function postForm(path, formData) {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `Request failed (HTTP ${response.status})`);
  }

  return data;
}

// Ingests resume/job-description text for the AI Panel Interview flow
// (Stage 1 of the AI Interview Panel). source_type is validated by the
// backend but not currently branched on there -- always "resume" here since
// there's no UI-visible difference in behavior today.
export async function ingestPanelContext(rawText, sessionId) {
  return postJson("/rag/ingest", {
    session_id: sessionId ?? null,
    raw_text: rawText,
    source_type: "resume",
  });
}

// Ingests a resume/job-description FILE (PDF or DOCX) -- the backend
// extracts text server-side, then feeds it into the exact same
// chunk/embed pipeline ingestPanelContext above uses.
export async function ingestPanelContextFile(file, sessionId) {
  const formData = new FormData();
  formData.append("file", file);
  if (sessionId) formData.append("session_id", sessionId);
  return postForm("/rag/ingest-file", formData);
}
