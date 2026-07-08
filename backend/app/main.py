"""FastAPI app instance, router registration, CORS config.

Replaces functions/index.js as the single entry point that wires up every
route — the Cloud Run equivalent of "the functions this codebase exports".
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import CORS_ALLOW_ORIGIN_REGEX, CORS_ALLOW_ORIGINS
from app.routers import assessments, clash, interview, jobs, news, rag
from app.services.http_client import start_http_client, stop_http_client


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await start_http_client()
    yield
    await stop_http_client()


app = FastAPI(title="SkillPilot API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Compresses JSON responses over ~500 bytes — Clash/Assessment results, job
# listings, and news articles are all comfortably above that threshold.
app.add_middleware(GZipMiddleware, minimum_size=500)

app.include_router(interview.router)
app.include_router(clash.router)
app.include_router(assessments.router)
app.include_router(jobs.router)
app.include_router(jobs.internal_router)
app.include_router(news.router)
app.include_router(rag.router)


@app.get("/health")
async def health() -> dict:
    """Unauthenticated liveness check — Cloud Run hits this to confirm the
    container is up; also handy for local `curl` smoke tests."""
    return {"status": "ok"}
