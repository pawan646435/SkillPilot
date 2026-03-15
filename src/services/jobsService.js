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

function toJobId(value) {
  return String(value || "").trim();
}

export async function getJobsFromProxy(category) {
  const categoryId = category?.id || category || JOB_CATEGORIES[0].id;
  const { data } = await fetchJobsProxy({ category: categoryId });
  return data || {};
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
