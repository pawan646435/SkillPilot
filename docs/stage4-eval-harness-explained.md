# Stage 4: The eval harness, explained

Like the Stage 1-3 docs, this is written for you specifically, using the code
now in `backend/evals/golden_set.json` and `backend/scripts/run_evals.py`,
and the actual output of real runs on 2026-07-12 against a local Firestore
emulator with **real Groq calls** (eval runs `task1-2-smoketest`,
`task3-consistency-run1/2/3`, `task4-panel-v1`, `task4-panel-v2`,
`task6-final-verification` — all persisted as documents in Firestore's
`evalRuns` collection, plus raw JSON under `backend/evals/results/`). Every
question, similarity score, and timing below is copied from those runs, not
invented.

Stage 4 is the last of the four stages. It doesn't add a feature a candidate
or interviewer would ever see — it adds a way to answer the question every
prior stage quietly set up for: *did a change to the panel's prompts make
things better or worse?*

---

## 1. What an eval is, and why it isn't a unit test

A unit test works because the function under test is **pure**: same input,
same output, every time. `chunk_with_metadata()` and `_cosine_similarity()`
are like this — you can `assert result == expected` and trust it forever.

An LLM call breaks that in two ways:

1. **Non-determinism.** Call Groq twice with the identical prompt and you can
   get two different, both-reasonable strings back. You saw this directly in
   Task 3: the exact same resume, query, and prompt version produced three
   different phrasings of the same question across three runs.
2. **No single correct answer.** "Ask a good technical interview question
   grounded in this resume" doesn't have one right string. A dozen different
   phrasings could all be excellent.

An eval doesn't try to assert exact output. It splits the pipeline into two
kinds of claims:

- **Deterministic scaffolding around the LLM call** — did retrieval run, what
  similarity score came back, did the threshold decision come out as
  expected. In this codebase that's `panel_agents.py`'s
  `prepare_question_turn()`: fixed resume text embeds to a fixed vector,
  cosine similarity is arithmetic, and `used_fallback = ... < 0.15` is a
  plain comparison. An eval asserts this exactly, every run.
- **The fuzzy part** — is the generated question actually good. An eval
  doesn't answer this true/false; it *records* it (text, length, timing) so
  a human — or, in a more built-out system, a second LLM acting as a judge —
  can read it.

This is why every turn since Stage 2 has carried `promptVersion="panel-v1"`,
unread until now. It's the join key that turns "we changed a prompt, seems
fine" into an actual before/after comparison — which is §5 of this doc.

---

## 2. The golden set: what's mechanically checkable vs. not

`backend/evals/golden_set.json` holds 5 fixed, version-controlled cases —
not live session data. Each supplies a resume, which agent/turn to generate a
question for, and the expected deterministic behavior:

| Case | Persona | Resume content | Expected |
|---|---|---|---|
| `technical_distributed_systems` | technical | Kafka, sharded Postgres, circuit breakers | grounded question |
| `technical_ml_pipeline` | technical | PyTorch, Triton, feature store, DVC | grounded question |
| `technical_fullstack_mobile` | technical | React Native, GraphQL, offline-sync | grounded question |
| `hiring_manager_leadership` | hiring_manager | team of 8, mentoring, conflict resolution | grounded question |
| `fallback_offtopic_resume` | technical | a home-baking journal, zero tech/leadership content | **fallback** question |

Three technical-persona cases with completely non-overlapping resume content
(distributed systems / ML infra / mobile), one hiring_manager-specific case,
and one deliberately off-topic resume to exercise Stage 2's threshold
fallback. For each case, the golden set file itself documents the split:

**Mechanically checkable, every run:**
- retrieval returns candidate chunks (it never errors)
- the top similarity score, compared against `MIN_TOP_SIMILARITY=0.15`
- whether `used_fallback` came out as expected
- the question is non-empty and a reasonable length
- (soft proxy) whether the question text contains at least one resume-specific keyword

**Not mechanically checkable — needs a human to read the output:**
- whether the question is genuinely good, well-phrased, or the *most*
  interesting angle available
- for the fallback case, whether the model actually honored "do NOT pretend
  to reference their resume" rather than hallucinating a connection

That keyword check is explicitly a *proxy*, not proof — and §4 below shows
exactly why that distinction matters, using a real result that looked like a
failure but wasn't.

---

## 3. Why real Groq calls, not mocked ones

`backend/scripts/run_evals.py` makes real HTTP calls to Groq for every case,
every run. A mocked LLM call would return whatever canned string the mock
author decided to return — which means it can only ever catch bugs the mock
author already knew to anticipate.

This isn't hypothetical here. The **first** time this eval ran, it failed —
not because of a code bug, but because of a genuine `httpx.ReadTimeout`
talking to the real Groq API. A direct retry against Groq's endpoint
succeeded in 1.58s. That's the same category of lesson Stage 1's own tuning
run taught: an irrelevant-but-resume-flavored query scoring 0.1651 (just
above the 0.15 threshold) was a real, measured surprise about the embedding
model's actual behavior, not something anyone could have predicted from
reading the code. A mock can't reproduce a surprise — by construction, it
only returns what you already told it to return. An eval that mocks the one
genuinely unpredictable part of the system is an eval of your scaffolding,
not of your system.

The runner also doesn't reimplement any panel logic. It imports and calls
`panel_agents.generate_technical_question` /
`generate_hiring_manager_question` — the literal functions
`routers/panel.py`'s `_GENERATE` dict dispatches to. Session setup (chunking
+ embedding a resume) also reuses `chunk_with_metadata` and
`embeddings.embed_batch` directly, the same functions `routers/rag.py`'s
`/rag/ingest` calls. The only thing skipped is the HTTP/auth layer, since the
eval targets the panel logic, not the ingest endpoint's request contract.

---

## 4. What consistency testing revealed (including the surprising part)

Task 3 ran 3 of the golden set's technical-persona cases, 3 times each, same
input, same prompt version, back to back. The full real data:

```
technical_distributed_systems  — top_similarity every run: 0.3475370963032233
technical_ml_pipeline          — top_similarity every run: 0.2364934610810141
technical_fullstack_mobile     — top_similarity every run: 0.1789486395255333
```

**What stayed identical, exactly as it should:** the top similarity score,
bit-for-bit, on all 9 runs. `used_fallback` was `False` on all 9. Retrieval
is pure arithmetic over a fixed resume and a fixed query — there was never a
reason for it to move, and it didn't.

**What varied, exactly as it should:** phrasing. Three different questions
each time, e.g. for `technical_distributed_systems`:

```
run 1: "...how you handled backpressure under load when processing 40k messages
        per second across 12 microservices?"
run 2: "...how you handled idempotency keys for at-least-once delivery and
        ensured backpressure under load..."
run 3: "...how you designed the retry and circuit-breaker layer in Go..."
```

All three are reasonable, differently-angled technical questions. This is
`temperature=0.7` doing exactly what it's supposed to.

**The part that looked concerning but wasn't a real regression:**
`technical_fullstack_mobile` failed 2 of 3 runs on the mechanical grounding
check. Reading the actual questions:

```
run 1: "...offline-sync layer in your React Native app..."   -> keyword hit, PASS
run 2: "...offline-sync layer in your consumer app..."        -> keyword miss, FAIL
run 3: "...offline-sync layer in your consumer app..."        -> keyword miss, FAIL
```

All three questions reference the exact same resume specifics (last-write-wins,
manual merge, offline-sync layer) — they're equally well-grounded. The model
just doesn't reliably say "React Native" by name; it sometimes paraphrases to
"consumer app." The keyword list only checked for brand names, so it was
brittle to a harmless paraphrase. **This is a flaw in the mechanical proxy,
not in the system under test** — exactly the gap §2 flagged in advance
("not proof the question is well-phrased"). The fix was to broaden that
case's `grounding_keywords` to include concept-level phrases actually present
in the resume text (`last-write-wins`, `conflict resolution`,
`offline-sync`), not to declare the case "flaky" and move on. If a similar
finding ever showed the *threshold decision itself* flipping between runs on
identical input, that would be a real bug worth stopping for — it didn't.

---

## 5. The prompt-version regression check (the actual point of this stage)

Task 4 demonstrated the mechanism this whole stage exists to enable. Starting
point: `panel_agents.py`'s technical-interviewer system prompt, tagged
`panel-v1`. Change made: appended one sentence —
*"Keep every question to a single, tightly-scoped sentence — no multi-part
questions."* — and bumped `PROMPT_VERSION` to `"panel-v2"`. Same golden set,
run against both, back to back:

| Case | panel-v1 (chars) | panel-v2 (chars) | used_fallback / top_similarity |
|---|---|---|---|
| technical_distributed_systems | 327 | 132 | identical both versions |
| technical_ml_pipeline | 240 | 129 | identical both versions |
| technical_fullstack_mobile | 278 | 165 | identical both versions |
| hiring_manager_leadership | 215 | 207 | identical both versions |
| fallback_offtopic_resume | 188 | 122 | identical both versions |

Real v1 → v2 pair, `technical_distributed_systems`:

```
v1: "Can you walk me through the design decisions you made when implementing
     the retry and circuit-breaker layer in Go for the internal service mesh,
     specifically how you balanced the tradeoffs between latency and fault
     tolerance in the face of cascading failures like the one that took down
     three unrelated services for 40 minutes?"

v2: "How did you handle backpressure under load in the Kafka-based event
     pipeline processing 40k messages/second across 12 microservices?"
```

Three real findings from this comparison:

1. **The change worked, measurably.** Every technical-persona question got
   shorter (roughly 40-55%), consistent with the instruction.
2. **The control case proved isolation.** `hiring_manager_leadership` barely
   moved (215 → 207 chars) because that case uses the `hiring_manager`
   persona's system prompt, which the edit never touched. If that case had
   also changed sharply, it would mean the personas' prompts weren't as
   isolated as the code implies.
3. **A real cost, not hidden:** the v2 `technical_fullstack_mobile` question —
   *"How did you handle cases where the last-write-wins conflict resolution
   strategy in the offline-sync layer led to data loss for users with
   genuinely conflicting edits"* — is missing its trailing question mark.
   Squeezing to one tightly-scoped sentence seems to make the model drop
   terminal punctuation on some longer single-clause questions. A real team
   would weigh this against the length win before shipping.

Also notice: `top_similarity` and `used_fallback` were bit-identical between
v1 and v2 for every case. That's the eval confirming the prompt change
touched *only* the half of the pipeline it was supposed to touch — retrieval
and thresholding never look at prompt text.

The deliberate change was then reverted (`git diff` on `panel_agents.py`
came back empty, and a spot-check rerun confirmed `promptVersion=panel-v1`
and v1-style question phrasing were both back). `panel-v1` is the only real
prompt version in the codebase.

---

## 6. How a real team uses this going forward

The mechanism this stage built is exactly the one that just ran:

```
change a prompt  ->  bump promptVersion  ->  run the golden set against
old and new  ->  diff the results (deterministic fields + human-read fuzzy
fields)  ->  decide whether to ship
```

Concretely, for a team wanting to improve, say, the hiring_manager persona's
question quality: edit `_PERSONA_SYSTEM_PROMPTS["hiring_manager"]`, bump
`PROMPT_VERSION`, run `python scripts/run_evals.py --label
candidate-hm-v2`, then read the new run's `evalRuns` doc next to the old
one — same cases, same resumes, same thresholds, only the prompt differs.
If the deterministic checks (fallback behavior, similarity scores) stay
green and the human read of the fuzzy output looks better, ship it — keep
the new `PROMPT_VERSION` in the code and merge. If not, the old version is
still sitting in git history, and nothing was ever silently regressed
because there's a fixed yardstick to check against, not just a feeling.

---

## 7. What's simplified here vs. a production eval system

- **No automated "LLM-judges-LLM" scoring.** The fuzzy quality judgment is
  still a human reading the `question` field in the JSON output or the
  Firestore doc — this stage records the fuzzy output faithfully, it doesn't
  score it. A production system would add a second LLM call whose only job
  is "given this resume and this question, rate groundedness/quality 1-5,"
  itself versioned and periodically checked against human judgment.
- **A 5-case golden set.** Enough to prove the mechanism and exercise every
  code path (grounded x3, fallback, hiring_manager), not enough to catch
  every edge case a large resume corpus would surface.
- **The grounding-keyword check is a blunt proxy**, as §4's own finding
  demonstrated — brittle to paraphrase, not a measure of question quality.
- **No CI integration.** Nothing runs this automatically on every prompt
  change today; it's a manual `python scripts/run_evals.py` invocation.
- **Consistency testing only reruns 3 of 5 cases**, and only 3 times each —
  a production suite might run more cases, more repetitions, and track
  variance numerically over time rather than eyeballing 3 outputs.

## 8. What's not built (this closes the 4-stage feature)

Nothing is deliberately left unbuilt within this stage's scope — the golden
set, the real-code-path runner, consistency testing, the before/after
prompt-version demonstration, and Firestore persistence are all in place and
demonstrated above with real output. What a genuinely production-grade
system might add *next*, beyond this stage:

- **Automated regression gating in CI**: run the golden set on every PR that
  touches `panel_agents.py`, and block the merge if deterministic checks
  (fallback correctness, similarity thresholds) regress.
- **LLM-as-judge scoring** (§7) to turn the fuzzy half of the eval into a
  trend line instead of a manual read.
- **A larger, continuously-grown golden set** — every real production bug
  found in the panel's question generation becomes a new permanent case, the
  same way regression tests accumulate in traditional software.
- **Numeric variance tracking across consistency reruns** (e.g. flagging if
  question length or a judge score's standard deviation crosses a threshold)
  instead of a human reading 3 outputs side by side.

This is the fourth and final stage of the AI Interview Panel build. Stage 1
(RAG ingestion) built retrieval; Stage 2 (multi-agent panel) wired it into a
real interview; Stage 3 (streaming) made question generation feel
responsive; Stage 4 (this doc) made it possible to tell, with evidence,
whether a change to any of the above made things better or worse.
