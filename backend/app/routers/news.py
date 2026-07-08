"""Currents API proxy — replaces the original GNews proxy (functions/src/gnews.js port).

Endpoint choice: the migration task named /v1/latest-news, but that endpoint
only accepts a `language` parameter (confirmed against Currents' live
OpenAPI spec) — no `category`, no `keywords`. Category browsing and the
search box both need /v1/search instead (language, keywords, country,
category), so this router calls /v1/search exclusively, mirroring the old
GNews split: category-only fetch for the default "technology" tab (no user
query), keywords fetch for everything else — same as GNews's
top-headlines-vs-search branch.

Pagination: neither Currents v1 endpoint supports pagination at all — no
page/page_number/page_size in the spec, and an undocumented `page_size`/
`limit` query param was tried empirically and just gets rejected with a 400.
The endpoint always returns a fixed batch (confirmed 20 articles per call,
identical across repeated calls for the same params). So pagination is done
server-side instead: the full 20-article batch is fetched once per
(category, query) and cached as a whole; each "page" the frontend asks for
is a slice of that same cached batch, no repeat upstream call. Once the
batch is exhausted, the slice comes back shorter than PAGE_SIZE (or empty) —
News.jsx's existing `newArticles.length === 9` check already treats that as
"no more pages" and hides Load More, so no frontend change was needed here.

Field gap: Currents has no source/publisher name field (GNews's
`source.name`) — only an unreliable `author` string. Derived from the
article URL's hostname instead (see _derive_source_name); a domain, not a
branded publisher name, but the closest available equivalent.

Caching note: TTL cache logic unchanged from the GNews version — same
"cache while warm" reasoning, just caching Currents responses now.
"""
import json
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import CURRENTS_API_KEY, DEBUG
from app.dependencies.auth import DecodedUser, require_auth
from app.services.http_client import get_http_client

router = APIRouter(prefix="/news", tags=["news"])

CACHE_TTL_SECONDS = 20 * 60  # 20 minutes — shorter than jobs' TTL, news goes stale faster
PAGE_SIZE = 9  # matches GNews's old `max=9` — News.jsx's hasMore check is hardcoded to this count

# Only the default "technology" tab ever triggers the category branch below
# (every other tab always sends a query string) — this table exists so an
# unrecognized category id still falls back to something valid on Currents
# rather than erroring.
CURRENTS_CATEGORY_MAP = {
    "technology": "technology",
}

# In-memory cache keyed by (query, category) — NOT by page, since a single
# cached batch serves every page for that query/category via slicing.
# Persists for the lifetime of the Cloud Run instance, same pattern as jobs.py.
_mem_cache: dict[str, dict] = {}


class NewsRequest(BaseModel):
    query: str | None = None
    category: str | None = None
    pageNum: int = 1


def _get_cached(cache_key: str) -> list[dict] | None:
    entry = _mem_cache.get(cache_key)
    if not entry:
        return None
    if time.time() - entry["timestamp"] > CACHE_TTL_SECONDS:
        del _mem_cache[cache_key]
        return None
    return entry["data"]


def _parse_currents_date(raw: str) -> str:
    """Converts Currents' "YYYY-MM-DD HH:MM:SS +0000" to ISO8601 so
    News.jsx's `new Date(article.publishedAt)` parses reliably across
    browsers, matching what GNews sent natively."""
    try:
        dt = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S %z")
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, TypeError):
        return raw


def _derive_source_name(url: str) -> str:
    """Currents has no publisher/source name field — the closest available
    stand-in is the article URL's hostname."""
    try:
        host = urlparse(url).hostname or "Unknown"
    except ValueError:
        return "Unknown"
    return host.removeprefix("www.") if host else "Unknown"


def _simplify_keywords(query: str) -> str:
    """Currents' `keywords` filter doesn't parse boolean "OR" syntax the way
    GNews's `q` did — verified empirically: a single term returns clean,
    on-topic results, while "term1 OR term2" gets tokenized literally and
    returns noise (e.g. an unrelated "hacking" tabloid story dominating a
    "cybersecurity OR hacking" query). News.jsx's predefined tab queries
    (and the free-text search box) are sent through untouched, so this
    takes just the first term of an OR-joined string rather than the whole
    thing — a plain user search with no " OR " passes through unchanged."""
    return query.split(" OR ")[0].strip()


def _transform_article(item: dict) -> dict:
    image = item.get("image")
    if image in (None, "None", ""):
        image = None

    return {
        "title": item.get("title"),
        "description": item.get("description"),
        "url": item.get("url"),
        "image": image,
        "publishedAt": _parse_currents_date(item.get("published") or ""),
        "source": {"name": _derive_source_name(item.get("url") or "")},
    }


async def _fetch_full_batch(body: NewsRequest) -> list[dict]:
    """Fetches and transforms the one batch Currents gives per (category,
    query) — there's no upstream way to ask for a specific page, so this is
    called at most once per cache TTL window; fetch_news slices the result
    for whichever page the frontend asked for."""
    params = {"language": "en"}
    if body.query:
        params["keywords"] = _simplify_keywords(body.query)
    else:
        params["category"] = CURRENTS_CATEGORY_MAP.get(body.category or "technology", "technology")

    try:
        client = get_http_client()
        response = await client.get(
            "https://api.currentsapi.services/v1/search",
            params=params,
            headers={"Authorization": CURRENTS_API_KEY},
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch news: {exc}") from exc

    raw = response.text
    if DEBUG:
        print("Currents upstream status:", response.status_code)
        print("Currents upstream body:", raw)

    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Currents API error {response.status_code}: {raw}")

    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail="Currents API returned invalid JSON.") from exc

    raw_articles = payload.get("news") or []
    return [_transform_article(item) for item in raw_articles]


@router.post("")
async def fetch_news(body: NewsRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    if not CURRENTS_API_KEY:
        raise HTTPException(status_code=500, detail="Currents API key is missing on the server.")

    page_num = body.pageNum or 1
    cache_key = f"news_{body.query or ''}_{body.category or 'technology'}"

    full_batch = _get_cached(cache_key)
    if full_batch is not None:
        if DEBUG:
            print(f"[news] cache hit for key={cache_key}, serving page {page_num} from cached batch")
    else:
        full_batch = await _fetch_full_batch(body)
        _mem_cache[cache_key] = {"data": full_batch, "timestamp": time.time()}

    start = (page_num - 1) * PAGE_SIZE
    page_articles = full_batch[start : start + PAGE_SIZE]
    return {"articles": page_articles}
