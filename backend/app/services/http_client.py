"""Shared httpx.AsyncClient, reused across requests.

Previously each call site (groq_client.py, news.py, jobs.py) did
`async with httpx.AsyncClient(...) as client:` — a brand new client (and a
brand new TCP+TLS connection pool) instantiated and torn down on every single
request. Repeated calls to the same upstream (Groq, GNews, JSearch) got no
benefit from HTTP keep-alive/connection reuse, paying a fresh handshake every
time. This module creates one client at app startup (see main.py's lifespan)
and every router borrows it, so connections to a given host are pooled and
reused across requests.

Per-call timeouts still vary by service (Groq's completions take longer than
a GNews/JSearch fetch) — httpx supports overriding the timeout per request
even on a shared client, so nothing about that behavior changes.
"""
import httpx

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("Shared HTTP client not initialized — app startup lifespan didn't run.")
    return _client


async def start_http_client() -> None:
    global _client
    if _client is None:
        _client = httpx.AsyncClient()


async def stop_http_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
