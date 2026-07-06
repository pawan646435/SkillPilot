import { auth, db } from "../lib/firebase";
import { collection, getDocs, limit, query, where, orderBy } from "firebase/firestore";

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

export async function runClashCode(payload) {
  return postJson("/clash/run", payload);
}

export async function submitClashAnswer(payload) {
  return postJson("/clash/submit", payload);
}

export async function finalizeClashMatch(payload) {
  return postJson("/clash/finalize", payload);
}

export async function generateClashQuestions(payload) {
  const data = await postJson("/clash/generate-questions", payload);
  return data?.questions || [];
}

export async function joinClashRoom(payload) {
  return postJson("/clash/join", payload);
}

export async function fetchClashQuestions({ stack, difficulty, count }) {
  const constraints = [];

  if (stack) {
    constraints.push(where("stack", "==", stack));
  }

  if (difficulty) {
    constraints.push(where("difficulty", "==", difficulty));
  }

  constraints.push(orderBy("createdAt", "desc"));

  // Fetch up to 50 recent matching questions so we can shuffle and select randomly
  constraints.push(limit(50));

  const q = query(collection(db, "clashQuestions"), ...constraints);
  const snap = await getDocs(q);

  const allDocs = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  // Fisher-Yates shuffle to randomize questions
  for (let i = allDocs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allDocs[i], allDocs[j]] = [allDocs[j], allDocs[i]];
  }

  const requestedCount = Math.max(1, Math.min(Number(count) || 1, 10));
  return allDocs.slice(0, requestedCount);
}
