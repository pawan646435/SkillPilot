# Stage 2: Multi-agent interview panel, explained

Like the Stage 1 doc, this is written for you specifically, using the code now
in `backend/app/services/panel_agents.py` and `backend/app/routers/panel.py`,
and the actual output of a full interview session run on 2026-07-09 against a
local Firestore emulator with **real Groq calls** (session
`nBx1LJ1jcTPPUozVO4K3`, plus deliberate-fallback session
`yS1UZMrUfHSQgtOuWtzr`). Every similarity score, question, and report below
is copied from that run, not invented.

Stage 2 wires Stage 1's ingestion/retrieval into an actual interview: three
AI personas, a fixed turn order, and one synthesized verdict. The old
single-agent flow in `routers/interview.py` is untouched.

---

## 1. What "multi-agent orchestration" means, using this implementation

"Multi-agent" does not mean three models or three processes. All three agents
here are **the same Groq model (`llama-3.3-70b-versatile`) given a different
identity, different inputs, and a different job**:

| Agent | System prompt says it is... | Reads | Writes |
|---|---|---|---|
| `technical` | senior-engineer interviewer probing depth | resume chunks (retrieved) | `question` + `evaluation` turns |
| `hiring_manager` | behavioral interviewer probing how you work with humans | resume chunks (retrieved, *different queries*) | `question` + `evaluation` turns |
| `panel_lead` | synthesizer of the panel's verdict | the full `turns` transcript | one `synthesis` turn + `finalReport` |

"Orchestration" is the part that decides *who speaks when* and carries state
between calls. Here that's `routers/panel.py`: a fixed plan
(`technical → hiring_manager → technical → hiring_manager → synthesis`), where
each question must be answered and evaluated before the next agent speaks.
The state lives in Firestore's `turns` subcollection — the transcript *is*
the state machine's memory (§5).

In the real run, that produced exactly this sequence of 13 persisted turns:

```
[0] technical      question    chunkIds=2  fallback=False
[1] technical      answer      chunkIds=0
[2] technical      evaluation  chunkIds=0
[3] hiring_manager question    chunkIds=1  fallback=False
...
[12] panel_lead    synthesis   chunkIds=0
```

every one tagged `promptVersion=panel-v1`.

---

## 2. Why different agents need different retrieval queries

Both resume-grounded agents search the **same** `contextChunks` store — the
same 2 chunks Stage 1's chunker made of your test resume. What differs is the
query vector, and cosine similarity ranks chunks *relative to the query*. One
shared retrieval call would give both agents the same "most relevant" text,
which forces one agent's questions to be grounded in the other agent's
evidence.

Real numbers from the run (top-2 scores per query):

| Agent, turn | Query | Chunk 0 (summary + FinEdge role) | Chunk 1 (PriorCo tail + skills) |
|---|---|---|---|
| technical Q1 | "What distributed systems, architecture, and system design work has this person done?" | **0.4661** | 0.2497 |
| technical Q2 | "What programming languages, databases, and technologies has this person worked with?" | **0.2839** | 0.2532 |
| hiring_manager Q1 | "Does this candidate have experience leading, mentoring, or managing a team?" | **0.1921** | 0.1464 |
| hiring_manager Q2 | "Has this person handled disagreement, conflict, or difficult situations with colleagues?" | 0.1536 | **0.1733** |

Notice hiring_manager Q2 is the only query where **chunk 1 wins** — because
chunk 1 contains the "disagreed productively with a product manager about
deadline scope" story, and the query is literally about disagreement. That
flip is the whole argument for per-agent queries in one table: same store,
different query, different evidence. And the generated questions tracked
their evidence — the Technical Interviewer asked about *"the caching layer
you introduced in front of the fraud-scoring service at FinEdge Payments"*
(chunk 0 content), while the Hiring Manager asked about *"a time when you had
to 'disagree productively' with a product manager, like you did at PriorCo
Software"* (chunk 1 content).

One honest caveat: with only 2 chunks in this resume, both agents often
retrieve overlapping text anyway (top-2 of 2 is... both). The mechanism
matters more at realistic scale — a 2-page resume + job description is
10-30 chunks, where "which 2 chunks get injected" genuinely differs per
agent.

### How the queries themselves were chosen (empirically)

The first draft used keyword-style queries ("team leadership and
collaboration experience"). Measured against the same resume, question-style
phrasing scored higher on 3 of 4 queries — e.g. the technologies query went
0.2456 → 0.2839 — because `all-MiniLM-L6-v2` was trained on
sentence-to-sentence similarity, and resume prose is shaped more like a
question's sentence than like a keyword list. The committed queries are the
measured winners, not the first draft.

---

## 3. The similarity threshold and fallback — and why Stage 1 already proved it's needed

Stage 1's Query 3 (the cooking control) showed this model has a **noise
floor**: an utterly irrelevant query still scored ~0.26 against resume
chunks, roughly tying a genuinely relevant query. Retrieval *always* returns
a top chunk — "top" means "least unrelated," not "related." Without a check,
Stage 2 would take whatever floats to the top and inject it into the prompt,
and the persona would then be *instructed to ground its question in that
text*. The failure mode isn't an error; it's a confidently personalized
question about something the candidate never said — the worst kind of bug,
one that looks like it's working.

So `panel_agents.py` checks the top chunk's score before injecting:

```python
used_fallback = not retrieved or retrieved[0]["similarity"] < MIN_TOP_SIMILARITY
chunks = [] if used_fallback else [c for c in retrieved if c["similarity"] >= MIN_TOP_SIMILARITY]
```

and on fallback, the prompt's context block becomes an explicit instruction:
*"No sufficiently relevant resume content was found for this topic. Ask a
strong generic question... do NOT pretend to reference their resume."* The
turn is stamped `usedFallback: true`.

### How 0.15 was picked (measured, not guessed)

Two documents were ingested and every agent query scored against both:

- **Test resume** (genuinely contains both technical and leadership content):
  on-topic top scores ranged **0.19 – 0.47**.
- **PaymentsAPI changelog** (real text, zero people/leadership content — a
  deliberate bad match): every agent query scored between **−0.10 and 0.12**.

0.15 sits in the measured gap between those clusters. It's inside the
0.15–0.2 range we'd guessed up front — but now it's a measurement with a
re-tuning procedure (rerun the comparison if the embedding model or chunking
changes), not a vibe.

**Known limit, stated plainly:** the cooking control scored 0.1651 against
this resume — *above* 0.15. With this embedding model, a threshold that keeps
real hiring-manager matches (0.1921) cannot also reject cooking (0.1651);
they're 0.027 apart, inside the noise. So this threshold reliably catches
"the document has nothing in this territory at all" (the changelog case), not
fine-grained irrelevance. The production fix is a retrieval-tuned embedding
model (BGE/E5 — Stage 1 doc §9), which separates those clusters properly.

### The fallback actually firing (real run)

Session `yS1UZMrUfHSQgtOuWtzr` ingested the changelog as its "resume":

```
TECHNICAL asks:
  retrieval query: 'What distributed systems, architecture, and system design work...'
  usedFallback: True
  chunk 8LKxoYqeuAJm92e11O2N sim=0.1043 [dropped (below threshold)]
  QUESTION: Can you describe a situation where you had to optimize the
  performance of a slow application, and walk me through the steps you took...

HIRING_MANAGER asks:
  usedFallback: True
  chunk 8LKxoYqeuAJm92e11O2N sim=-0.0219 [dropped (below threshold)]
  QUESTION: Tell me about a time when you had to collaborate with a
  cross-functional team to resolve a complex issue...
```

Both questions are generic but *sane* — no fabricated "I see on your resume
that you added idempotency keys" nonsense. The persisted turns carry
`usedFallback: true, retrievedChunkIds: []` so Stage 4's evals can count
exactly how often retrieval failed us.

The threshold also works *within* a passing turn: in the main session,
hiring_manager Q1's top chunk passed (0.1921) but the second chunk (0.1464)
was individually dropped — the turn persisted `chunkIds=1`. A strong #1
doesn't drag an unrelated #2 into the prompt.

---

## 4. One full real Groq prompt, end to end

This is byte-for-byte what was sent for the main session's first turn
(technical Q1), assembled by `_question_user_prompt` + `_context_block` from
the two retrieved chunks (sims 0.4661 / 0.2497 — both cleared 0.15):

**System message:**

```
You are the Technical Interviewer on a three-person interview panel. You
assess depth of engineering skill: architecture decisions, tradeoffs,
debugging instincts, and whether claimed experience holds up under probing.
You are direct and specific, like a senior engineer, not a quiz machine.
```

**User message (abridged only in the middle of excerpt 1; the run sent the full chunk text):**

```
Relevant excerpts from the candidate's resume:

[Resume excerpt 1]
Pawan Kumar
Senior Backend Engineer
...
Reduced checkout latency by 40% by introducing a caching layer in
front of the fraud-scoring service. Led a team of five engineers through a
rebuild of the transaction processing system, migrating from a monolith to
event-driven microservices on Kafka. Mentored two junior engineers who were
later promoted.
...

[Resume excerpt 2]
incidents, and disagreed productively with a product manager about deadline
scope — ... SKILLS
Python, FastAPI, Node.js, Firebase/Firestore, PostgreSQL, Kafka, Docker,
Google Cloud Run, React. EDUCATION
B.Tech in Computer Science, 2019.

Ask your next interview question: ONE technical question probing the specific
experience shown. If resume excerpts are provided above, ground the question
in a concrete detail from them (name the project/technology/situation, like a
real interviewer who read the resume). Keep it to 1-3 sentences.

You MUST respond ONLY with a valid JSON object:
{
  "question": "the question text",
  "topic": "short topic label"
}
```

**Groq's actual response** (via `fetch_groq_json`, which sets
`response_format: json_object` — a step up from the old interview flow's
"please return JSON" + fence-stripping):

```json
{
  "question": "Can you walk me through the caching layer you introduced in front of the fraud-scoring service at FinEdge Payments, and how you measured the 40% reduction in checkout latency?",
  "topic": "Caching and Performance Optimization"
}
```

That question names the caching layer, the fraud-scoring service, the
company, and the 40% number — all four facts came from the injected chunk,
none from the model's imagination. That's RAG's whole promise, observed.

The evaluation and synthesis calls follow the same shape (same persona system
prompt; the user message carries the question + answer, or the full
transcript). One real evaluation from the run — the same persona scoring the
deliberately shallow answer "Mostly Python and Node. I like FastAPI because
it's fast and has good docs." to a question about contract testing:

```
3/10 — The candidate failed to address the question about contract testing
techniques and their effectiveness... The answer seems to be a non-sequitur.
```

and the strong Kafka-architecture answer got 8/10 with specific strengths.
The scores tracked answer quality, which is exactly what Stage 4's evals will
measure systematically.

And the Panel Lead's real synthesized report (weighted 60% technical / 40%
cultural, per its prompt):

```json
{
  "hireRecommendation": "No Hire",
  "technicalSummary": "The candidate demonstrated some technical knowledge, but failed to provide clear and direct answers to key technical questions... Scores from the technical track were inconsistent, with a high of 8 and a low of 3...",
  "culturalFitSummary": "The candidate showed some evidence of leadership and collaboration skills... but also struggled to stay on topic...",
  "overallScore": 48,
  "synthesizedBy": "panel_lead"
}
```

A candidate scoring 8, 8, 3, 3 landing at 48/100 "No Hire" is a coherent
weighted synthesis of the actual transcript.

### Why panel_lead never calls retrieve_relevant_chunks

Retrieval exists to *select a few relevant pieces from a store too big to
inject whole*. The Panel Lead's input isn't the resume — it's the interview
transcript, and its job is to weigh **all** of it. The full 12-turn
transcript is a few thousand tokens; it fits in one prompt. Retrieving over
it would only risk silently dropping the very turns the verdict should
account for. Hence `retrievedChunkIds: []` on panel_lead turns: the resume's
influence reaches the Lead *indirectly*, already baked into the questions the
other two agents asked. Same reason `evaluation` turns don't retrieve — they
judge the answer against the question, both already in hand.

---

## 5. Why hand-roll the state machine instead of LangGraph/CrewAI

The entire orchestration problem in Stage 2 is: *walk a fixed 4-question
plan, alternate agents, don't let a question be skipped, synthesize at the
end.* In `routers/panel.py` that's ~20 lines: count question turns, check
whether the newest one has an evaluation, index into `_QUESTION_PLAN`.

Two reasons this beats a framework *here*:

1. **You'd learn the framework instead of the problem.** LangGraph's value is
   managing what's genuinely hard about agent graphs: cycles, branching,
   parallel nodes, checkpointing, interrupts. Stage 2 has none of those — a
   framework would wrap your three functions in nodes and edges, and the one
   interesting decision ("who's next?") would disappear into library
   machinery precisely where you're trying to see it. Having now built
   turn-taking, state persistence, and "the transcript is the state" by hand,
   you'll be able to look at any orchestration framework and know exactly
   which parts are essential and which are ceremony.
2. **The state design decision was the lesson.** This implementation derives
   position from the `turns` subcollection itself rather than storing a
   `currentStep` cursor on the session doc. That's a real distributed-systems
   choice (no second copy of state to drift; a retry after a crashed request
   self-heals because the transcript says what actually happened), and you
   make it consciously when hand-rolling.

Where the answer flips: parallel agents (both interviewers drafting
simultaneously), dynamic plans ("ask follow-ups until satisfied"), streaming
node outputs, human-in-the-loop interrupts, resumable long-running graphs.
That's the point at which hand-rolled if/else grows into a bad private
framework, and adopting a maintained one becomes the engineering-sound call.

---

## 6. What promptVersion tagging is for

Every turn written by `panel_agents.py` carries `promptVersion: "panel-v1"`
(the module-level `PROMPT_VERSION` constant — one place to bump). Prompts
*will* change: you'll sharpen the technical persona, reweight the synthesis,
rephrase retrieval queries (§2 already changed them once, pre-release). When
that happens, old stored turns were produced by old prompts. Without the tag,
"average technical-question quality last month" silently mixes prompt
versions and any comparison is meaningless.

With the tag, Stage 4's evals can slice by version: score panel-v1 turns vs.
panel-v2 turns on the same rubric and know whether the prompt change
*actually* improved questions — an A/B test over your own production data.
This is the cheapest observability you'll ever add: one string per document,
impossible to reconstruct after the fact.

(Production systems extend this: the session doc also records
`promptVersion` at start, and mature stacks store a hash of the *rendered*
prompt plus model name and sampling params per call. Same idea, more
resolution.)

---

## 7. What's simplified here vs. production

- **Agents can't see each other mid-interview.** The Hiring Manager doesn't
  know what the Technical Interviewer asked; only the Panel Lead ever sees
  everything, at the very end. Visible in the real run: technical Q1 probed
  the FinEdge rebuild story, then hiring_manager Q1 probed... the same
  territory from the behavioral side. A production panel would let agents
  read the running transcript ("technical already covered the Kafka rebuild —
  ask about something else") — trivially possible here since the transcript
  is already in Firestore; it's one more prompt input. Deliberately deferred.
- **The evaluator only sees the question and the answer** — not the resume.
  It can't catch a candidate contradicting their own resume. A production
  evaluator might retrieve resume context for claim-checking (that's a
  Stage 4-adjacent design decision: it also makes scores noisier).
- **Fixed 4-question plan.** Real interviews adapt: follow-ups on weak
  answers, early exits on strong signal. Our plan is an array literal.
- **The threshold's precision is model-limited** (§3): it catches
  wrong-document, not subtly-irrelevant. Fix = better embedding model, and
  the `topSimilarity` we persist on every turn is the dataset you'd use to
  re-tune after swapping it.
- **No concurrency control.** Two simultaneous `/panel/next-turn` calls for
  one session could both generate "the next question" (read-then-write with
  no transaction; `turnIndex` is also read-then-write). Fine for one person
  clicking a dev page; production would wrap turn-writing in a Firestore
  transaction or a per-session lock.
- **No retry/timeout policy around Groq calls** beyond the existing
  30-second HTTP timeout; a failed synthesis just returns 500 and the client
  retries by clicking again (safe *because* the state machine re-derives
  position — see §5).
- **Canned candidate answers in the E2E test** were written before seeing
  the generated questions, so two deliberately mismatched — and the
  evaluators correctly dinged both ("did not directly address the question").
  Accidental but genuinely reassuring evidence the evaluation prompt
  discriminates.
- **Cost/latency ignored.** Each full session = 9 Groq calls, serially, each
  1-3s. Nothing is cached, batched, or streamed (streaming is Stage 3).

---

## 8. What's NOT built yet

- **Streaming (Stage 3).** Questions/evaluations arrive as one blob after the
  full Groq round-trip; nothing token-streams to the browser yet.
- **Evals (Stage 4).** We now *persist* everything evals need — promptVersion,
  usedFallback, topSimilarity, scores, full transcript — but nothing measures
  question quality, evaluation consistency, or fallback rates yet.
- **No real UI.** `/dev/panel-test` is a functional dev surface (start, click
  through turns, answer, see the report + retrieval evidence), not a product
  page.
- **`--memory=512Mi` in `backend/deploy.sh` is still not raised** — Stage 1
  measured 619 MB RSS for the embedding model alone. Blocking pre-deploy
  step, unchanged in this branch because deploys are run by hand.
