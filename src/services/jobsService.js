import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { app, db } from "../lib/firebase";

export const JOB_CATEGORIES = [
  { id: "software-dev", label: "Software Dev" },
  { id: "devops-sysadmin", label: "DevOps" },
  { id: "data", label: "Data" },
  { id: "product", label: "Product" },
  { id: "design", label: "Design" },
];

const functions = getFunctions(app, "asia-south1");
const fetchJobsProxy = httpsCallable(functions, "fetchJobs");
const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs";

function toJobId(value) {
  return String(value || "").trim();
}

function normalizeJob(job, category) {
  const id = toJobId(job?.id);

  if (!id) {
    return null;
  }

  return {
    id,
    category,
    title: typeof job?.title === "string" ? job.title : null,
    companyName:
      typeof job?.companyName === "string"
        ? job.companyName
        : typeof job?.company_name === "string"
          ? job.company_name
          : null,
    location:
      typeof job?.location === "string"
        ? job.location
        : typeof job?.candidate_required_location === "string"
          ? job.candidate_required_location
          : null,
    jobType:
      typeof job?.jobType === "string"
        ? job.jobType
        : typeof job?.job_type === "string"
          ? job.job_type
          : null,
    salary: typeof job?.salary === "string" ? job.salary : null,
    tags: Array.isArray(job?.tags)
      ? [...new Set(job.tags.map((tag) => String(tag || "").trim()).filter(Boolean))]
      : [],
    url: typeof job?.url === "string" ? job.url : null,
    publishedAt:
      typeof job?.publishedAt === "string"
        ? job.publishedAt
        : typeof job?.publication_date === "string"
          ? job.publication_date
          : null,
    logoUrl:
      typeof job?.logoUrl === "string"
        ? job.logoUrl
        : typeof job?.company_logo === "string"
          ? job.company_logo
          : null,
  };
}

async function fetchJobsDirectly(categoryId) {
  const url = new URL(REMOTIVE_API_URL);
  url.searchParams.set("category", categoryId);
  url.searchParams.set("limit", "30");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Remotive fallback failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const jobs = Array.isArray(payload?.jobs)
    ? payload.jobs.map((job) => normalizeJob(job, categoryId)).filter(Boolean)
    : [];

  return {
    category: categoryId,
    jobs,
    fetchedAt: new Date().toISOString(),
    source: "client-fallback",
  };
}

export async function getJobsFromProxy(category) {
  const categoryId = category?.id || category || JOB_CATEGORIES[0].id;

  try {
    const { data } = await fetchJobsProxy({ category: categoryId });
    return data || {};
  } catch (error) {
    console.error("fetchJobs callable failed, using direct fallback:", error);
    return fetchJobsDirectly(categoryId);
  }
}

export async function listSavedJobs(uid) {
  const snapshot = await getDocs(collection(db, "savedJobs", uid, "jobs"));
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
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
