# SkillPilot

SkillPilot is an AI-enhanced platform for interview preparation, coding assessments, and competitive real-time coding. It combines AI-driven mock interviews, a real-time 1v1 code battle mode ("Code Clash") across multiple languages, recruiter-run assessments, and a career hub (jobs + tech news) in one product.

## Monorepo structure

```
SkillPilot/
├── frontend/   React 19 + Vite SPA — the main app UI
├── backend/    FastAPI service (Cloud Run) — AI interviews, Code Clash judge, assessments, jobs/news proxies
├── firebase/   Firebase project config — Firestore rules/indexes, .firebaserc (no functions code; auth/Firestore only)
└── docs/       Deeper explanation docs (e.g. the backend migration writeup)
```

## Local development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Requires a `.env` with your Firebase web config and `VITE_API_BASE_URL` pointing at the backend (see `frontend/.env.example` if present, or `backend/README.md` for the corresponding backend env vars).

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in GROQ_API_KEY, GNEWS_API_KEY, JSEARCH_API_KEY
uvicorn app.main:app --reload --port 8000
```

Full setup details (Firestore/Auth credentials, emulator suite, language runtimes needed by the code judge) are in [backend/README.md](backend/README.md).

## Deployment

- **Frontend** deploys to **Vercel** on push to `main`. The Vercel project's Root Directory setting is `frontend`.
- **Backend** deploys to **Google Cloud Run**. See [backend/README.md](backend/README.md) for the full `gcloud run deploy` walkthrough and secrets setup; a documented `backend/deploy.sh` script is provided as reference (not run automatically).
- **Firestore rules/indexes** deploy via Firebase CLI from the `firebase/` directory:
  ```bash
  cd firebase
  firebase deploy --only firestore:rules
  ```

## Docs

See [docs/](docs/) for deeper explanations, including the writeup on why the backend migrated from Firebase Cloud Functions to a standalone FastAPI service on Cloud Run.
