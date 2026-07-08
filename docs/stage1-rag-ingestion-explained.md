# Stage 1: RAG context ingestion, explained

This is a tutorial written for you specifically, using the actual code you now
have in `backend/app/services/{embeddings,chunking,retrieval}.py` and
`backend/app/routers/rag.py`, and the actual numbers produced when that code
ran against your own test resume. Nothing here is a placeholder — every
score, every chunk boundary, every memory number came from running your code.

Stage 1 builds *ingestion*: turning raw text into searchable chunks. It does
not build the AI interviewer that uses this context — that's Stage 2. Nothing
in this stage is wired into the existing `/interview/*` routes.

---

## 1. What RAG means, using this implementation as the example

RAG = **Retrieval-Augmented Generation**. Instead of an LLM answering purely
from what it memorized during training, you *retrieve* relevant facts from
your own data first, then hand those facts to the LLM as part of the prompt.

Concretely, in this feature: today, `routers/interview.py`'s
`generate_question` builds a prompt from just `role` and `difficulty` — the
AI interviewer has no idea what's actually on this candidate's resume. Stage 1
is the "retrieval" half of RAG: `POST /rag/ingest` takes a resume, breaks it
into searchable chunks, and stores them. Stage 2 will be the part that
actually plugs `retrieve_relevant_chunks()` (which you already have and have
tested — see §4) into a prompt, so the interviewer can ask "I see you
mentioned Kafka — walk me through that" instead of a generic question.

---

## 2. What an embedding is, using your real model output

An embedding model converts text into a fixed-length list of numbers (a
"vector") positioned in space such that *similar meaning → similar position*.
`services/embeddings.py` loads `all-MiniLM-L6-v2`, which converts any text
into **384** numbers.

Here's real output from your model, embedding four short test sentences:

```
Vector dimensionality: 384
First 8 values of vector 0: [0.0086, 0.0544, 0.042, -0.0284, -0.018, -0.1037, -0.0451, 0.0121]
```

Those 8 numbers mean nothing on their own — no single dimension corresponds to
a human concept like "seniority" or "leadership." What matters is *relative
position*. Here's the proof, using cosine similarity (explained fully in §4)
between that first sentence and three others:

| Sentence pair | Cosine similarity |
|---|---|
| "Led a team of 5 engineers to rebuild the payments pipeline..." vs. "Managed a software department and oversaw the modernization of transaction processing systems." | **0.283** |
| "Led a team of 5 engineers..." vs. "5+ years of experience with React, Node.js, and PostgreSQL..." | **0.261** |
| "Led a team of 5 engineers..." vs. "Baked a chocolate cake for the office party last Friday." | **0.047** |

The engineering-leadership sentence and its management-rephrase score highest,
the unrelated cake sentence scores lowest — that's "similar meaning produces
similar vectors" happening in your own numbers, not a diagram.

**Worth being honest about:** notice the leadership-rephrase pair (0.283)
isn't *dramatically* higher than the React/Node pair (0.261). `all-MiniLM-L6-v2`
is a small, fast model, not the most precise one available — see §9.

---

## 3. Why we chunk before embedding, and why overlap matters — using your real chunk boundary

If you embedded an entire two-page resume as one vector, that one vector has
to represent *everything* at once — the PostgreSQL experience, the team of
five, the chocolate-cake-adjacent hobbies section, all smeared into one
average point. Retrieval couldn't then point at the specific relevant fact;
it could only say "this whole resume is somewhat relevant."

`services/chunking.py` splits text into ~400-token chunks, built from whole
sentences, with each new chunk starting by repeating the tail of the previous
one (~17.5% overlap). Here's what that produced on your real test resume
(`Pawan Kumar / Senior Backend Engineer`, 2 jobs, skills, education):

- **Chunk 0**: 394 tokens (1578 chars) — Summary through most of the PriorCo
  role, ending: *"...Led a team of five engineers through a rebuild of the
  transaction processing system, migrating from a monolith to event-driven
  microservices on Kafka. Mentored two junior engineers who were later
  promoted."*
- **Chunk 1**: 107 tokens (428 chars) — starts mid-sentence: *"40% by
  introducing a caching layer in front of the fraud-scoring service. **Led a
  team of five engineers through a rebuild of the transaction processing
  system, migrating from a monolith to event-driven microservices on Kafka.
  Mentored two junior engineers who were later promoted.**"*

The bolded sentence pair appears in **both** chunks. That's overlap doing its
job: if chunk 0 and chunk 1 had been split with no overlap, and a candidate's
mentorship experience happened to fall right at that boundary, only one chunk
would carry it — and if retrieval picked the wrong side, that fact would be
invisible to the interviewer. With overlap, the fact survives in whichever
chunk retrieval happens to pick.

---

## 4. How cosine similarity works, walking through your actual code

`services/retrieval.py`:

```python
def _cosine_similarity(a: list[float], b: list[float]) -> float:
    a_vec, b_vec = np.array(a), np.array(b)
    return float(np.dot(a_vec, b_vec) / (np.linalg.norm(a_vec) * np.linalg.norm(b_vec)))
```

This is literally the formula `cos(θ) = (a · b) / (‖a‖ × ‖b‖)`:

- `np.dot(a_vec, b_vec)` — the dot product: multiply each pair of matching
  numbers from the two 384-length vectors and sum them up. This gets bigger
  when the vectors "agree" (point the same way) and smaller/negative when
  they don't.
- `np.linalg.norm(a_vec)` — the vector's length (magnitude). Dividing by both
  vectors' lengths means we're only measuring *direction*, not magnitude — a
  long chunk and a short chunk can still be "similar" if they point the same
  way.
- The result ranges from -1 (opposite direction) to 1 (identical direction).
  For real sentence embeddings, unrelated text tends to land near 0-0.2,
  related text noticeably higher — which is exactly what §2's table showed.

`retrieve_relevant_chunks()` then: embeds the query with the same model,
pulls every chunk document for the session from Firestore, scores each one
against the query with this function, and returns the top-K by score:

```python
scored.sort(key=lambda item: item["similarity"], reverse=True)
return scored[:top_k]
```

---

## 5. Why no vector database yet, and when that changes

A vector database (Pinecone, Weaviate, pgvector, etc.) exists to make "find
the closest vectors" fast when you have *too many* vectors to just compare
against all of them — it builds an approximate index (like HNSW) that trades
a little accuracy for a lot of speed.

Your test session had **2 chunks**. Comparing a query vector against 2 (or
even 30, for a long resume + long JD) stored vectors with a Python loop and
numpy is sub-millisecond. A vector database here would add a new service to
run, a new thing that can go down, and a new bill — for zero measurable
speed benefit.

**Where the tradeoff flips:** roughly once a *single query* needs to search
across tens of thousands of vectors — e.g. if this feature grew into
"search across every candidate this company has ever interviewed" instead of
"search within one candidate's resume," or if one document ballooned into
thousands of chunks. Neither is true for a single interview session's
context, which is what Stage 1-2 need.

---

## 6. Why the model runs in-process — and the FastAPI migration connection

`embeddings.py` loads `all-MiniLM-L6-v2` directly into the Python process via
`sentence-transformers`, rather than calling out to a hosted embedding API.
This only works well because of the same migration described in
`docs/backend-migration-explained.md`: on the old Cloud Functions setup, you
didn't control the container image or its resource limits — you got whatever
the platform's Node runtime image shipped with. Running a ~90MB PyTorch model
in-process needs a container *you* built, with a memory ceiling *you* set
(see §9's flag on `--memory=512Mi`). `backend/Dockerfile` already installs
whatever the judge subprocess needs explicitly (Node, JDK, g++) for exactly
this reason — RAG's model weights are the same story: Cloud Run gives you a
real container to put real dependencies in, not a locked-down function
runtime.

The alternative — calling a hosted embeddings API (OpenAI, Cohere, etc.) —
would avoid the memory cost entirely, at the price of a network round-trip
per embedding call and a per-call cost. For a learning project doing local,
free, offline embedding generation, in-process is the right call; a
higher-scale production system might reconsider that tradeoff (see §9).

---

## 7. The admin-SDK vs. security-rules nuance, revisited

`backend/app/services/firestore_client.py` talks to Firestore using
`firebase-admin`, authenticated as a **service account** — not as the end
user. Service-account access bypasses Firestore security rules entirely;
rules only apply when a client (browser, mobile app) talks to Firestore
*directly* using a user's Firebase Auth token.

Your frontend never touches `interviewSessions` directly for *writing* — it
calls `POST /rag/ingest`, and `require_auth` (`dependencies/auth.py`) verifies
the caller's Firebase ID token before the backend touches Firestore at all.
The real access control is: `require_auth` proves who's calling, then
`routers/rag.py` checks `existing.to_dict().get("uid") != user.uid` before
letting anyone read or append to someone else's session.

`firebase/firestore.rules` still got an owner-only rule added for
`interviewSessions` (matching the existing `users/{userId}` pattern):

```
match /interviewSessions/{sessionId} {
  allow read: if isSignedIn() && resource.data.uid == request.auth.uid;
  allow write: if false;
  ...
}
```

This *is* actually load-bearing for one thing: `frontend/src/services/ragService.js`'s
`fetchSessionChunks()` reads chunks straight from Firestore via the client
SDK (for the dev test page — see §8) rather than going through the backend.
That read *does* go through security rules, since it's a direct client→Firestore
call. So the rule isn't purely theoretical here — it's what makes the dev
test page's direct read safe. But writes stay backend-only (`allow write: if
false`), and the backend's own reads bypass rules via the admin SDK either
way.

---

## 8. Concrete walkthrough: your real chunk, your real query, your real scores

Full pipeline, run against a local Firestore emulator (not made up):

**Ingested:** your test resume → 2 chunks (chunk 0: summary + most of PriorCo
role; chunk 1: end of PriorCo role + Skills + Education, including the line
`Python, FastAPI, Node.js, Firebase/Firestore, PostgreSQL, Kafka, Docker,
Google Cloud Run, React.`).

**Query 1:** *"Does this candidate have experience leading or mentoring a
team?"*

| Chunk | Similarity |
|---|---|
| Chunk 1 (contains "Led a team of five... Mentored two junior engineers") | **0.2565** |
| Chunk 0 (contains "Currently leading the migration...") | 0.2430 |

Makes sense: chunk 1 has the explicit, literal mentorship sentence. Chunk 0
scores close behind mainly because it also contains the word "leading" (in a
different context — leading a migration, not leading people), which is a
believable reason two chunks land close together.

**Query 2:** *"What database and backend technologies has this person worked
with?"*

| Chunk | Similarity |
|---|---|
| Chunk 1 (contains the Skills line: Python, FastAPI, PostgreSQL, Kafka...) | **0.4034** |
| Chunk 0 | 0.3746 |

Makes sense, clearly: chunk 1 literally has the tech stack list. This is the
cleanest, most confident ranking of the three queries.

**Query 3 (control — should be irrelevant):** *"Does this candidate have
experience with cooking or recipes?"*

| Chunk | Similarity |
|---|---|
| Chunk 1 | 0.2631 |
| Chunk 0 | 0.2045 |

**This is the "tell me if something looks off" moment, and something does.**
The cooking query's top score (0.2631) is *not* meaningfully lower than Query
1's top score (0.2565) — an irrelevant query scored about the same as a real
one. See §9 for why, and what it means practically.

---

## 9. What's genuinely simplified here vs. what production would add

Being explicit, as asked:

- **The similarity "noise floor" problem is real, not hidden.** Query 3
  above shows `all-MiniLM-L6-v2` doesn't cleanly separate "relevant" from
  "irrelevant" in absolute terms — general English sentences share a
  nonzero baseline similarity in this model's embedding space. **Relative
  ranking** (which of *these specific* chunks is more relevant to *this*
  query) still worked correctly in all three tests above. But you could not
  use a fixed similarity threshold (e.g. "only trust chunks scoring above
  0.4") to decide whether a chunk is relevant *at all* — this model doesn't
  support that. A production system wanting cleaner separation would use a
  model built for asymmetric query-vs-passage retrieval (e.g. the BGE or E5
  embedding families, which use different prefixes for "this is a query" vs.
  "this is a passage" during training) instead of this general-purpose
  sentence-similarity model.
- **Chunking is heuristic, not tokenizer-exact.** `chunking.py` estimates
  tokens as `len(text) // 4` (a rough English-language rule of thumb) rather
  than running the actual model's tokenizer. That's fine at this scale — a
  chunk being 380 vs. 420 actual tokens doesn't matter for a retrieval
  system with no hard context-window budget yet — but a production system
  packing chunks against a strict LLM context limit would tokenize exactly.
- **No re-ranking step.** Production RAG systems often retrieve a larger
  candidate set (e.g. top 10) with a cheap method (this cosine similarity)
  and then re-score just those 10 with a slower, more accurate cross-encoder
  model before picking the final top-K. We return the raw top-K directly —
  reasonable at 2-30 chunks, not at scale.
- **No dedup/near-duplicate handling.** If a resume repeats a phrase (common
  in real resumes — "results-driven engineer" style boilerplate in a summary
  *and* a cover-letter-style paragraph), nothing here notices two chunks are
  near-duplicates and thins them out.
- **The `--memory=512Mi` Cloud Run setting has not been raised, and needs to
  be before this deploys.** Loading `all-MiniLM-L6-v2` and running one batch
  of 4 sentences peaked at **619 MB RSS** locally — before FastAPI,
  firebase-admin, or concurrent requests are layered on top. This isn't a
  bug in the code; it's PyTorch's own runtime footprint (linked math
  libraries), not the ~90MB model file itself. `backend/deploy.sh` needs its
  `--memory=512Mi` raised (1Gi is a reasonable starting point) before this
  ships — flagged here explicitly, not fixed automatically, since it's a
  deploy-time change to a script you run by hand against production infra.
- **`chunk_with_metadata`'s token estimate and the schema's `tokenCount`
  field are consistent with each other but both approximate** — fine for a
  learning-scale project, not something to treat as an exact LLM token
  budget.

---

## 10. What's NOT built yet

- Retrieval isn't called by anything user-facing. `retrieve_relevant_chunks()`
  exists, is tested (§8), and is ready — but no route calls it yet. That's
  Stage 2's job: plugging retrieved chunks into the interview question/answer
  prompts in `routers/interview.py` (which Stage 1 deliberately never
  touched).
- No streaming (Stage 3) and no evaluation harness (Stage 4) exist yet.
- The `interviewSessions.config` field (role/difficulty/questionCount/etc.)
  is written as an empty object by `/rag/ingest` when creating a new session
  — nothing yet populates it. That wiring (session creation flow meeting the
  existing interview setup flow) is a Stage 2 concern, not built here to
  keep this stage isolated as requested.
