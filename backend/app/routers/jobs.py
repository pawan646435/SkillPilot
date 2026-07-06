"""JSearch (RapidAPI) proxy — Python port of skillpilot/api/jobs.js.

Note: there used to be a second, unused Cloud Function implementation of job
search (functions/src/jobs.js, with Firestore-backed caching and a scheduled
refresh) but it was dead code — never called by the frontend — and was
already deleted in the prior cleanup pass. There is nothing left to merge
from it; this router is a straight port of the Vercel route, which is the
version that was actually serving production traffic.

Per Task 2's auth carry-forward, this route (like news and groq-chat) now
requires a signed-in caller, unlike the original anonymous-CORS Vercel route.
"""
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.config import DEBUG, JSEARCH_API_KEY
from app.dependencies.auth import DecodedUser, require_auth
from app.services.http_client import get_http_client

router = APIRouter(prefix="/jobs", tags=["jobs"])

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

    if DEBUG:
        print(f"[jobs] JSEARCH_API_KEY configured: {bool(JSEARCH_API_KEY)}, category={category}, cache_hit=False")

    if not JSEARCH_API_KEY:
        return JobsResponse(
            jobs=[],
            source="provider-unavailable",
            error="JSEARCH_API_KEY environment variable is not configured. Get a free key at https://rapidapi.com/letscrape-6bRBa3Q3OEd/api/jsearch",
            category=category,
            role=role,
        )

    try:
        search_query = f"{role} in India"
        params = {
            "query": search_query,
            "page": "1",
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
                "https://jsearch.p.rapidapi.com/search", params=params, headers=headers, timeout=JSEARCH_TIMEOUT
            )
        except httpx.TimeoutException:
            if DEBUG:
                print("[jobs] JSearch timed out once, retrying...")
            response = await client.get(
                "https://jsearch.p.rapidapi.com/search", params=params, headers=headers, timeout=JSEARCH_TIMEOUT
            )

        if DEBUG:
            print(f"[jobs] JSearch upstream response status={response.status_code}")

        if response.status_code >= 400:
            if DEBUG:
                print(f"[jobs] JSearch upstream error body: {response.text[:500]}")
            return JobsResponse(
                jobs=[],
                source="provider-unavailable",
                error=f"JSearch returned HTTP {response.status_code}",
                category=category,
                role=role,
            )

        payload = response.json()
        raw_jobs = payload.get("data") or []
        jobs = [_normalize_job(item, category) for item in raw_jobs]

        if DEBUG:
            print(f"[jobs] JSearch returned {len(raw_jobs)} raw results, {len(jobs)} after normalization")

        now = time.time()
        _mem_cache[cache_key] = {
            "jobs": jobs,
            "timestamp": now,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        }

        return JobsResponse(
            jobs=jobs,
            fetchedAt=_mem_cache[cache_key]["fetched_at"],
            source="upstream",
            category=category,
            role=role,
            total=len(jobs),
        )
    except httpx.HTTPError as exc:
        if DEBUG:
            print(f"[jobs] httpx request FAILED: {type(exc).__name__}: {exc}")
        return JobsResponse(
            jobs=[],
            source="provider-unavailable",
            error=str(exc) or "Unexpected error fetching jobs",
            category=category,
            role=role,
        )
