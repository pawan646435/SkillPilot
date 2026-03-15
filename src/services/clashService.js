import { httpsCallable, getFunctions } from "firebase/functions";
import { app, db } from "../lib/firebase";
import { collection, getDocs, limit, query, where, orderBy } from "firebase/firestore";

const functions = getFunctions(app, "asia-south1");

const runClashCodeFn = httpsCallable(functions, "runClashCode");
const submitClashAnswerFn = httpsCallable(functions, "submitClashAnswer");
const finalizeClashMatchFn = httpsCallable(functions, "finalizeClashMatch");

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

export async function fetchClashQuestions({ stack, difficulty, count }) {
  const constraints = [];

  if (stack) {
    constraints.push(where("stack", "==", stack));
  }

  if (difficulty) {
    constraints.push(where("difficulty", "==", difficulty));
  }

  constraints.push(orderBy("createdAt", "desc"));

  constraints.push(limit(Math.max(1, Math.min(Number(count) || 1, 10))));

  const q = query(collection(db, "clashQuestions"), ...constraints);
  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
