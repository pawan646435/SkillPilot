import { httpsCallable, getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { app, db } from "../lib/firebase";
import { collection, getDocs, limit, query, where, orderBy } from "firebase/firestore";

const functions = getFunctions(app, "asia-south1");

if (import.meta.env.DEV) {
  connectFunctionsEmulator(functions, "localhost", 5001);
}

const runClashCodeFn = httpsCallable(functions, "runClashCode");
const submitClashAnswerFn = httpsCallable(functions, "submitClashAnswer");
const finalizeClashMatchFn = httpsCallable(functions, "finalizeClashMatch");
const generateClashQuestionsFn = httpsCallable(functions, "generateClashQuestions");
const joinClashRoomFn = httpsCallable(functions, "joinClashRoom");

export async function runClashCode(payload) {
  const { data } = await runClashCodeFn(payload);
  return data;
}

export async function submitClashAnswer(payload) {
  const { data } = await submitClashAnswerFn(payload);
  return data;
}

export async function finalizeClashMatch(payload) {
  const { data } = await finalizeClashMatchFn(payload);
  return data;
}

export async function generateClashQuestions(payload) {
  const { data } = await generateClashQuestionsFn(payload);
  return data?.questions || [];
}

export async function joinClashRoom(payload) {
  const { data } = await joinClashRoomFn(payload);
  return data;
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
