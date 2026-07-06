"""GNews proxy — Python port of functions/src/gnews.js."""
import json
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import DEBUG, GNEWS_API_KEY
from app.dependencies.auth import DecodedUser, require_auth
from app.services.http_client import get_http_client

router = APIRouter(prefix="/news", tags=["news"])


class NewsRequest(BaseModel):
    query: str | None = None
    category: str | None = None
    pageNum: int = 1


@router.post("")
async def fetch_news(body: NewsRequest, user: DecodedUser = Depends(require_auth)) -> dict:
    if not GNEWS_API_KEY:
        raise HTTPException(status_code=500, detail="GNews API key is missing on the server.")

    page_num = body.pageNum or 1

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
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail="GNews API returned invalid JSON.") from exc
