import { startTransition, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  BriefcaseBusiness,
  Building2,
  Clock3,
  Database,
  Loader2,
  MapPin,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  JOB_CATEGORIES,
  getJobsFromProxy,
  listSavedJobs,
  saveJob,
  unsaveJob,
} from "../services/jobsService";

function formatPublishedAt(value) {
  if (!value) {
    return "Recently posted";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently posted";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFetchedAt(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isIndiaJob(job) {
  const location = String(job?.location || "").toLowerCase();

  if (!location) {
    return false;
  }

  return (
    location.includes("india") ||
    location.includes("remote - india") ||
    location.includes("remote in india") ||
    location.includes("india only") ||
    location.includes("indian")
  );
}

function JobsSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-[320px] rounded-[28px] border border-white/5 bg-white/[0.03] animate-pulse"
        />
      ))}
    </div>
  );
}

function JobsEmpty({ categoryLabel, indiaOnly }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
        <BriefcaseBusiness className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-2xl font-semibold text-white font-display">
        No jobs found right now
      </h3>
      <p className="mx-auto max-w-xl text-sm leading-7 text-neutral-400">
        {indiaOnly
          ? `There are no cached ${categoryLabel} roles for India right now. Try all locations or switch to another category.`
          : `There are no cached ${categoryLabel} roles at the moment. Try again in a few minutes or switch to another category.`}
      </p>
    </div>
  );
}

function JobCard({ job, index, isSaved, saving, onToggleSave }) {
  return (
    <Motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="group flex h-full flex-col rounded-[28px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.25)] backdrop-blur-sm transition-colors duration-300 hover:border-emerald-400/20 hover:bg-white/[0.05]"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              {job.logoUrl ? (
                <img src={job.logoUrl} alt={job.companyName || "Company"} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-5 w-5 text-neutral-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-emerald-300">
                {job.companyName || "Unknown company"}
              </p>
              <p className="truncate text-xs uppercase tracking-[0.2em] text-neutral-500">
                Source: Remotive
              </p>
            </div>
          </div>

          <h3 className="line-clamp-2 text-xl font-semibold leading-tight text-white font-display">
            {job.title || "Untitled role"}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => onToggleSave(job)}
          disabled={saving}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
            isSaved
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white"
          } ${saving ? "opacity-70" : ""}`}
          aria-label={isSaved ? "Unsave job" : "Save job"}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSaved ? (
            <BookmarkCheck className="h-4 w-4" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="mb-5 grid gap-3 text-sm text-neutral-300">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-neutral-500" />
          <span className="line-clamp-1">{job.location || "Remote"}</span>
        </div>
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-neutral-500" />
          <span>{job.jobType || "Role type not listed"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-neutral-500" />
          <span>{formatPublishedAt(job.publishedAt)}</span>
        </div>
      </div>

      {job.salary && (
        <div className="mb-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200">
          {job.salary}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {job.tags?.length ? (
          job.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-400"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">
            No tags listed
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <p className="text-xs leading-6 text-neutral-500">
          Remote listing syndicated from Remotive.
        </p>
        <a
          href={job.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
        >
          Apply
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </Motion.article>
  );
}

export default function Jobs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [savedJobIds, setSavedJobIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingJobId, setSavingJobId] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [activeCategory, setActiveCategory] = useState(JOB_CATEGORIES[0]);
  const [indiaOnly, setIndiaOnly] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || null);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSavedJobs() {
      if (!user?.uid) {
        if (active) {
          setSavedJobIds({});
        }
        return;
      }

      try {
        const savedJobs = await listSavedJobs(user.uid);

        if (!active) {
          return;
        }

        setSavedJobIds(
          savedJobs.reduce((accumulator, job) => {
            accumulator[job.jobId || job.id] = true;
            return accumulator;
          }, {})
        );
      } catch {
        if (active) {
          setSavedJobIds({});
        }
      }
    }

    loadSavedJobs();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    async function loadJobs() {
      setLoading(true);
      setError(null);

      try {
        const data = await getJobsFromProxy(activeCategory.id);

        if (!active) {
          return;
        }

        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setLastFetchedAt(data.fetchedAt || null);
        setDataSource(data.source || null);
      } catch (fetchError) {
        if (active) {
          setError(fetchError.message || "Failed to load jobs.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadJobs();

    return () => {
      active = false;
    };
  }, [activeCategory]);

  const savedCount = useMemo(
    () => Object.values(savedJobIds).filter(Boolean).length,
    [savedJobIds]
  );

  const visibleJobs = useMemo(
    () => (indiaOnly ? jobs.filter(isIndiaJob) : jobs),
    [indiaOnly, jobs]
  );

  async function handleToggleSave(job) {
    if (!user?.uid) {
      navigate(`/login?redirect=${encodeURIComponent("/jobs")}`);
      return;
    }

    const jobId = String(job?.id || "").trim();

    if (!jobId) {
      return;
    }

    setSavingJobId(jobId);

    try {
      if (savedJobIds[jobId]) {
        await unsaveJob(user.uid, jobId);
        setSavedJobIds((current) => {
          const next = { ...current };
          delete next[jobId];
          return next;
        });
      } else {
        await saveJob(user.uid, job);
        setSavedJobIds((current) => ({
          ...current,
          [jobId]: true,
        }));
      }
    } catch (saveError) {
      setError(saveError.message || "Failed to update saved jobs.");
    } finally {
      setSavingJobId(null);
    }
  }

  function handleCategoryChange(category) {
    if (category.id === activeCategory.id) {
      return;
    }

    startTransition(() => {
      setActiveCategory(category);
    });
  }

  async function handleRetry() {
    setLoading(true);
    setError(null);

    try {
      const data = await getJobsFromProxy(activeCategory.id);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      setLastFetchedAt(data.fetchedAt || null);
      setDataSource(data.source || null);
    } catch (fetchError) {
      setError(fetchError.message || "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-6 pb-24 pt-14">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.15),transparent_28%)]" />

      <div className="relative mx-auto max-w-7xl">
        <section className="mb-10 rounded-[36px] border border-white/8 bg-white/[0.03] px-6 py-10 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl md:px-10">
          <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-mono uppercase tracking-[0.22em] text-emerald-300">
                <Database className="h-3.5 w-3.5" />
                Live cache + Remotive feed
              </div>
              <h1 className="mb-4 text-4xl font-semibold tracking-tight text-white font-display md:text-6xl">
                Discover remote tech roles without leaving SkillPilot.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-neutral-300 md:text-lg">
                Browse curated remote openings across engineering, DevOps, data,
                product, and design. Jobs are served through Firebase-backed cache
                refreshes for fast responses and smoother browsing.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-black/20 px-5 py-4">
                <p className="mb-1 text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-500">
                  Latest refresh
                </p>
                <p className="text-sm text-white">{formatFetchedAt(lastFetchedAt)}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 px-5 py-4">
                <p className="mb-1 text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-500">
                  Saved jobs
                </p>
                <p className="text-sm text-white">
                  {user ? `${savedCount} saved` : "Sign in to save"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {JOB_CATEGORIES.map((category) => {
              const isActive = category.id === activeCategory.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategoryChange(category)}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-white text-black"
                      : "border border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.07]"
                  }`}
                >
                  {category.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-500">
              Location filter
            </span>
            <button
              type="button"
              onClick={() => setIndiaOnly(false)}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                !indiaOnly
                  ? "bg-emerald-400 text-black"
                  : "border border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.07]"
              }`}
            >
              All locations
            </button>
            <button
              type="button"
              onClick={() => setIndiaOnly(true)}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                indiaOnly
                  ? "bg-emerald-400 text-black"
                  : "border border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.07]"
              }`}
            >
              India only
            </button>
          </div>
        </section>

        <section className="mb-8 flex flex-col gap-4 rounded-[30px] border border-white/8 bg-white/[0.025] px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-white">
              Powered by Remotive remote job listings
            </p>
            <p className="text-sm text-neutral-400">
              {dataSource === "cache"
                ? "Jobs were served from Firestore cache."
                : dataSource === "upstream"
                  ? "Jobs were freshly synced from Remotive."
                  : dataSource === "client-fallback"
                    ? "Jobs were loaded directly from Remotive because the callable endpoint was unavailable."
                  : "Choose a category to load current listings."}
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <a
              href="https://remotive.com/remote-jobs/api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2.5 hover:text-white"
            >
              API attribution
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2.5 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-8 flex items-start gap-3 rounded-[26px] border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Could not load jobs</p>
              <p className="mt-1 text-rose-100/80">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <JobsSkeleton />
        ) : visibleJobs.length === 0 ? (
          <JobsEmpty categoryLabel={activeCategory.label} indiaOnly={indiaOnly} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleJobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                index={index}
                isSaved={Boolean(savedJobIds[job.id])}
                saving={savingJobId === job.id}
                onToggleSave={handleToggleSave}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
