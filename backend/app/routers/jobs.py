"""JSearch (RapidAPI) proxy — Python port of skillpilot/api/jobs.js.

Note: there used to be a second, unused Cloud Function implementation of job
search (functions/src/jobs.js, with Firestore-backed caching and a scheduled
refresh) but it was dead code — never called by the frontend — and was
already deleted in the prior cleanup pass. There is nothing left to merge
from it; this router is a straight port of the Vercel route, which is the
version that was actually serving production traffic.

Per Task 2's auth carry-forward, this route (like news and groq-chat) now
requires a signed-in caller, unlike the original anonymous-CORS Vercel route.

Pre-warming: measured directly against production (see the monorepo
restructure conversation), an uncached category pays JSearch's own upstream
latency — 7-15s, not something our code can speed up. Since there are only
5 fixed categories, they used to be warmed by an in-process fire-and-forget
asyncio loop — but Cloud Run throttles CPU on an idle instance between
requests, so that background loop couldn't be trusted to actually run on
schedule. Warming is now driven externally instead: `POST
/internal/prewarm-jobs` (secret-protected) synchronously warms all 5
categories and is hit by a GitHub Actions cron every 90 minutes, which
guarantees the container is actively handling a request (and therefore
getting real CPU) while it warms.
"""
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from app.config import DEBUG, JSEARCH_API_KEY, PREWARM_SECRET
from app.dependencies.auth import DecodedUser, require_auth
from app.services.http_client import get_http_client

router = APIRouter(prefix="/jobs", tags=["jobs"])
internal_router = APIRouter(tags=["internal"])

CACHE_TTL_SECONDS = 2 * 60 * 60  # 2 hours, matches the Vercel route's in-memory cache

CATEGORIES = {
    "software-dev": "Software Engineer",
    "devops-sysadmin": "DevOps Engineer",
    "data": "Data Analyst",
    "product": "Product Manager",
    "design": "Product Designer",
}

# In-memory cache — persists for the lifetime of the Cloud Run instance,
# same "cache while warm" behavior the Vercel function had.
_mem_cache: dict[str, dict] = {}


class Job(BaseModel):
    id: str
    title: str
    companyName: str
    logoUrl: str | None = None
    location: str
    jobType: str | None = None
    url: str | None = None
    salary: str | None = None
    publishedAt: str | None = None
    tags: list[str]
    source: str = "jsearch"
    category: str
    description: str | None = None


class JobsResponse(BaseModel):
    jobs: list[Job]
    fetchedAt: str | None = None
    source: str
    category: str
    role: str
    region: str = "india"
    total: int | None = None
    error: str | None = None


def _get_cached(cache_key: str) -> dict | None:
    entry = _mem_cache.get(cache_key)
    if not entry:
        return None
    if time.time() - entry["timestamp"] > CACHE_TTL_SECONDS:
        del _mem_cache[cache_key]
        return None
    return entry


def _normalize_job(item: dict, category: str) -> Job:
    location = "India"
    if item.get("job_city"):
        location = f"{item['job_city']}, {item['job_state']}" if item.get("job_state") else f"{item['job_city']}, India"

    salary = None
    if item.get("job_min_salary") and item.get("job_max_salary"):
        currency = item.get("job_salary_currency") or "INR"
        period = item.get("job_salary_period") or "YEAR"
        salary = f"{currency} {item['job_min_salary']:,.0f} – {item['job_max_salary']:,.0f} / {period.lower()}"

    return Job(
        id=item.get("job_id") or str(uuid.uuid4()),
        title=item.get("job_title") or "Untitled role",
        companyName=item.get("employer_name") or "Unknown company",
        logoUrl=item.get("employer_logo"),
        location=location,
        jobType=item.get("job_employment_type"),
        url=item.get("job_apply_link") or item.get("job_google_link"),
        salary=salary,
        publishedAt=item.get("job_posted_at_datetime_utc"),
        tags=(item.get("job_required_skills") or [])[:6],
        category=category,
        description=(item.get("job_description") or "")[:300] or None,
    )


async def _fetch_from_upstream(category: str) -> dict | None:
    """Fetches one category from JSearch and writes it into `_mem_cache`.

    Returns the new cache entry on success, or None on any failure (missing
    key, upstream error, timed-out retry) — the caller decides what error
    response to surface, if any. Shared by the request-time cache-miss path
    and the startup/periodic pre-warm task so there's exactly one place that
    talks to JSearch.
    """
    role = CATEGORIES.get(category, "Software Engineer")
    cache_key = f"jobs_india_{category}"

    if DEBUG:
        print(f"[jobs] JSEARCH_API_KEY configured: {bool(JSEARCH_API_KEY)}, category={category}, cache_hit=False")

    if not JSEARCH_API_KEY:
        return None

    try:
        search_query = f"{role} in India"
        params = {
            "query": search_query,
            "num_pages": "2",
            "country": "in",
            "date_posted": "month",
        }
        headers = {
            "x-rapidapi-key": JSEARCH_API_KEY,
            "x-rapidapi-host": "jsearch.p.rapidapi.com",
        }
        client = get_http_client()

        # Confirmed via direct measurement: JSearch is intermittently slow —
        # successful uncached calls ranged 7-10s, one call timed out entirely at
        # 15s (the exact "no jobs found" symptom). A same-category retry right
        # after succeeded, so this looks transient rather than a systematic
        # outage — worth one retry before giving up. Per-attempt timeout is
        # capped at 10s (not the original 15s) specifically so a timeout+retry
        # tops out around 20s instead of 30s — a first pass at 15s+15s actually
        # measured a 30.4s worst case, which is a worse user experience than
        # the single 15s failure it was meant to fix.
        JSEARCH_TIMEOUT = 10.0
        try:
            response = await client.get(
                "https://jsearch.p.rapidapi.com/search-v2", params=params, headers=headers, timeout=JSEARCH_TIMEOUT
            )
        except httpx.TimeoutException:
            if DEBUG:
                print("[jobs] JSearch timed out once, retrying...")
            response = await client.get(
                "https://jsearch.p.rapidapi.com/search-v2", params=params, headers=headers, timeout=JSEARCH_TIMEOUT
            )

        if DEBUG:
            print(f"[jobs] JSearch upstream response status={response.status_code}")

        if response.status_code >= 400:
            if DEBUG:
                print(f"[jobs] JSearch upstream error body: {response.text[:500]}")
            return None

        payload = response.json()
        raw_jobs = payload.get("data") or []
        jobs = [_normalize_job(item, category) for item in raw_jobs]

        if DEBUG:
            print(f"[jobs] JSearch returned {len(raw_jobs)} raw results, {len(jobs)} after normalization")

        now = time.time()
        entry = {
            "jobs": jobs,
            "timestamp": now,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        }
        _mem_cache[cache_key] = entry
        return entry
    except httpx.HTTPError as exc:
        if DEBUG:
            print(f"[jobs] httpx request FAILED: {type(exc).__name__}: {exc}")
        return None


class PrewarmCategoryResult(BaseModel):
    category: str
    success: bool
    elapsed_seconds: float
    jobs_cached: int | None = None
    error: str | None = None


class PrewarmResponse(BaseModel):
    results: list[PrewarmCategoryResult]


@internal_router.post("/internal/prewarm-jobs", response_model=PrewarmResponse)
async def prewarm_jobs_endpoint(x_prewarm_secret: str | None = Header(default=None)) -> PrewarmResponse:
    """Synchronously warms all 5 categories and returns a per-category
    success/timing summary. Called by the GitHub Actions cron (every
    90min) rather than run in-process, since Cloud Run throttles CPU on an
    idle instance and can't be trusted to run a background loop on schedule.
    """
    if not PREWARM_SECRET or x_prewarm_secret != PREWARM_SECRET:
        raise HTTPException(status_code=403, detail="Missing or invalid X-Prewarm-Secret header")

    results: list[PrewarmCategoryResult] = []
    for category in CATEGORIES:
        start = time.time()
        entry = await _fetch_from_upstream(category)
        elapsed = time.time() - start
        if entry:
            results.append(
                PrewarmCategoryResult(
                    category=category,
                    success=True,
                    elapsed_seconds=round(elapsed, 2),
                    jobs_cached=len(entry["jobs"]),
                )
            )
        else:
            results.append(
                PrewarmCategoryResult(
                    category=category,
                    success=False,
                    elapsed_seconds=round(elapsed, 2),
                    error="JSearch error or missing key",
                )
            )
    return PrewarmResponse(results=results)


@router.get("", response_model=JobsResponse)
async def fetch_jobs(
    category: str = Query(default="software-dev"),
    user: DecodedUser = Depends(require_auth),
):
    role = CATEGORIES.get(category, "Software Engineer")
    cache_key = f"jobs_india_{category}"

    cached = _get_cached(cache_key)
    if cached:
        return JobsResponse(
            jobs=cached["jobs"],
            fetchedAt=cached["fetched_at"],
            source="cache",
            category=category,
            role=role,
        )

    if not JSEARCH_API_KEY:
        return JobsResponse(
            jobs=[],
            source="provider-unavailable",
            error="JSEARCH_API_KEY environment variable is not configured. Get a free key at https://rapidapi.com/letscrape-6bRBa3Q3OEd/api/jsearch",
            category=category,
            role=role,
        )

    entry = await _fetch_from_upstream(category)
    if entry is None:
        return JobsResponse(
            jobs=[],
            source="provider-unavailable",
            error="Unexpected error fetching jobs",
            category=category,
            role=role,
        )

    return JobsResponse(
        jobs=entry["jobs"],
        fetchedAt=entry["fetched_at"],
        source="upstream",
        category=category,
        role=role,
        total=len(entry["jobs"]),
    )
