"""GNews proxy — Python port of functions/src/gnews.js.

Caching note: measured directly against production, GNews itself responds in
~1.1s consistently — it is not the source of any multi-second wait (that
was isolated to jobs.py's JSearch calls instead). This cache is added for
consistency with jobs.py and to avoid a redundant upstream call on every
category/page switch, not because GNews itself was shown to be slow. TTL is
shorter than jobs' 2 hours since news content goes stale faster.
"""
import json
import time
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import DEBUG, GNEWS_API_KEY
from app.dependencies.auth import DecodedUser, require_auth
from app.services.http_client import get_http_client

router = APIRouter(prefix="/news", tags=["news"])

CACHE_TTL_SECONDS = 20 * 60  # 20 minutes — shorter than jobs' TTL, news goes stale faster

# In-memory cache keyed by (query, category, pageNum) — persists for the
# lifetime of the Cloud Run instance, same pattern as jobs.py.
_mem_cache: dict[str, dict] = {}


class NewsRequest(BaseModel):
    query: str | None = None
    category: str | None = None
    pageNum: int = 1


def _get_cached(cache_key: str) -> dict | None:
    entry = _mem_cache.get(cache_key)
    if not entry:
        return None
    if time.time() - entry["timestamp"] > CACHE_TTL_SECONDS:
        del _mem_cache[cache_key]
        return None
    return entry["data"]


@router.post("")
async def fetch_news(body: NewsRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    if not GNEWS_API_KEY:
        raise HTTPException(status_code=500, detail="GNews API key is missing on the server.")

    page_num = body.pageNum or 1
    cache_key = f"news_{body.query or ''}_{body.category or 'technology'}_{page_num}"

    cached = _get_cached(cache_key)
    if cached is not None:
        if DEBUG:
            print(f"[news] cache hit for key={cache_key}")
        return cached

    if body.query:
        url = (
            f"https://gnews.io/api/v4/search?q={quote(body.query)}&lang=en&max=9"
            f"&page={page_num}&token={GNEWS_API_KEY}"
        )
    else:
        category = body.category or "technology"
        url = (
            f"https://gnews.io/api/v4/top-headlines?category={category}&lang=en&max=9"
            f"&page={page_num}&token={GNEWS_API_KEY}"
        )

    try:
        client = get_http_client()
        response = await client.get(url, timeout=15.0)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch news: {exc}") from exc

    raw = response.text
    if DEBUG:
        print("GNews upstream status:", response.status_code)
        print("GNews upstream body:", raw)

    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"GNews API error {response.status_code}: {raw}")

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail="GNews API returned invalid JSON.") from exc

    _mem_cache[cache_key] = {"data": data, "timestamp": time.time()}
    return data
