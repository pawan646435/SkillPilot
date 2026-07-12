# SkillPilot Backend (FastAPI, Cloud Run)

Replaces the previous split backend: Firebase Cloud Functions
(`firebase-backend/proxy functions for api key/functions/`) + a Vercel
serverless function (`skillpilot/api/jobs.js`). Everything — AI interview,
Code Clash (including the sandboxed code judge), assessment judging, jobs,
and news — now lives here as one FastAPI service, containerized and deployed
to Google Cloud Run.

Firestore, Firebase Auth, and Firebase Storage are unchanged — this backend
still reads/writes Firestore via the `firebase-admin` Python SDK and verifies
the same Firebase ID tokens the frontend already gets from `firebase/auth`.

See `docs/backend-migration-explained.md` at the repo root for the full
explanation of why this migration happened and how the pieces fit together.

## Project layout

```
backend/
├── app/
│   ├── main.py                  → FastAPI app, CORS, router registration
│   ├── config.py                → CORS/env var loading
│   ├── dependencies/
│   │   └── auth.py              → Firebase ID token verification dependency
│   ├── routers/
│   │   ├── interview.py         → AI interview question/evaluate/report
│   │   ├── clash.py             → Code Clash run/submit/finalize/generate/join
│   │   ├── assessments.py       → assessment submit (run/submit modes)
│   │   ├── jobs.py              → JSearch proxy
│   │   ├── news.py              → Currents API news proxy
│   │   ├── rag.py               → RAG context ingestion (AI Interview Panel, Stage 1)
│   │   └── panel.py             → multi-agent interview panel + streaming (Stages 2-3)
│   └── services/
│       ├── judge.py             → sandboxed multi-language code judge
│       ├── groq_client.py       → Groq chat-completions wrapper (buffered + streaming)
│       ├── firestore_client.py  → firebase-admin init, shared Firestore client
│       ├── http_client.py       → shared httpx.AsyncClient (app-lifespan managed)
│       ├── chunking.py          → resume/JD text chunking (Stage 1)
│       ├── embeddings.py        → sentence-transformers embedding generation (Stage 1)
│       ├── retrieval.py         → cosine-similarity chunk retrieval (Stage 1)
│       └── panel_agents.py      → technical/hiring_manager/panel_lead personas (Stage 2)
├── evals/
│   └── golden_set.json          → fixed eval test cases (Stage 4)
├── scripts/
│   └── run_evals.py             → eval harness runner (Stage 4)
├── requirements.txt
├── Dockerfile
├── deploy.sh                    → documented `gcloud run deploy` (not run automatically)
├── .env.example
└── .dockerignore
```

See `docs/stage1-rag-ingestion-explained.md` through `docs/stage4-eval-harness-explained.md`
at the repo root for the full walkthrough of the RAG/panel/streaming/eval-harness pieces above.

## Running locally

### 1. Install dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# fill in GROQ_API_KEY, CURRENTS_API_KEY, JSEARCH_API_KEY, PREWARM_SECRET
```

For Firestore/Auth access locally, you need Application Default Credentials
pointed at the `myproject-a48d7` Firebase project. Either:

- Run `gcloud auth application-default login` (uses your own Google account,
  needs Firestore/Auth IAM permissions on the project), or
- Download a service account key and set
  `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` in `.env`.

To point at the Firebase emulator suite instead of real Firestore/Auth (no
credentials needed), set before starting uvicorn:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
export FIREBASE_PROJECT_ID=myproject-a48d7   # or GOOGLE_CLOUD_PROJECT
```

`FIREBASE_AUTH_EMULATOR_HOST` really is picked up automatically —
`verify_id_token` trusts the emulator's unsigned tokens directly. Firestore
is different: `google-cloud-firestore`'s credential resolution runs eagerly
and does **not** fall back to anonymous credentials just because
`FIRESTORE_EMULATOR_HOST` is set, so `app/services/firestore_client.py`
explicitly detects the emulator host and constructs a
`google.cloud.firestore.Client` with `AnonymousCredentials()` in that case —
see the comment there if you're wondering why it's not a one-line
`firestore.client()` call.

### 3. Run the language runtimes the judge needs

The sandboxed judge shells out to `node`, `python3`, `javac`/`java`, and
`g++`. Locally this means your machine needs all four installed and on
`PATH` — inside the Docker image (see Dockerfile) they're installed for you.

### 4. Start the server

```bash
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/health` to confirm it's up, or
`http://localhost:8000/docs` for the interactive OpenAPI/Swagger UI (a nice
side benefit of the typed Pydantic models — every route is self-documenting).

### 5. Point the frontend at it

In `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:8000
```

## Deploying to Cloud Run

**Not run automatically — this is your call.** Review `deploy.sh`, then:

```bash
cd backend
./deploy.sh
```

Or run the equivalent command directly:

```bash
gcloud run deploy skillpilot-api \
  --source . \
  --project myproject-a48d7 \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=120s \
  --set-env-vars="FIREBASE_PROJECT_ID=myproject-a48d7,DEBUG=false" \
  --set-secrets="GROQ_API_KEY=GROQ_API_KEY:latest,CURRENTS_API_KEY=CURRENTS_API_KEY:latest,JSEARCH_API_KEY=JSEARCH_API_KEY:latest,PREWARM_SECRET=PREWARM_SECRET:latest"
```

Notes:
- `--allow-unauthenticated` controls Cloud Run's own IAM-level ingress check,
  not our application's auth. The FastAPI `require_auth` dependency (Firebase
  ID token verification) is the real gate — same trust model as the old
  Cloud Functions callables, which were also publicly invokable at the
  transport layer and did their own auth check inside the handler.
- `--min-instances=0` means the service scales to zero when idle — no
  charges while nobody's using it, at the cost of a cold start on the next
  request (a few hundred ms to a couple seconds, depending on whether it's a
  warm container reuse or a fresh one).
- `--set-secrets` assumes the four secrets already exist in Secret Manager.
  Create them once with:
  ```bash
  echo -n "your-groq-key" | gcloud secrets create GROQ_API_KEY --data-file=- --project myproject-a48d7
  echo -n "your-currents-key" | gcloud secrets create CURRENTS_API_KEY --data-file=- --project myproject-a48d7
  echo -n "your-jsearch-key" | gcloud secrets create JSEARCH_API_KEY --data-file=- --project myproject-a48d7
  echo -n "your-prewarm-secret" | gcloud secrets create PREWARM_SECRET --data-file=- --project myproject-a48d7
  ```
- After deploying, update `frontend/.env` (or your Vercel project's env
  vars) with the deployed URL:
  ```bash
  gcloud run services describe skillpilot-api --region asia-south1 --project myproject-a48d7 --format='value(status.url)'
  ```
  and set `VITE_API_BASE_URL` to that URL.
