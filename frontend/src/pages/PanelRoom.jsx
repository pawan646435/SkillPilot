// src/pages/PanelRoom.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, BrainCircuit, Users, CheckCircle2, TriangleAlert, GraduationCap, Briefcase } from "lucide-react";
import { nextTurnStream, startPanel, submitAnswer } from "../services/panelService";
import { useAuth } from "../context/authContextStore";
import Noise from "../components/Noise";

// Matches panel.py's fixed _QUESTION_PLAN (technical -> hiring_manager ->
// technical -> hiring_manager -> synthesis). Not fetched from the backend --
// there's no endpoint that reports plan length, and it's a stable constant.
const TOTAL_QUESTIONS = 4;

const AGENT_META = {
  technical: { label: "Technical Interviewer", color: "text-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/20", Icon: BrainCircuit },
  hiring_manager: { label: "Hiring Manager", color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20", Icon: Users },
};

const EXPERIENCE_LEVEL_META = {
  fresher: { label: "Fresher", Icon: GraduationCap },
  experienced: { label: "Experienced", Icon: Briefcase },
};

const PHASE = {
  WAITING: "waiting", // between turns: no meta/delta received yet for the next step
  STREAMING: "streaming", // meta received, deltas growing the question text
  ANSWERING: "answering", // question fully shown, waiting on the candidate's answer
  SUBMITTING: "submitting", // answer posted, awaiting the persona's evaluation
  ADVANCING: "advancing", // brief confirmation before auto-loading the next turn
  ERROR: "error",
};

export default function PanelRoom() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user, authReady } = useAuth();
  const sessionId = state?.sessionId;
  const experienceLevel = state?.experienceLevel || "experienced";

  const [phase, setPhase] = useState(PHASE.WAITING);
  const [pendingTurn, setPendingTurn] = useState(null); // {turn_id, agent, question}
  const [streamAgent, setStreamAgent] = useState(null);
  const [streamText, setStreamText] = useState("");
  const [answer, setAnswer] = useState("");
  const [questionNumber, setQuestionNumber] = useState(0);
  const [error, setError] = useState(null);
  const initializedRef = useRef(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (authReady && !user) {
      navigate("/login?redirect=%2Finterview%2Fselect");
    }
  }, [authReady, user, navigate]);

  useEffect(() => {
    if (!sessionId) {
      navigate("/interview/panel", { replace: true });
    }
  }, [sessionId, navigate]);

  const loadNextTurn = useCallback(async () => {
    setPhase(PHASE.WAITING);
    setError(null);
    setStreamAgent(null);
    setStreamText("");
    try {
      const result = await nextTurnStream(sessionId, (event) => {
        if (event.type === "meta") {
          setStreamAgent(event.agent);
          setPhase(PHASE.STREAMING);
          setQuestionNumber((n) => n + 1);
        } else if (event.type === "delta") {
          setStreamText((prev) => prev + event.text);
        }
      });

      if (result.type === "done") {
        setPendingTurn({ turn_id: result.turn_id, agent: result.agent, question: result.question });
        setPhase(PHASE.ANSWERING);
        return;
      }

      // Non-streamed single-event actions.
      if (result.action === "awaiting_answer") {
        // A session resumed mid-flow already has this question persisted --
        // render it the same as a freshly streamed one, no animation needed.
        setQuestionNumber((n) => Math.max(n, 1));
        setPendingTurn({ turn_id: result.turn_id, agent: result.agent, question: result.question });
        setPhase(PHASE.ANSWERING);
      } else if (result.action === "synthesis") {
        navigate("/interview/panel/report", { state: { report: result.report }, replace: true });
      } else if (result.action === "complete") {
        navigate("/interview/panel/report", { state: { report: result.final_report }, replace: true });
      }
    } catch (err) {
      setError(err.message || "Something went wrong generating the next question.");
      setPhase(PHASE.ERROR);
    }
  }, [sessionId, navigate]);

  const initPanel = useCallback(async () => {
    setPhase(PHASE.WAITING);
    setError(null);
    try {
      await startPanel(sessionId, experienceLevel);
      await loadNextTurn();
    } catch (err) {
      setError(err.message || "Could not start the panel interview.");
      setPhase(PHASE.ERROR);
    }
  }, [sessionId, experienceLevel, loadNextTurn]);

  useEffect(() => {
    if (!sessionId || !authReady || !user || initializedRef.current) return;
    initializedRef.current = true;
    async function init() {
      await initPanel();
    }
    init();
  }, [sessionId, authReady, user, initPanel]);

  useEffect(() => {
    if (phase === PHASE.ANSWERING && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [phase]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!answer.trim() || !pendingTurn) return;
    setPhase(PHASE.SUBMITTING);
    setError(null);
    try {
      await submitAnswer(sessionId, pendingTurn.turn_id, answer);
      setAnswer("");
      setPendingTurn(null);
      setPhase(PHASE.ADVANCING);
      // Brief, tasteful confirmation before moving on -- deliberately not
      // showing the per-question score/feedback here: for a panel, the
      // user-facing payoff is the synthesized final report, not a running
      // per-question scoreboard (unlike the Classic flow, which does show
      // per-question scores -- a deliberate difference, not an oversight).
      window.setTimeout(loadNextTurn, 900);
    } catch (err) {
      setError(err.message || "Could not submit your answer. Please try again.");
      setPhase(PHASE.ANSWERING);
    }
  }, [answer, pendingTurn, sessionId, loadNextTurn]);

  const handleRetry = () => {
    if (questionNumber === 0) {
      initPanel();
    } else {
      loadNextTurn();
    }
  };

  if (!authReady || !user || !sessionId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-neutral-400 font-mono text-sm">
        Loading...
      </div>
    );
  }

  const activeAgent = streamAgent || pendingTurn?.agent;
  const meta = activeAgent ? AGENT_META[activeAgent] : null;
  const levelMeta = EXPERIENCE_LEVEL_META[experienceLevel];
  const progressLabel = questionNumber > 0 ? `Question ${Math.min(questionNumber, TOTAL_QUESTIONS)} of ${TOTAL_QUESTIONS}` : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] relative flex flex-col">
      <Noise />

      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-white/5">
        <Motion.div
          className="h-full bg-sky-400"
          initial={{ width: 0 }}
          animate={{ width: `${(Math.min(questionNumber, TOTAL_QUESTIONS) / TOTAL_QUESTIONS) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 h-14 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-sky-400" />
          <span className="text-sm font-semibold text-white font-display">AI Panel Interview</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-neutral-400">
            <levelMeta.Icon className="w-3 h-3" />
            {levelMeta.label}
          </span>
        </div>
        {progressLabel && (
          <span className="font-mono text-xs text-neutral-600">{progressLabel}</span>
        )}
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 pt-20 pb-10">
        <div className="w-full max-w-2xl space-y-6">

          {/* Error Banner */}
          <AnimatePresence>
            {error && (
              <Motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-start justify-between gap-4 p-4 text-sm border rounded-xl bg-rose-400/10 border-rose-400/20 text-rose-300"
              >
                <div className="flex items-start gap-3">
                  <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
                {phase === PHASE.ERROR && (
                  <button
                    onClick={handleRetry}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-400/15 hover:bg-rose-400/25 text-rose-200 text-xs font-semibold transition-colors"
                  >
                    Retry
                  </button>
                )}
              </Motion.div>
            )}
          </AnimatePresence>

          {/* Waiting state (before we know which persona / before any text) */}
          <AnimatePresence mode="wait">
            {phase === PHASE.WAITING && (
              <Motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-4"
              >
                <Loader2 className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-neutral-400">
                    {questionNumber >= TOTAL_QUESTIONS
                      ? "Synthesizing your final report..."
                      : "Bringing in the next interviewer..."}
                  </p>
                  <div className="w-3/4 h-4 rounded-lg bg-white/5 animate-pulse" />
                </div>
              </Motion.div>
            )}

            {phase === PHASE.ADVANCING && (
              <Motion.div
                key="advancing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 rounded-2xl bg-emerald-400/[0.04] border border-emerald-400/15 flex items-center gap-4"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-300">Answer recorded — bringing in the next question...</p>
              </Motion.div>
            )}

            {/* Streaming / Answering / Submitting: the question card */}
            {(phase === PHASE.STREAMING || phase === PHASE.ANSWERING || phase === PHASE.SUBMITTING) && meta && (
              <Motion.div
                key={`q-${questionNumber}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
                className="p-8 rounded-2xl bg-white/[0.03] border border-white/10"
              >
                <div className="flex items-center gap-2 mb-5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${meta.bg} ${meta.border} ${meta.color}`}>
                    <meta.Icon className="w-3.5 h-3.5" />
                    {meta.label}
                  </span>
                </div>
                <p className="text-lg leading-relaxed text-white font-display">
                  {phase === PHASE.STREAMING ? streamText : pendingTurn?.question}
                  {phase === PHASE.STREAMING && (
                    <span className="inline-block w-2 h-5 ml-0.5 -mb-1 bg-sky-400 animate-pulse" />
                  )}
                </p>
              </Motion.div>
            )}
          </AnimatePresence>

          {/* Answer Area */}
          <AnimatePresence mode="wait">
            {(phase === PHASE.ANSWERING || phase === PHASE.SUBMITTING) && (
              <Motion.div
                key="answer-area"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-3"
              >
                <textarea
                  ref={textareaRef}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={phase === PHASE.SUBMITTING}
                  placeholder="Type your answer here..."
                  rows={6}
                  className="w-full p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-[#ededed] placeholder-neutral-700 text-sm leading-relaxed resize-none focus:outline-none focus:border-white/20 transition-colors font-mono disabled:opacity-50"
                />
                <button
                  onClick={handleSubmitAnswer}
                  disabled={phase === PHASE.SUBMITTING || !answer.trim()}
                  className="flex items-center gap-2 w-full justify-center px-6 py-2.5 bg-white text-black font-semibold rounded-xl text-sm hover:bg-neutral-100 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                >
                  {phase === PHASE.SUBMITTING ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Answer
                    </>
                  )}
                </button>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
