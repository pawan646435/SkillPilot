# Stage 3: Streaming responses, explained

Like the Stage 1 and 2 docs, this is written for you specifically, using the
code now in `backend/app/services/groq_client.py`,
`backend/app/routers/panel.py`, and
`frontend/src/services/panelService.js`, and the actual output of real runs
on 2026-07-11 against a local Firestore emulator with **real Groq calls**
(streamed sessions `jj16WdXyuHZot1fTpPnk` and `Yqo2wltHa15JD0C8kUR4`,
buffered-comparison session `mTWSzYAiAAJbnTr7lg6Y`, interruption-test session
`l7rAKXxjhWEKDyExEEyw`). Every timing number, SSE frame, and Firestore field
below is copied from those runs, not invented.

Stage 3 converts `/panel/next-turn`'s question generation from "wait for the
full response" to token-by-token streaming, via a new
`POST /panel/next-turn/stream` endpoint. The buffered endpoint is untouched
and still works (§8 explains why both exist).

---

## 1. What streaming actually changes (and what it doesn't)

The model generates token by token *either way*. A buffered API call means
the server holds the tokens back and ships one JSON blob at the end; a
streaming call means it ships each token the moment it exists. Streaming
does not make generation faster — it changes **when you're allowed to see
partial progress**.

Real measurement from the Task 1 probe (direct Groq call, same prompt both
ways):

```
Buffered:  user stares at nothing for 0.69s, then sees everything
Streamed:  first text visible after 0.340s, completes at 0.50s
```

Groq's own `usage` block on the buffered call showed
`completion_time: 0.196s` — the model only *generated* for ~0.2s; the rest
of the 0.69s was queue + network + waiting for full assembly. The metric
that matters for UX shifts from *total latency* to **time-to-first-token**,
which stays flat no matter how long the answer gets. That's the property
you're buying: a 40-token question barely shows it, the Panel Lead's
multi-hundred-token synthesis would show it dramatically.

## 2. What Groq sends when you pass `stream=True`

Same URL, same payload, one extra field — and the response changes species.
Instead of one JSON body, you get `content-type: text/event-stream` and a
sequence of **Server-Sent Events (SSE)**: plain-text lines starting with
`data: `. The first four real frames from the Task 1 run:

```
RAW CHUNK 1 (+0.340s): data: {"id":"chatcmpl-e1ee2100...","object":"chat.completion.chunk",
                              ...,"choices":[{"delta":{"role":"assistant","content":""},...}]}
RAW CHUNK 2 (+0.340s): data: {...,"choices":[{"delta":{"content":"How"},...}]}
RAW CHUNK 3 (+0.341s): data: {...,"choices":[{"delta":{"content":" would"},...}]}
RAW CHUNK 4 (+0.349s): data: {...,"choices":[{"delta":{"content":" you"},...}]}
...
final line:            data: [DONE]
```

Side-by-side with the buffered shape:

```
buffered:  choices[0].message.content = "How would you ... ?"   (everything, once)
streamed:  choices[0].delta.content   = "How", " would", " you" (pieces, in order)
```

The key rename is `message` → `delta`: a delta is *just the new piece*, and
assembling them is the client's job. `object` flips from `"chat.completion"`
to `"chat.completion.chunk"`, and the literal sentinel `data: [DONE]` ends
the stream. `stream_groq_content()` in `groq_client.py` is exactly this
loop: read lines, skip non-`data:` lines, stop at `[DONE]`, yield each
non-empty `delta.content`.

## 3. Why FastAPI on Cloud Run made this easy (the Firebase comparison)

On the old Firebase Functions backend this feature would have forced a
second, parallel auth world. `onCall` functions — what `fetchGroqChat` was —
have a contract of "return one value, once"; there is no API for writing a
piece of the response now and more later. Streaming meant dropping to raw
`onRequest`, and with it hand-rolling everything `onCall` did for you:

```js
// What Firebase would have required: auth + CORS by hand, per endpoint
exports.streamTurn = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "https://yourapp.web.app");   // manual CORS
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const idToken = (req.headers.authorization || "").replace("Bearer ", "");
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(idToken); }          // manual auth
  catch { res.status(401).send("unauthenticated"); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream" });          // only NOW stream
});
```

Versus what Stage 3 actually shipped — the streaming route's signature is
identical to every buffered route in this codebase:

```python
@router.post("/next-turn/stream")
async def next_turn_stream(body: NextTurnRequest, user: DecodedUser = Depends(require_auth)):
    ...
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

Why does `require_auth` just work? Because **auth is a request-time concern
and streaming is a response-time concern**. FastAPI dependencies run when
the request arrives — headers fully available — before your function is
called; how the response later goes out (one blob or a trickle) is
invisible to them. Firebase's pain existed because `onCall` bundled auth
and response format into one abstraction, so opting out of one meant losing
the other. Verified live in the Task 5 run: the streaming endpoint returned
`{"detail":"You must be logged in."}` (401) without a token and streamed
normally with one — the exact same `require_auth` behavior as `/panel/start`.

## 4. The endpoint's SSE protocol

Groq streams SSE to us; we stream SSE onward to the browser. The backend is
a relay that taxes each chunk on the way through (accumulating the full text
for the eventual Firestore write). Each frame is one JSON object:

```
{"type": "meta", ...}             first — agent, retrieval detail (who's about to speak)
{"type": "delta", "text": "..."}  repeatedly — append to the display
{"type": "done", ...}             last — turn_id, full question
{"type": "action", ...}           single event for awaiting_answer/synthesis/complete
{"type": "error", "detail": ...}  mid-stream failure
```

Why does `error` exist as an *event* instead of an HTTP status? Because
**once the first byte streams out, the 200 status has already been sent and
cannot be unsent**. Pre-stream failures (bad token → 401, foreign session →
404) still use normal statuses — they happen before `StreamingResponse` is
constructed. Anything after that point must ride inside the stream. This is
the one genuinely new error-handling rule streaming introduces.

The real captured frames from session `Yqo2wltHa15JD0C8kUR4` (first request
after server boot):

```
+0.034s  data: {"type": "meta", "action": "question", "agent": "technical",
                "used_fallback": false, "retrieval_query": "What distributed systems, ..."}
+1.438s  data: {"type": "delta", "text": "Can"}
+1.438s  data: {"type": "delta", "text": " you"}
+1.438s  data: {"type": "delta", "text": " walk"}
...
+1.675s  data: {"type": "done", "action": "question", "turn_id": "Aq8GG4qFlMueoIxZem1d", ...}
```

51 frames total. Note the deltas arrive in bursts — Groq's inference is fast
enough that several tokens often land in one network read.

## 5. The real timing numbers — and a cold-start lesson we didn't plan to learn

The honest comparison (same resume, same technical-Q1 turn, warm server):

| | first visible text | complete |
|---|---|---|
| buffered `/panel/next-turn` | **0.750s** (= total wait) | 0.750s |
| streamed `/panel/next-turn/stream` | **0.324s** | 0.523s |

First text in less than half the time — and remember from §1 that this gap
*grows* with answer length while the streamed number stays flat.

But the first streamed run (the +1.438s trace in §4) was *slower* to first
text than the buffered call. That looked wrong, so we chased it: that run
was the first request after server start, and the retrieval step inside
`prepare_question_turn` paid the embedding model's lazy-load. The re-run on
a warm server dropped first-delta from 1.438s to 0.324s. Two lessons: (a)
time-to-first-token includes *everything before the LLM too* — retrieval,
embedding, Firestore reads — not just Groq; (b) this is the same
cold-start behavior that motivated the 1Gi memory bump on Cloud Run.

## 6. Why Firestore is written once, after the stream — with the interruption test as proof

Two reasons, one boring and one structural:

- **Cost/latency:** Firestore bills per write; 51 frames written per-delta
  would be ~50 writes at tens of ms each — throttling the very stream
  they're recording — versus exactly 1.
- **Integrity:** in this design *the transcript IS the state machine's
  memory* (Stage 2 doc §5). `_derive_position` counts question turns to
  decide who speaks next. A half-written question doc would be
  indistinguishable from a real one — the interview would advance past a
  question the candidate never fully saw.

The implementation gets atomicity almost for free: the
`persist_question_turn` call sits *after* the `async for` loop in the
generator. If the client disconnects, the generator is cancelled at a
`yield` and the write is simply never reached.

Tested for real (session `l7rAKXxjhWEKDyExEEyw`): killed the client the
instant the first delta arrived, then inspected Firestore:

```
got first delta 'Can' — KILLING CLIENT NOW
turns in interrupted session D: 0
session status: PANEL_ACTIVE
re-request → action: question (regenerated cleanly)
```

Zero partial documents, session healthy, next call regenerates. The
trade-off is honest: the interrupted generation's Groq tokens are paid for
and discarded. At this scale that's the right trade; §9 covers what a
production system might do instead.

## 7. Frontend: why `fetch()` + ReadableStream, not `EventSource`

The browser has a built-in SSE client, `EventSource` — and it's disqualified
here by one line of its spec: **its constructor takes a URL and nothing
else**. No custom headers, GET only. Now recall how every service file in
this app authenticates (`ragService.js`, `groqService.js`,
`clashService.js`, `assessmentService.js`, `jobsService.js` — all the same
pattern):

```js
const idToken = await auth.currentUser?.getIdToken();
headers: { Authorization: `Bearer ${idToken}` }
```

`require_auth` reads exactly that header. `EventSource` physically cannot
send it. (Workarounds — token in the query string, which leaks into server
logs, or cookie auth, which this app doesn't use — are both worse.)

`fetch()` sends any header and any method, and `response.body` is a
**ReadableStream**: the bytes as they arrive rather than after they've all
arrived. `nextTurnStream()` in `panelService.js` reads it with
`getReader()`, and handles the one real subtlety — **TCP reads don't respect
frame boundaries**. A network read can end mid-frame, so the code keeps a
string buffer, splits on the `\n\n` frame delimiter, parses only provably
complete frames, and leaves the unterminated tail in the buffer:

```js
buffer += decoder.decode(value, { stream: true });
const frames = buffer.split("\n\n");
buffer = frames.pop(); // last piece may be incomplete — keep it
```

And the Task 4 answer: **the Firebase ID token needed zero special handling
for streaming.** Compare `nextTurnStream` with `ragService.postJson` — the
token acquisition and header are line-for-line the same pattern; the only
difference is reading `response.body` incrementally instead of awaiting
`response.json()`. The request side is completely ordinary; only response
consumption changed.

## 8. Why SSE and not WebSockets — and why both endpoints exist

**SSE vs WebSockets:** WebSockets give you a bidirectional socket — either
side can send at any time — which is what you'd want for, say, live
collaborative editing. But this flow is strictly *request → response that
happens to arrive in pieces*: the client asks for the next turn, the server
talks, done. SSE is exactly that shape, rides on plain HTTP (same auth
header, same CORS, same Cloud Run request lifecycle, no protocol upgrade),
and costs a fraction of the implementation complexity. Choosing WebSockets
here would buy a channel direction nothing uses.

**Why keep the buffered endpoint:** three real reasons. (1) Different
consumers want different contracts — Stage 4's eval harness will prefer
"call, get JSON, assert" over parsing SSE frames. (2) The streaming path
gave up JSON mode and with it the `topic` label (§9), so the buffered
endpoint remains the full-fidelity version. (3) Operational insurance: if a
proxy or browser quirk ever breaks streaming, the feature degrades to
"slower but works" with a one-function fallback, not "broken".

## 9. What's simplified here vs. production-grade — the honest list

Verified identical between the two paths (real doc diff from the Task 5
run, buffered turn `IQmq3GkMgNddXTG4PQZw` vs streamed turn
`qbPBIOcYA4cFxhRmYd60`): same 11 fields, same `promptVersion: panel-v1`,
same `retrievalQuery`, `topSimilarity` byte-identical at
`0.2998766371583506` — proof the identical retrieval/threshold code ran.

The declared divergences and simplifications:

1. **Streamed turns store `topic: ""`.** The buffered path uses JSON mode
   (`{"question", "topic"}`); you can't stream JSON syntax readably at a
   user, so the streaming prompt asks for plain question text and the topic
   label is lost. Production fix: a cheap second pass to extract the topic,
   or stream structured deltas.
2. **Both paths tag `promptVersion: panel-v1` despite differing
   response-format instructions.** The persona/context/history prefix is
   byte-identical (verified in Task 2); only the format contract differs. A
   production system would version the variant (e.g. `panel-v1-stream`) so
   Stage 4's evals can separate them.
3. **Interrupted streams discard paid tokens.** No resumability: if the tab
   closes mid-stream, the next request regenerates from scratch. Production
   systems store partial generations server-side keyed by an idempotency
   token and let clients resume (the `Last-Event-ID` mechanism SSE was
   designed with — unused here).
4. **No reconnection logic in the client.** `nextTurnStream` throws if the
   stream dies; the UI shows the error and lets you click again. Fine for a
   dev surface, not for flaky mobile networks.
5. **Only question generation streams.** Answer evaluation and the Panel
   Lead's synthesis still use JSON mode — their outputs are structured
   (scores, arrays, a report object), and the structure matters more than
   perceived latency there. Ironically synthesis, as the longest
   generation, would *benefit* most from streaming — it would need the
   structured-streaming approach from (1).
6. **`X-Accel-Buffering: no` is defensive.** Cloud Run passes chunked
   responses through unbuffered; the header guards against future proxies.

## 10. What's NOT built yet

Stage 4: the eval harness. Every turn since Stage 2 has carried
`promptVersion` precisely so that stored transcripts can be scored and
compared across prompt changes — nothing reads that field yet. Stage 4
closes the loop: automated grading of question quality (groundedness in
retrieved chunks, non-repetition, difficulty calibration) so prompt changes
become measurable instead of vibes-based. The buffered endpoints kept alive
in §8 are what that harness will call.
