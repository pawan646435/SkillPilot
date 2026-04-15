// api/jobs.js — Vercel Serverless Function: JSearch proxy with in-memory cache
// Deployed at /api/jobs?category=software-dev

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const CATEGORIES = {
  "software-dev": "Software Engineer",
  "devops-sysadmin": "DevOps Engineer",
  data: "Data Analyst",
  product: "Product Manager",
  design: "Product Designer",
};

// Simple in-memory cache (persists while the serverless function is warm)
const memCache = {};

function getCachedData(key) {
  const entry = memCache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete memCache[key];
    return null;
  }
  return entry;
}

function normalizeJob(item, category) {
  // Build location string
  let location = "India";
  if (item.job_city) {
    location = item.job_state
      ? `${item.job_city}, ${item.job_state}`
      : `${item.job_city}, India`;
  }

  // Build salary string
  let salary = null;
  if (item.job_min_salary && item.job_max_salary) {
    const currency = item.job_salary_currency || "INR";
    const period = item.job_salary_period || "YEAR";
    salary = `${currency} ${Number(item.job_min_salary).toLocaleString()} – ${Number(item.job_max_salary).toLocaleString()} / ${period.toLowerCase()}`;
  }

  return {
    id: item.job_id || crypto.randomUUID(),
    title: item.job_title || "Untitled role",
    companyName: item.employer_name || "Unknown company",
    logoUrl: item.employer_logo || null,
    location,
    jobType: item.job_employment_type || null,
    url: item.job_apply_link || item.job_google_link || null,
    salary,
    publishedAt: item.job_posted_at_datetime_utc || null,
    tags: (item.job_required_skills || []).slice(0, 6),
    source: "jsearch",
    category,
    description: item.job_description
      ? item.job_description.substring(0, 300)
      : null,
  };
}

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const category = req.query.category || "software-dev";
  const role = CATEGORIES[category] || "Software Engineer";
  const cacheKey = `jobs_india_${category}`;

  // ── 1. Check in-memory cache ──
  const cached = getCachedData(cacheKey);
  if (cached) {
    return res.status(200).json({
      jobs: cached.jobs,
      fetchedAt: new Date(cached.timestamp).toISOString(),
      source: "cache",
      category,
      role,
      region: "india",
    });
  }

  // ── 2. Fetch from JSearch (RapidAPI) ──
  // Accepts RAPIDAPI_KEY (preferred) or JSEARCH_KEY
  const JSEARCH_KEY = process.env.RAPIDAPI_KEY || process.env.JSEARCH_KEY;
  if (!JSEARCH_KEY) {
    return res.status(500).json({
      jobs: [],
      source: "provider-unavailable",
      error: "RAPIDAPI_KEY (or JSEARCH_KEY) environment variable is not configured. Get a free key at https://rapidapi.com/letscrape-6bRBa3Q3OEd/api/jsearch",
      category,
      role,
    });
  }

  try {
    const searchQuery = `${role} in India`;
    const apiUrl = new URL("https://jsearch.p.rapidapi.com/search");
    apiUrl.searchParams.set("query", searchQuery);
    apiUrl.searchParams.set("page", "1");
    apiUrl.searchParams.set("num_pages", "2");
    apiUrl.searchParams.set("country", "in");
    apiUrl.searchParams.set("date_posted", "month");

    const response = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: {
        "x-rapidapi-key": JSEARCH_KEY,
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`JSearch API error [${response.status}]:`, errorText);

      return res.status(502).json({
        jobs: [],
        source: "provider-unavailable",
        error: `JSearch returned HTTP ${response.status}`,
        category,
        role,
      });
    }

    const json = await response.json();
    const rawJobs = json.data || [];
    const jobs = rawJobs.map((item) => normalizeJob(item, category));

    // ── 3. Cache the result ──
    const now = Date.now();
    memCache[cacheKey] = { jobs, timestamp: now };

    return res.status(200).json({
      jobs,
      fetchedAt: new Date(now).toISOString(),
      source: "upstream",
      category,
      role,
      region: "india",
      total: jobs.length,
    });
  } catch (error) {
    console.error("Job fetch failed:", error);
    return res.status(500).json({
      jobs: [],
      source: "provider-unavailable",
      error: error.message || "Unexpected error fetching jobs",
      category,
      role,
    });
  }
}
