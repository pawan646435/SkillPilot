import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const JOB_CATEGORIES = [
  { id: "software-dev", label: "Software Dev", role: "Software Engineer" },
  { id: "devops-sysadmin", label: "DevOps", role: "DevOps Engineer" },
  { id: "data", label: "Data", role: "Data Analyst" },
  { id: "product", label: "Product", role: "Product Manager" },
  { id: "design", label: "Design", role: "Product Designer" },
];

// ── Client-side cache (localStorage) ──
const CLIENT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getClientCache(category) {
  try {
    const raw = localStorage.getItem(`sp_jobs_${category}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CLIENT_CACHE_TTL_MS) {
      localStorage.removeItem(`sp_jobs_${category}`);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setClientCache(category, data) {
  try {
    localStorage.setItem(
      `sp_jobs_${category}`,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ── Fetch jobs from the FastAPI backend ──
export async function getJobsFromProxy(category) {
  const selectedCategory =
    typeof category === "object"
      ? category
      : JOB_CATEGORIES.find((item) => item.id === category) || JOB_CATEGORIES[0];

  // Check client-side cache first
  const cached = getClientCache(selectedCategory.id);
  if (cached && Array.isArray(cached.jobs) && cached.jobs.length > 0) {
    return { ...cached, source: "client-cache" };
  }

  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    const url = `${API_BASE_URL}/jobs?category=${encodeURIComponent(selectedCategory.id)}`;
    const response = await fetch(url, {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Job API error:", response.status, errorData);
      throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Cache successful responses with actual jobs
    if (Array.isArray(data.jobs) && data.jobs.length > 0) {
      setClientCache(selectedCategory.id, data);
    }

    return data;
  } catch (error) {
    console.error("fetchJobs failed:", error);
    return {
      category: selectedCategory.id,
      region: "india",
      role: selectedCategory.role,
      jobs: [],
      fetchedAt: null,
      source: "provider-unavailable",
    };
  }
}

export async function listSavedJobs(uid) {
  const snapshot = await getDocs(collection(db, "savedJobs", uid, "jobs"));
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

function toJobId(value) {
  return String(value || "").trim();
}

export async function saveJob(uid, job) {
  const jobId = toJobId(job?.id);

  if (!jobId) {
    throw new Error("Invalid job id.");
  }

  const jobRef = doc(db, "savedJobs", uid, "jobs", jobId);
  const existing = await getDoc(jobRef);

  if (existing.exists()) {
    return;
  }

  await setDoc(jobRef, {
    jobId,
    category: job?.category || null,
    title: job?.title || null,
    companyName: job?.companyName || null,
    location: job?.location || null,
    jobType: job?.jobType || null,
    url: job?.url || null,
    salary: job?.salary || null,
    tags: Array.isArray(job?.tags) ? job.tags : [],
    publishedAt: job?.publishedAt || null,
    savedAt: serverTimestamp(),
  });
}

export async function unsaveJob(uid, jobId) {
  await deleteDoc(doc(db, "savedJobs", uid, "jobs", toJobId(jobId)));
}
