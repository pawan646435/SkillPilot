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
