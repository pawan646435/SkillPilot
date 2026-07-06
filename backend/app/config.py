"""Shared configuration: region, CORS allowlist, env var loading.

Mirrors firebase-backend/proxy functions for api key/functions/src/config.js —
same allowlisted origins, same intent, just no `region`/`maxInstances`/`memory`
concept since Cloud Run scales differently than Cloud Functions (see
docs/backend-migration-explained.md for why).
"""
import os

from dotenv import load_dotenv

load_dotenv()

REGION = "asia-south1"

# Kept as a literal list (not env-driven) for the same reason the original
# functions/src/config.js hardcoded it: it's a small, rarely-changing
# allowlist that's easier to review in code than in an env var.
CORS_ALLOW_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "https://skill-pilot-coral.vercel.app",  # Production frontend
]

# Vercel Preview deployments get a fresh, randomly-generated subdomain every
# time (e.g. skill-pilot-<hash>-<team-slug>.vercel.app) — there's no fixed
# origin to add to the list above. This regex matches any preview URL for
# this specific Vercel project/team, so preview deployments (used to test
# this migration itself before touching production) aren't CORS-blocked.
CORS_ALLOW_ORIGIN_REGEX = r"^https://skill-pilot-[a-z0-9]+-pawan-kumars-projects-716ce4be\.vercel\.app$"

DEBUG = os.getenv("DEBUG", "false").lower() == "true"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "")
JSEARCH_API_KEY = os.getenv("JSEARCH_API_KEY", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")

GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
