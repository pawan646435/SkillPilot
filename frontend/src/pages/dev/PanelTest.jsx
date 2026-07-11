// src/pages/dev/PanelTest.jsx
//
// Dev-only test surface for Stage 2 of the AI Interview Panel (multi-agent
// orchestration). Not linked from any nav — reachable at /dev/panel-test.
// Flow: ingest a resume on /dev/rag-ingest-test first (Stage 1), paste the
// session_id here, start the panel, then click through turns: each "Next
// turn" call shows which agent spoke, the retrieval query + real similarity
// scores behind its question (or the usedFallback flag), answers get scored
// by the same persona, and the run ends with the Panel Lead's report.
import { useState } from "react";
import { useAuth } from "../../context/authContextStore";
import { nextTurn, nextTurnStream, startPanel, submitAnswer } from "../../services/panelService";

const AGENT_LABELS = {
  technical: "Technical Interviewer",
  hiring_manager: "Hiring Manager",
  panel_lead: "Panel Lead",
};

export default function PanelTest() {
  const { user, authReady } = useAuth();
  const [sessionId, setSessionId] = useState("");
  const [started, setStarted] = useState(false);
  const [events, setEvents] = useState([]); // everything returned, in order
  const [pendingTurn, setPendingTurn] = useState(null); // question awaiting an answer
  const [answer, setAnswer] = useState("");
  const [finalReport, setFinalReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Stage 3: live streaming state. streaming is null when idle; while a
  // stream is active it holds {agent, text} and `text` grows delta by
  // delta — that growth IS the visible proof the tokens arrive one at a
  // time rather than all at once.
  const [streaming, setStreaming] = useState(null);

  function pushEvent(event) {
    setEvents((prev) => [...prev, event]);
  }

  async function run(fn) {
    setLoading(true);
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err.message || "Request failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    const data = await run(() => startPanel(sessionId || undefined));
    if (!data) return;
    setSessionId(data.session_id);
    setStarted(true);
    pushEvent({ kind: "start", ...data });
  }

  async function handleNextTurn() {
    const data = await run(() => nextTurn(sessionId));
    if (!data) return;
    pushEvent({ kind: data.action, ...data });
    if (data.action === "question" || data.action === "awaiting_answer") {
      setPendingTurn({ turn_id: data.turn_id, agent: data.agent, question: data.question });
    }
    if (data.action === "synthesis") setFinalReport(data.report);
    if (data.action === "complete") setFinalReport(data.final_report);
  }

  async function handleNextTurnStream() {
    let meta = null;
    const data = await run(() =>
      nextTurnStream(sessionId, (event) => {
        if (event.type === "meta") {
          meta = event;
          setStreaming({ agent: event.agent, text: "" });
        } else if (event.type === "delta") {
          // Functional update: each delta appends to whatever has already
          // rendered, so the question grows on screen token by token.
          setStreaming((prev) => (prev ? { ...prev, text: prev.text + event.text } : prev));
        }
      })
    );
    setStreaming(null);
    if (!data) return;

    if (data.type === "done") {
      // Reuse the existing question-card rendering, including the
      // retrieval detail captured from the meta event.
      pushEvent({
        kind: "question",
        streamed: true,
        turn_id: data.turn_id,
        agent: data.agent,
        question: data.question,
        used_fallback: data.used_fallback,
        retrieval_query: meta?.retrieval_query,
        retrieved_chunks: meta?.retrieved_chunks,
      });
      setPendingTurn({ turn_id: data.turn_id, agent: data.agent, question: data.question });
      return;
    }

    // Single-event actions (awaiting_answer / synthesis / complete) come
    // through with type "action" — same handling as the buffered endpoint.
    pushEvent({ kind: data.action, ...data });
    if (data.action === "awaiting_answer") {
      setPendingTurn({ turn_id: data.turn_id, agent: data.agent, question: data.question });
    }
    if (data.action === "synthesis") setFinalReport(data.report);
    if (data.action === "complete") setFinalReport(data.final_report);
  }

  async function handleSubmitAnswer() {
    const data = await run(() => submitAnswer(sessionId, pendingTurn.turn_id, answer));
    if (!data) return;
    pushEvent({ kind: "evaluation", ...data });
    setPendingTurn(null);
    setAnswer("");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-mono p-8 max-w-3xl mx-auto">
      <h1 className="text-xl mb-1">Interview Panel Test (Stage 2, dev only)</h1>
      <p className="text-neutral-500 text-sm mb-6">
        /panel/start → /panel/next-turn → /panel/submit-answer. Ingest a resume on
        /dev/rag-ingest-test first and paste its session_id below.
      </p>

      {!authReady ? (
        <p className="text-neutral-500">Checking auth...</p>
      ) : !user ? (
        <p className="text-amber-400">You must be logged in (all /panel/* routes are behind require_auth).</p>
      ) : (
        <>
          <div className="mb-4 flex gap-3 items-end text-sm">
            <label className="flex-1">
              session_id (from Stage 1 ingest; blank = new context-less session):{" "}
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                disabled={started}
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full disabled:text-neutral-500"
              />
            </label>
            {!started ? (
              <button
                onClick={handleStart}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-semibold px-4 py-2 rounded"
              >
                {loading ? "Starting..." : "Start panel"}
              </button>
            ) : (
              <>
                <button
                  onClick={handleNextTurn}
                  disabled={loading || !!pendingTurn || !!finalReport}
                  className="bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-semibold px-4 py-2 rounded"
                >
                  {loading ? "Working..." : "Next turn"}
                </button>
                <button
                  onClick={handleNextTurnStream}
                  disabled={loading || !!pendingTurn || !!finalReport}
                  className="bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-semibold px-4 py-2 rounded whitespace-nowrap"
                >
                  {loading ? "Working..." : "Next turn (stream)"}
                </button>
              </>
            )}
          </div>

          {error && <p className="text-rose-400 mb-4 text-sm">{error}</p>}

          {streaming && (
            <div className="border border-fuchsia-800 rounded p-3 mb-4 text-sm">
              <p className="text-fuchsia-400 mb-1">
                {AGENT_LABELS[streaming.agent] || streaming.agent} is typing (streaming live)…
              </p>
              <p className="whitespace-pre-wrap">
                {streaming.text}
                <span className="animate-pulse text-fuchsia-400">▌</span>
              </p>
            </div>
          )}

          <div className="space-y-4 text-sm">
            {events.map((event, i) => (
              <div key={i} className="border border-neutral-800 rounded p-3">
                {event.kind === "start" && (
                  <p className="text-emerald-400">
                    Panel started — session_id: {event.session_id}
                    {event.resumed ? " (resumed)" : ""}
                  </p>
                )}

                {(event.kind === "question" || event.kind === "awaiting_answer") && (
                  <>
                    <p className="text-sky-400 mb-1">
                      {AGENT_LABELS[event.agent]} asks{event.kind === "awaiting_answer" ? " (pending)" : ""}
                      {event.streamed ? <span className="text-fuchsia-400"> [streamed]</span> : ""}:
                    </p>
                    <p className="mb-2 whitespace-pre-wrap">{event.question}</p>
                    {event.retrieval_query && (
                      <div className="text-neutral-500 text-xs space-y-1">
                        <p>
                          retrieval query: “{event.retrieval_query}” —{" "}
                          {event.used_fallback ? (
                            <span className="text-amber-400">usedFallback: true (no chunk cleared the threshold)</span>
                          ) : (
                            "grounded in resume chunks"
                          )}
                        </p>
                        {(event.retrieved_chunks || []).map((chunk) => (
                          <p key={chunk.id}>
                            chunk {chunk.id.slice(0, 6)}… sim {chunk.similarity.toFixed(4)}{" "}
                            {chunk.injected ? "(injected)" : "(below threshold, dropped)"}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {event.kind === "evaluation" && (
                  <>
                    <p className="text-violet-400 mb-1">
                      {AGENT_LABELS[event.agent]} evaluates: {event.score}/10
                    </p>
                    <p className="text-neutral-300 whitespace-pre-wrap">{event.feedback}</p>
                  </>
                )}

                {(event.kind === "synthesis" || event.kind === "complete") && null}
              </div>
            ))}
          </div>

          {pendingTurn && !finalReport && (
            <div className="mt-4">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={5}
                placeholder={`Answer ${AGENT_LABELS[pendingTurn.agent]}...`}
                className="w-full bg-neutral-900 border border-neutral-700 rounded p-3 text-sm mb-2"
              />
              <button
                onClick={handleSubmitAnswer}
                disabled={loading || !answer.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-semibold px-4 py-2 rounded text-sm"
              >
                {loading ? "Scoring..." : "Submit answer"}
              </button>
            </div>
          )}

          {finalReport && (
            <div className="mt-6 border border-emerald-800 rounded p-4 text-sm">
              <p className="text-emerald-400 text-base mb-2">
                Panel Lead final report — {finalReport.hireRecommendation} ({finalReport.overallScore}/100)
              </p>
              <p className="text-neutral-400 mb-1">Technical:</p>
              <p className="mb-3 whitespace-pre-wrap">{finalReport.technicalSummary}</p>
              <p className="text-neutral-400 mb-1">Cultural fit:</p>
              <p className="whitespace-pre-wrap">{finalReport.culturalFitSummary}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
