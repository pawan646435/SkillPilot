import { auth, db } from "../lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function authHeaders() {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}

async function postJson(path, payload) {
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

export async function ingestInterviewContext(rawText, sourceType, sessionId) {
  return postJson("/rag/ingest", {
    session_id: sessionId ?? null,
    raw_text: rawText,
    source_type: sourceType,
  });
}

// Reads chunks directly via the Firestore client SDK (not the backend) —
// contextChunks read rules (firestore.rules) allow this for the owning uid.
// Dev-test-page use only; production retrieval goes through the backend's
// services/retrieval.py, not this direct client read.
export async function fetchSessionChunks(sessionId) {
  const chunksRef = collection(db, "interviewSessions", sessionId, "contextChunks");
  const snap = await getDocs(query(chunksRef, orderBy("order")));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
