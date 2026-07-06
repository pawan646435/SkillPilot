# The backend migration, explained

This walks through what changed when SkillPilot's backend moved from
Firebase Cloud Functions + a Vercel serverless function to a single FastAPI
service on Cloud Run — and why, concretely, in terms of the actual code.

## 1. Why we moved off Firebase Functions + Vercel

Three concrete problems, not abstract "microservices bad" reasoning:

**Sandboxing limitations.** The old judge
(`firebase-backend/proxy functions for api key/functions/src/judge.js`, now
`skillpilot/backend/app/services/judge.py`) spawns `node`, `python3`, `javac`+`java`,
and `g++` as child processes to run candidate-submitted code. Cloud
Functions gives you a container, but you don't get to *choose or control*
what's installed in it beyond what the Node runtime image ships with, and
you have very limited control over process-level resource limits (memory
caps, CPU caps per spawned child). In practice this meant the judge worked
by luck — whatever happened to be on the Cloud Functions Node 22 image — with
no way to add, say, a memory ulimit on the spawned subprocess. On Cloud Run,
we write the Dockerfile. We chose exactly what's installed
(`skillpilot/backend/Dockerfile` installs Node, a JDK, and g++ explicitly), and
`judge.py`'s `_limit_resources()` can call `resource.setrlimit` on the
child process because we're not fighting an opaque platform image to do it.

**No clean streaming path.** This didn't end up mattering for what got
built (nothing here streams responses yet), but it's a real constraint:
Cloud Functions' `onCall` protocol is one request in, one JSON response out.
There's no way to stream a long-running AI response token-by-token back to
the browser. FastAPI on Cloud Run supports `StreamingResponse` / SSE /
WebSockets natively — so if SkillPilot ever wants to stream the AI
interviewer's response as it's generated (instead of waiting for the whole
thing), that's now just a different return type in a route handler, not a
platform migration.

**Split deploy targets.** Before this migration, "the backend" was actually
two independently deployed things: Firebase Cloud Functions
(`firebase-backend/proxy functions for api key/functions/`) for
Groq/GNews/Clash/Assessments, and a *separate* Vercel serverless function
(`skillpilot/api/jobs.js`) for job search — deployed alongside the frontend,
on a totally different platform, with its own env vars and its own cold-start
behavior. There was no good reason for jobs to live somewhere different from
everything else; it happened because the Vercel job-search implementation
worked and the Firebase one (`functions/src/jobs.js`, now deleted) never
got wired up correctly. Now `skillpilot/backend/app/routers/jobs.py` sits next to
`clash.py` and `news.py` — one codebase, one deploy target, one place to add
the next proxy route.

## 2. How Cloud Run differs from Cloud Functions (using this migration)

Both are "serverless" in the sense that you don't manage servers and you can
scale to zero. The difference is *what unit you deploy*.

- **Cloud Functions**: you deploy *individual functions*. Each exported
  function in `functions/index.js` (`fetchNews`, `fetchGroqChat`,
  `runClashCode`, etc.) was its own independently-scaled, independently-cold-
  starting unit, each getting its own container instance. `functionConfig` in
  `functions/src/config.js` (`region`, `maxInstances`, `memory`) applied
  per-function.

- **Cloud Run**: you deploy *one container image* that can serve many HTTP
  routes internally. `skillpilot/backend/app/main.py` registers five routers
  (`interview`, `clash`, `assessments`, `jobs`, `news`) inside **one**
  FastAPI app; Cloud Run runs instances of that single container, and
  routing between `/interview/question` vs `/clash/run` vs `/jobs` happens
  *inside* the app (FastAPI's router dispatch), not at the platform level.
  One `gcloud run deploy` (see `skillpilot/backend/deploy.sh`) ships everything at once.

Practically, this means: adding a new backend feature used to mean adding a
new exported function to `functions/index.js` and redeploying the whole
Functions codebase (which redeployed every function, cold-starting them all
again). Now it means adding a route to an existing router (or a new router
file), and redeploying the one container — see section 6.

The `--min-instances=0` flag in `deploy.sh` is Cloud Run's equivalent of
Cloud Functions' natural scale-to-zero behavior — same free-tier-friendly
idea (no charges while idle), same cold-start tradeoff (the first request
after idle time waits for a container to start).

## 3. The Firebase ID token auth flow, end-to-end

This didn't change *conceptually* — it's the same trust model as
`functions/src/auth.js`'s `assertAuthenticated` — but the mechanics moved
from an SDK-managed protocol to an explicit HTTP header, so it's worth
walking through concretely.

**Frontend side** (e.g. `skillpilot/src/services/clashService.js`):

```js
async function authHeaders() {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}
```

`auth.currentUser` is the Firebase JS SDK's already-logged-in user object
(nothing new here — the frontend's login flow, `onAuthStateChanged`, all of
that is completely unchanged). `getIdToken()` returns the user's current
Firebase ID token — a short-lived JWT signed by Google, refreshed
automatically by the SDK as needed. This gets attached as a standard
`Authorization: Bearer <token>` header on every request to the backend.

Previously, this exact same token existed and was sent — but the Firebase
Functions SDK's `httpsCallable()` attached it *for you*, invisibly, as part
of the callable protocol. The token itself, and what it proves (who the
signed-in user is), hasn't changed at all. What changed is that we now
attach it ourselves with a plain `fetch()` call, because there's no
Functions SDK anymore.

**Backend side** (`skillpilot/backend/app/dependencies/auth.py`):

```python
async def require_auth(authorization: str | None = Header(default=None)) -> DecodedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="You must be logged in.")

    id_token = authorization[len("Bearer "):].strip()
    decoded_token = firebase_auth.verify_id_token(id_token)
    return DecodedUser(decoded_token)
```

`require_auth` is a FastAPI **dependency** — you declare it as a parameter
default on any route (`user: DecodedUser = Depends(require_auth)`) and
FastAPI runs it before your route body, short-circuiting with the 401 if it
raises. `firebase_auth.verify_id_token` (from the `firebase-admin` Python
SDK) checks the JWT's signature against Google's public keys, checks it
hasn't expired, and checks the `aud` claim matches your Firebase project —
if all of that passes, you get back a dict with `uid`, `name`, `email`, etc.,
wrapped here in `DecodedUser` so callers can write `user.uid` instead of
`decoded_token["uid"]`.

This is the exact same verification Cloud Functions' `onCall` protocol did
for you automatically (populating `request.auth`) — we're just doing
explicitly, in one place, what the platform used to do implicitly.

## 4. Python subprocess sandboxing vs. the Node version

The core approach is unchanged: for each test case, write the candidate's
code plus a small runner harness to a temp file, spawn the right interpreter/
compiler as a subprocess, feed it the test input via an environment variable
(`JUDGE_INPUT_JSON`), capture stdout, compare it to the expected output.

What's mechanically different:

- **Process spawning**: Node's `child_process.spawn` + a manual
  `setTimeout`-based kill (see the old `runProcess` in `judge.js`) becomes
  Python's `subprocess.run(..., timeout=6)`, which handles the timeout,
  kill, and "give me whatever partial output there was" logic in one call
  (`subprocess.TimeoutExpired`'s `.stdout`/`.stderr` attributes).
- **Temp directories**: `fs.mkdtemp` + a manual `fs.rm` in a `finally` block
  becomes `tempfile.TemporaryDirectory()` as a context manager — the
  directory is guaranteed cleaned up when the `with` block exits, including
  on exceptions, with no separate cleanup call to remember.
- **Resource limits (new)**: `judge.py`'s `_limit_resources()` calls
  `resource.setrlimit(resource.RLIMIT_AS, ...)` and `RLIMIT_CPU` via a
  `preexec_fn` passed to `subprocess.run`, capping the spawned child's
  address space and CPU time. Cloud Functions gave us no equivalent hook —
  we didn't have a way to intercept "the moment right before this child
  process actually starts running" to set OS-level limits on it. This is a
  genuine new safety net, enforced by the Linux kernel in the Cloud Run
  container. (It's a *best-effort* net, not a hard guarantee — see the code
  comment in `judge.py` for why RLIMIT_AS is unreliable on macOS dev
  machines specifically; it's solid on the Linux container that actually
  runs in production.)
- **A real bug got fixed, not just ported**: the Node Java judge wrote the
  candidate's `public class Solution` and the harness's `public class Main`
  into a *single file* named `Solution.java`. Java doesn't allow two public
  top-level classes in one file — this means the Cloud Functions judge would
  have failed to compile *any* Java submission using its own documented
  starter-code convention. Confirmed by testing: this is a real defect that
  existed the entire time Cloud Functions was serving Java Clash matches,
  presumably going unnoticed because nobody had actually played a Java match
  end-to-end. `judge.py`'s `_execute_java` now writes `Solution.java` and
  `Main.java` as two separate files and compiles both — which is what
  `javac` actually requires for multi-class compilation. This surfaced
  during the local verification pass (Task 8), by literally running a Java
  submission through the sandbox and watching it fail to compile with an
  error that had nothing to do with the port itself.

## 5. What "the frontend didn't change" actually means

Precisely: **four service files**, plus environment config, were touched.
Nothing else.

- `skillpilot/src/services/groqService.js`
- `skillpilot/src/services/clashService.js`
- `skillpilot/src/services/assessmentService.js`
- `skillpilot/src/services/jobsService.js`
- `skillpilot/.env` / `.env.example` (added `VITE_API_BASE_URL`)
- `skillpilot/vercel.json` and `vite.config.js` (removed the now-dead
  `/api/*` rewrite and dev proxy — these are build/deploy config, not
  frontend *code*, and nothing about them affects what a user sees or how
  any page behaves)

Every one of those four service files exports the exact same function
names, taking the exact same arguments, returning the exact same shape of
data, as before. `runClashCode(payload)` still returns `{ result: {...} }`.
`submitAssessmentAnswer(payload)` still returns
`{ status, score, passed, total, ... }`. `getJobsFromProxy(category)` still
returns `{ jobs, fetchedAt, source, ... }`. The only thing that changed
*inside* those functions is which URL they `fetch()` and how they attach the
auth header — the HTTP transport, not the contract.

Every page, component, and layout file — `Clash.jsx`, `TakeAssessment.jsx`,
`News.jsx`, `Jobs.jsx`, `InterviewRoom.jsx`, all of `src/pages/dashboard/`,
`DashboardLayout.jsx`, the custom cursor, everything — imports from these
service files and calls the same functions the same way it always did. They
have no way to know the backend is now Python instead of Node, because the
contract they depend on (the exported function signatures) never moved.

One thing was checked and explicitly *not* touched: `Clash.jsx` reads and
writes Firestore directly via the Firebase JS SDK (`onSnapshot`, `setDoc`,
`updateDoc` on `battles/{roomId}` documents) for realtime battle sync. That's
unrelated to this migration — those calls never went through Cloud
Functions or the new FastAPI backend, and they still don't. Firestore access
for realtime UI state was, is, and remains a direct frontend-to-Firestore
relationship.

## 6. Adding a new backend feature, going forward

The old pattern: write a new file in `functions/src/`, export a handler,
require it and re-export it from `functions/index.js`, redeploy the whole
Functions codebase.

The new pattern: **add a router**.

1. Create `skillpilot/backend/app/routers/your_feature.py`.
2. Define Pydantic request/response models — this is the payoff of the
   Task 4 migration from untyped `onCall` payloads: FastAPI validates the
   request body against your model automatically and rejects malformed
   requests with a 422 before your route body even runs, and the models
   double as documentation (visible live at `/docs`).
3. Write your route function, taking `user: DecodedUser = Depends(require_auth)`
   as a parameter if the route needs a signed-in caller (see
   `dependencies/auth.py`) — same idea as calling `assertAuthenticated` at
   the top of an old Node handler.
4. If you need Firestore, call `from app.services.firestore_client import get_db`
   and use it the same way every other router does.
5. Register the router in `app/main.py`:
   ```python
   from app.routers import your_feature
   app.include_router(your_feature.router)
   ```
6. Update the relevant frontend service file (or add a new one) to `fetch()`
   the new route with the same auth-header pattern every other service file
   already uses.
7. Redeploy with the same `gcloud run deploy` command in `skillpilot/backend/deploy.sh`
   — the whole container, one command, no per-function bookkeeping.

No new Cloud Functions codebase entries, no separate deploy target, no
platform-specific config block to remember. It's one FastAPI app; a new
feature is a new router, the same way a new page in the frontend is a new
file in `src/pages/`.
