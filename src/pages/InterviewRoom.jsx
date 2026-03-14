// src/pages/InterviewRoom.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Send, Loader2, ChevronRight,
  BrainCircuit, Lightbulb, X
} from "lucide-react";
import { generateInterviewQuestion, evaluateAnswer, generateFinalReport } from "../services/geminiService";import { auth, db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import Noise from "../components/Noise";

// --- Phase constants ---
const PHASE = {
  LOADING_QUESTION: "loading_question",
  ANSWERING: "answering",
  EVALUATING: "evaluating",
  SHOWING_RESULT: "showing_result",
  GENERATING_REPORT: "generating_report",
  DONE: "done",
};

export default function InterviewRoom() {
  const { state } = useLocation();
  const navigate = useNavigate();

  // Config from setup page
  const role = state?.role || "Frontend Engineer";
  const difficulty = state?.difficulty || "Medium";
  const questionCount = state?.questionCount || 5;

  const [phase, setPhase] = useState(PHASE.LOADING_QUESTION);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [allQA, setAllQA] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  const loadNextQuestion = async (previousQA) => {
    setPhase(PHASE.LOADING_QUESTION);
    setUserAnswer("");
    setEvaluation(null);
    setShowHint(false);
    setError(null);
    try {
      const q = await generateInterviewQuestion(role, difficulty, previousQA);
      setCurrentQuestion(q);
      setPhase(PHASE.ANSWERING);
    } catch (err) {
      console.error("Error loading question:", err);
      setError(`Failed to load question: ${err.message || "Please try again."}`);
      setPhase(PHASE.ANSWERING);
    }
  };

  // Load first question on mount
  useEffect(() => {
    loadNextQuestion([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus textarea when answering phase starts
  useEffect(() => {
    if (phase === PHASE.ANSWERING && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [phase]);

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() && phase !== PHASE.ANSWERING) return;
    stopListening();
    setPhase(PHASE.EVALUATING);
    setError(null);
    try {
      const result = await evaluateAnswer(
        currentQuestion.question,
        userAnswer,
        role,
        difficulty
      );
      setEvaluation(result);
      setPhase(PHASE.SHOWING_RESULT);
    } catch (err) {
      console.error("Error evaluating answer:", err);
      setError(`Failed to evaluate answer: ${err.message}`);
      setPhase(PHASE.SHOWING_RESULT);
    }
  };

  const handleNext = async () => {
    const newQA = [
      ...allQA,
      {
        question: currentQuestion.question,
        topic: currentQuestion.topic,
        answer: userAnswer,
        score: evaluation?.score ?? 0,
        feedback: evaluation?.feedback ?? "",
        strengths: evaluation?.strengths ?? [],
        improvements: evaluation?.improvements ?? [],
        modelAnswer: evaluation?.modelAnswer ?? "",
      },
    ];
    setAllQA(newQA);

    const nextIndex = questionIndex + 1;
    if (nextIndex >= questionCount) {
      // Interview complete — generate report
      setPhase(PHASE.GENERATING_REPORT);
      try {
        const report = await generateFinalReport(role, difficulty, newQA);
        // Save to Firestore
        const user = auth.currentUser;
        let docId = null;
        if (user) {
          const docRef = await addDoc(
            collection(db, "users", user.uid, "interviewReports"),
            {
              role,
              difficulty,
              questionCount,
              allQA: newQA,
              report,
              createdAt: serverTimestamp(),
            }
          );
          docId = docRef.id;
        }
        navigate("/interview/report", { state: { report, allQA: newQA, role, difficulty, docId } });
      } catch (err) {
        console.error("Error generating report:", err);
        setError(`Failed to generate report: ${err.message}`);
        setPhase(PHASE.SHOWING_RESULT);
      }
    } else {
      setQuestionIndex(nextIndex);
      loadNextQuestion(newQA);
    }
  };

  // --- Voice Input ---
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser. Use Chrome.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setUserAnswer(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const toggleVoice = () => {
    isListening ? stopListening() : startListening();
  };

  // Progress percentage
  const progress = ((questionIndex) / questionCount) * 100;

  const scoreColor = (score) => {
    if (score >= 8) return "text-emerald-400";
    if (score >= 5) return "text-amber-400";
    return "text-rose-400";
  };

  const scoreBg = (score) => {
    if (score >= 8) return "bg-emerald-400/10 border-emerald-400/20";
    if (score >= 5) return "bg-amber-400/10 border-amber-400/20";
    return "bg-rose-400/10 border-rose-400/20";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] relative flex flex-col">
      <Noise />

      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-white/5">
        <motion.div
          className="h-full bg-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 h-14 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <BrainCircuit className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-semibold text-white font-display">AI Interview</span>
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-neutral-500 font-mono">
            {role}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-neutral-600">
            {questionIndex + (phase === PHASE.LOADING_QUESTION ? 0 : 1)}/{questionCount}
          </span>
          <span className={`px-2 py-0.5 rounded-md text-xs font-mono border ${
            difficulty === "Easy" ? "text-emerald-400 bg-emerald-400/5 border-emerald-400/20" :
            difficulty === "Medium" ? "text-amber-400 bg-amber-400/5 border-amber-400/20" :
            "text-rose-400 bg-rose-400/5 border-rose-400/20"
          }`}>
            {difficulty}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 pt-20 pb-10">
        <div className="w-full max-w-2xl space-y-6">

          {/* Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-between p-4 text-sm border rounded-xl bg-rose-400/10 border-rose-400/20 text-rose-400"
              >
                <span>{error}</span>
                <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Question Card */}
          <AnimatePresence mode="wait">
            {phase === PHASE.LOADING_QUESTION ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-4"
              >
                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="w-3/4 h-4 rounded-lg bg-white/5 animate-pulse" />
                  <div className="w-1/2 h-4 rounded-lg bg-white/5 animate-pulse" />
                </div>
              </motion.div>
            ) : currentQuestion ? (
              <motion.div
                key={`q-${questionIndex}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
                className="p-8 rounded-2xl bg-white/[0.03] border border-white/10"
              >
                <div className="flex items-center gap-2 mb-5">
                  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-neutral-500 font-mono">
                    Q{questionIndex + 1}
                  </span>
                  {currentQuestion.topic && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-400/5 border border-emerald-400/15 text-xs text-emerald-400 font-mono">
                      {currentQuestion.topic}
                    </span>
                  )}
                </div>
                <p className="text-lg leading-relaxed text-white font-display">
                  {currentQuestion.question}
                </p>

                {/* Hint toggle */}
                {currentQuestion.hint && phase === PHASE.ANSWERING && (
                  <div className="mt-5">
                    <button
                      onClick={() => setShowHint(!showHint)}
                      className="flex items-center gap-2 text-xs transition-colors text-neutral-600 hover:text-amber-400"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      {showHint ? "Hide hint" : "Need a hint?"}
                    </button>
                    <AnimatePresence>
                      {showHint && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 text-xs italic text-amber-400/70"
                        >
                          💡 {currentQuestion.hint}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Answer Area */}
          <AnimatePresence mode="wait">
            {(phase === PHASE.ANSWERING || phase === PHASE.EVALUATING) && (
              <motion.div
                key="answer-area"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-3"
              >
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    disabled={phase === PHASE.EVALUATING}
                    placeholder="Type your answer here, or use the microphone to speak..."
                    rows={6}
                    className="w-full p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-[#ededed] placeholder-neutral-700 text-sm leading-relaxed resize-none focus:outline-none focus:border-white/20 transition-colors font-mono disabled:opacity-50"
                  />
                  {isListening && (
                    <div className="absolute flex items-center gap-2 top-4 right-4">
                      <motion.div
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-rose-400"
                      />
                      <span className="font-mono text-xs text-rose-400">REC</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleVoice}
                    disabled={phase === PHASE.EVALUATING}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 ${
                      isListening
                        ? "bg-rose-400/10 border-rose-400/30 text-rose-400 hover:bg-rose-400/20"
                        : "bg-white/[0.03] border-white/10 text-neutral-500 hover:text-white hover:border-white/20"
                    } disabled:opacity-40`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isListening ? "Stop" : "Voice"}
                  </button>

                  <button
                    onClick={handleSubmitAnswer}
                    disabled={phase === PHASE.EVALUATING || !userAnswer.trim()}
                    className="flex items-center gap-2 flex-1 justify-center px-6 py-2.5 bg-white text-black font-semibold rounded-xl text-sm hover:bg-neutral-100 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                  >
                    {phase === PHASE.EVALUATING ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Evaluating...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit Answer
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Evaluation Result */}
          <AnimatePresence>
            {phase === PHASE.SHOWING_RESULT && evaluation && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-4"
              >
                {/* Score */}
                <div className={`p-6 rounded-2xl border ${scoreBg(evaluation.score)}`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-neutral-400">Your Score</span>
                    <span className={`text-3xl font-bold font-mono ${scoreColor(evaluation.score)}`}>
                      {evaluation.score}<span className="text-lg text-neutral-600">/10</span>
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-neutral-300">{evaluation.feedback}</p>
                </div>

                {/* Strengths & Improvements */}
                <div className="grid grid-cols-2 gap-3">
                  {evaluation.strengths?.length > 0 && (
                    <div className="p-4 rounded-xl bg-emerald-400/[0.04] border border-emerald-400/10">
                      <p className="mb-2 text-xs font-semibold tracking-wider uppercase text-emerald-400">Strengths</p>
                      <ul className="space-y-1">
                        {evaluation.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-neutral-400 flex items-start gap-1.5">
                            <span className="text-emerald-400 mt-0.5 shrink-0">+</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {evaluation.improvements?.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-400/[0.04] border border-amber-400/10">
                      <p className="mb-2 text-xs font-semibold tracking-wider uppercase text-amber-400">Improve</p>
                      <ul className="space-y-1">
                        {evaluation.improvements.map((s, i) => (
                          <li key={i} className="text-xs text-neutral-400 flex items-start gap-1.5">
                            <span className="text-amber-400 mt-0.5 shrink-0">→</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Model Answer */}
                {evaluation.modelAnswer && (
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/8">
                    <p className="mb-2 text-xs font-semibold tracking-wider uppercase text-neutral-500">Model Answer</p>
                    <p className="text-xs leading-relaxed text-neutral-400">{evaluation.modelAnswer}</p>
                  </div>
                )}

                {/* Next Button */}
                <button
                  onClick={handleNext}
                  className="flex items-center justify-center w-full gap-2 px-6 py-3.5 bg-white text-black font-semibold rounded-xl text-sm hover:bg-neutral-100 transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.01]"
                >
                  {questionIndex + 1 >= questionCount ? "Finish & See Report" : "Next Question"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generating Report State */}
          {phase === PHASE.GENERATING_REPORT && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col items-center gap-4 text-center"
            >
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <div>
                <p className="font-semibold text-white font-display">Generating your report...</p>
                <p className="mt-1 text-sm text-neutral-500">Analysing all {questionCount} answers</p>
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}
