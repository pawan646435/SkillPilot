# SkillPilot

**Live demo:** [skill-pilot-coral.vercel.app](https://skill-pilot-coral.vercel.app)

SkillPilot is a platform for interview preparation, coding assessments, and
competitive real-time coding. It combines two distinct AI interview modes, a
real-time 1v1 code battle mode ("Code Clash"), recruiter-run assessments, and
a career hub (jobs + tech news) in one product.

## What's in the product

**AI Interview Prep** — two separate modes, reachable from the "AI
Interviewer" nav item's mode-selection screen (`/interview/select`):

- **Classic Interviewer**: pick a role, difficulty, question count, and
  question type (subjective/MCQ); one AI interviewer asks questions and gives
  instant per-answer feedback, ending in a full report with strengths,
  improvements, and a hire recommendation. Supports voice input.
- **AI Panel Interview**: paste a resume/job description as text, or upload a
  PDF/DOCX (extracted server-side and fed into the same pipeline as pasted
  text). Choose an experience level (Fresher / Experienced), which changes
  both *what the panel searches for* in your resume and *how it phrases
  questions* — a fresher's technical questions probe fundamentals and
  reasoning, an experienced candidate's probe tradeoffs, scale, and
  ownership. The panel then runs a fixed 4-question plan across two personas
  — a Technical Interviewer and a Hiring Manager — each grounding its
  questions in resume content it retrieves by embedding similarity (falling
  back to a generic, non-resume-grounded question if nothing clears a
  measured relevance threshold, rather than forcing a weak match). Questions
  stream back token-by-token. A Panel Lead persona synthesizes the full
  transcript into one hire recommendation, instructed (not code-enforced) to
  weight technical competence 60% and cultural fit 40%. See "The AI
  Interview Panel" below for how this was built.

**Code Clash** — real-time 1v1 coding battles: AI-generated questions across
categories (DSA, System Design, Frontend, etc.), a sandboxed multi-language
code judge (Node, Python, Java, C++), live opponent tracking, and a global
Elo ranking system.

**Career Hub** — an India-focused job search (JSearch/RapidAPI) with
caching, and a tech news feed (Currents API).

**Assessments** — recruiter-facing: create coding problems with real test
cases, invite candidates, and have submissions run through the same
sandboxed judge Code Clash uses, with results analytics.

## Architecture

```text
                     ┌─────────────────────┐
                     │  frontend/           │
                     │  React 19 + Vite SPA │
                     │  deployed: Vercel    │
                     └──────────┬───────────┘
                                │ HTTPS (Firebase ID token in
                                │ Authorization header)
                                ▼
                     ┌─────────────────────┐        ┌────────────────┐
                     │  backend/            │───────▶│  Groq          │
                     │  FastAPI, Cloud Run   │        │  (chat models) │
                     │  region: asia-south1  │        └────────────────┘
                     │                       │        ┌────────────────┐
                     │  sandboxed code judge │───────▶│  Currents API  │
                     │  sentence-transformers│        │  (news)        │
                     │  embeddings           │        └────────────────┘
                     └──────────┬───────────┘        ┌────────────────┐
                                │ firebase-admin      │  JSearch API   │
                                │ (Admin SDK, bypasses │  (jobs)       │
                                │  client-facing rules)└────────────────┘
                                ▼
                     ┌─────────────────────┐
                     │  firebase/            │
                     │  Firestore + Auth      │
                     │  + Storage (avatars)   │
                     └─────────────────────┘
```

The frontend never talks to Groq, Currents, or JSearch directly — every
external API call is proxied through the backend, which holds the real API
keys server-side. The frontend does talk to Firestore/Auth/Storage directly
for some reads (e.g. dashboard listings), governed by `firebase/firestore.rules`;
writes to AI-interview-related collections only ever happen through the
backend's Admin SDK, which bypasses those rules entirely — the rules there
are defense-in-depth, not the primary access control (`require_auth` +
per-request ownership checks in the backend are).

## The AI Interview Panel

The AI Panel Interview mode (described above) was built as four incremental
stages:

1. **RAG ingestion** — chunking, embedding (sentence-transformers), and storing resume/JD text for later retrieval.
2. **Multi-agent panel** — the three personas, the retrieval-threshold/fallback mechanism, and the hand-rolled turn-order state machine.
3. **Streaming** — token-by-token question delivery over SSE.
4. **Eval harness** — a golden-set test suite and a real prompt-version A/B comparison workflow for future prompt changes.

The backend itself was migrated earlier, separately, off Firebase Cloud
Functions + a Vercel serverless function onto this standalone FastAPI service.

## Tech stack

**Frontend**: React 19, Vite 7, React Router 7, Tailwind CSS, Framer Motion,
Monaco Editor (Code Clash's in-browser editor), Firebase JS SDK
(Auth/Firestore/Storage).

**Backend**: FastAPI, Uvicorn, firebase-admin (Python), Groq (chat
completions), sentence-transformers (resume embedding), pypdf + python-docx
(resume file extraction), httpx (outbound API calls).

**Infrastructure**: Firebase Auth + Firestore + Storage, Google Cloud Run
(backend), Vercel (frontend), Google Secret Manager (production secrets).

**External APIs**: Groq (LLM), Currents API (news), JSearch/RapidAPI (jobs).

## Local development

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in VITE_API_BASE_URL (e.g. http://localhost:8000)
npm run dev
```

The Firebase web config itself is hardcoded in `src/lib/firebase.js` (this
is normal — a Firebase client config is meant to be public, unlike the
backend's server-side API keys).

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in GROQ_API_KEY, CURRENTS_API_KEY, JSEARCH_API_KEY, PREWARM_SECRET
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/health` for a liveness check, or
`http://localhost:8000/docs` for the interactive OpenAPI/Swagger UI.

For Firestore/Auth access locally, you need Application Default Credentials
pointed at the `myproject-a48d7` Firebase project — either
`gcloud auth application-default login`, or a service account key referenced
via `GOOGLE_APPLICATION_CREDENTIALS` in `.env`. To use the Firebase emulator
suite instead (no real credentials needed), set before starting uvicorn:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
export FIREBASE_PROJECT_ID=myproject-a48d7
```

The sandboxed Code Clash/Assessments judge shells out to `node`, `python3`,
`javac`/`java`, and `g++` — install all four locally if you're touching that
path (the Docker image already has them).

## Deployment

- **Frontend** deploys to **Vercel** on push to `main` (Vercel project Root
  Directory: `frontend`).
- **Backend** deploys to **Google Cloud Run** (region `asia-south1`) via a
  Cloud Build trigger on push to `main`, synced to `backend/deploy.sh`'s
  `--memory=1Gi --timeout=120s`. `deploy.sh` itself is a documented reference
  script, not run automatically — review it before running by hand.
- **Firestore rules/indexes** deploy via the Firebase CLI from `firebase/`:

  ```bash
  cd firebase
  firebase deploy --only firestore:rules
  ```
