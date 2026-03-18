// src/pages/Clash.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Users, Copy, CheckCircle2, Code2, AlertTriangle, Loader2, FlaskConical, Send, Trophy, Clock, Eye } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp, collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { fetchClashQuestions, finalizeClashMatch, generateClashQuestions, joinClashRoom, runClashCode, submitClashAnswer } from "../services/clashService";

// ── Stacks and Timer Options ──
const STACK_OPTIONS = [
  { value: "DSA", label: "DSA" },
  { value: "FRONTEND", label: "Frontend" },
  { value: "BACKEND", label: "Backend" },
  { value: "SYSTEM_DESIGN", label: "System Design" },
  { value: "JAVASCRIPT", label: "JavaScript" },
  { value: "PYTHON", label: "Python" },
  { value: "DEVOPS", label: "DevOps" },
];

const TIMER_OPTIONS = [
  { value: 0, label: "No Timer" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
];

const DEFAULT_CODE_BY_LANGUAGE = {
  javascript: `function solution(...args) {\n  return null;\n}\n`,
  python: `def solution(*args):\n    return None\n`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nauto solution() {\n    return 0;\n}\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    return 0;\n}\n`,
  java: `import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        System.out.println(solution());\n    }\n    public static Object solution(Object... params) {\n        return null;\n    }\n}\n`,
};

function getStarterCode(question, language) {
  const starterCode = question?.starterCode;
  if (starterCode && typeof starterCode === "object" && typeof starterCode[language] === "string" && starterCode[language].trim()) {
    return starterCode[language];
  }
  return DEFAULT_CODE_BY_LANGUAGE[language] || DEFAULT_CODE_BY_LANGUAGE.javascript;
}

function mapRoomQuestion(question, fallbackDifficulty) {
  return {
    id: question.id,
    title: question.title || "Untitled",
    description: question.description || "",
    difficulty: question.difficulty || fallbackDifficulty,
    tags: question.tags || [],
    starterCode: question.starterCode || {},
  };
}

function formatTerminalValue(value) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function formatTime(totalSeconds) {
  if (totalSeconds <= 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Opponent Activity Component ──
const OpponentActivity = ({ opponentCode }) => {
  const lines = (opponentCode || "").split("\n");
  const [prevLength, setPrevLength] = useState(0);
  const isTyping = lines.length !== prevLength;

  useEffect(() => {
    const timer = setTimeout(() => setPrevLength(lines.length), 2000);
    return () => clearTimeout(timer);
  }, [lines.length]);

  return (
    <div className="h-full overflow-hidden p-4 bg-[#050505]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff41]/50">
          Opponent Activity
        </div>
        <div className="text-[10px] font-mono text-[#00ff41]/40">
          {lines.length} lines
        </div>
      </div>
      <div className="space-y-[5px] overflow-hidden max-h-full">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: `${Math.min(95, Math.max(8, line.length * 1.8))}%`, opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.02 }}
            className="h-[12px] rounded-sm bg-[#00ff41]/12"
          />
        ))}
        {isTyping && (
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="w-2 h-3.5 bg-[#00ff41] rounded-sm mt-1"
          />
        )}
      </div>
    </div>
  );
};

// ── Output Terminal ──
const OutputTerminal = ({ runState, finalizedResult }) => {
  const visibleCases = runState.output?.cases?.filter((item) => !item.hidden) || [];
  const hiddenCaseCount = runState.output?.cases?.filter((item) => item.hidden).length || 0;

  return (
    <div className="flex h-[220px] flex-col overflow-hidden rounded-xl border border-cyan-400/20 bg-[#020706] shadow-[0_0_20px_rgba(6,182,212,0.08)]">
      <div className="flex items-center justify-between border-b border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-cyan-300">
        <span className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
          Output Terminal
        </span>
        <span className="text-cyan-200/50">sandbox://stdout</span>
      </div>
      <div className="flex-1 space-y-2 overflow-auto px-4 py-3 text-[11px] leading-6 text-cyan-50/90">
        {runState.running && <p className="text-cyan-300">{">"} running local test harness...</p>}
        {runState.submitting && <p className="text-[#00ff41]">{">"} submitting solution to arena...</p>}
        {runState.error && <p className="text-rose-400">[error] {runState.error}</p>}
        {!runState.error && !runState.running && !runState.submitting && !runState.output && (
          <p className="text-cyan-100/35">{">"} run code or submit to inspect output...</p>
        )}
        {runState.output && (
          <>
            <p className="text-[#00ff41]">
              {">"} passed {runState.output.passed}/{runState.output.total} tests | elapsed {runState.output.elapsedMs} ms | points {runState.output.points}
            </p>
            {visibleCases.map((item) => (
              <div key={`case-${item.index}`} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <p className={item.passed ? "text-emerald-300" : "text-rose-300"}>
                  [{item.passed ? "PASS" : "FAIL"}] case {item.index + 1}
                </p>
                {"expected" in item && <p className="text-cyan-100/70">expected: {formatTerminalValue(item.expected)}</p>}
                {"output" in item && <p className="text-cyan-100/70">output: {formatTerminalValue(item.output)}</p>}
                {item.error && <p className="text-rose-300">error: {item.error}</p>}
              </div>
            ))}
            {hiddenCaseCount > 0 && (
              <p className="text-cyan-100/45">{">"} hidden test cases evaluated server-side: {hiddenCaseCount}</p>
            )}
          </>
        )}
        {finalizedResult && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-amber-200">
            <p>{">"} match finalized</p>
            <p>player 1: {finalizedResult.player1Score || 0}</p>
            <p>player 2: {finalizedResult.player2Score || 0}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const TerminalText = ({ text, delay = 0 }) => {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    let intervalId = null;
    const timeoutId = setTimeout(() => {
      intervalId = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length && intervalId) clearInterval(intervalId);
      }, 30);
    }, delay);
    return () => { clearTimeout(timeoutId); if (intervalId) clearInterval(intervalId); };
  }, [text, delay]);
  return <span>{displayed}</span>;
};

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
export default function Clash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomFromUrl = searchParams.get("room");
  const syncTimerRef = useRef(null);
  const roomUnsubscribeRef = useRef(null);
  const timerIntervalRef = useRef(null);

  const [view, setView] = useState("BOOT");
  const [roomId, setRoomId] = useState(roomFromUrl || "");
  const [roomData, setRoomData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [myCode, setMyCode] = useState("// Awaiting input...\n");
  const [opponentCode, setOpponentCode] = useState("// Intercepting opponent uplink...\n");
  const [codeMap, setCodeMap] = useState({});
  const [playerRole, setPlayerRole] = useState(null);
  const [language, setLanguage] = useState("javascript");
  const [stack, setStack] = useState("DSA");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [questionCount, setQuestionCount] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [runState, setRunState] = useState({ running: false, submitting: false, error: "", output: null });
  const [finalizedResult, setFinalizedResult] = useState(null);
  const [abortedInfo, setAbortedInfo] = useState(null);
  const [creatingBattle, setCreatingBattle] = useState(false);

  // New: Timer
  const [timerMinutes, setTimerMinutes] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [timerExpired, setTimerExpired] = useState(false);

  // New: Manual question picker
  const [useMyQuestions, setUseMyQuestions] = useState(false);
  const [myQuestionBank, setMyQuestionBank] = useState([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [loadingBank, setLoadingBank] = useState(false);

  // New: show answers on finished
  const [showAnswers, setShowAnswers] = useState(false);

  // ─── BOOT SEQUENCE & AUTH CHECK ───
  const handleJoinRoom = useCallback(async (idToJoin) => {
    try {
      const response = await joinClashRoom({ roomId: idToJoin });
      const joinedRoom = response?.room;
      const role = response?.role;
      if (!joinedRoom || !role) throw new Error("Room not found or unavailable.");

      const joinLanguage = joinedRoom?.config?.language || "javascript";
      const fallbackCode = getStarterCode(joinedRoom?.questions?.[0], joinLanguage);
      const initialCode = role === "player1"
        ? joinedRoom?.player1?.code || fallbackCode
        : joinedRoom?.player2?.code || fallbackCode;

      setRoomId(idToJoin);
      setRoomData(joinedRoom);
      setQuestions(joinedRoom?.questions || []);
      setCurrentQuestionIndex(Number(joinedRoom?.currentQuestionIndex || 0));
      setPlayerRole(role);
      setLanguage(joinLanguage);
      setMyCode(initialCode);
      const firstQid = joinedRoom?.questions?.[0]?.id;
      if (firstQid) setCodeMap({ [firstQid]: initialCode });
      setView(joinedRoom?.status === "BATTLE" ? "BATTLE" : "WAITING");
      listenToRoom(idToJoin, role);
    } catch (error) {
      alert(error.message || "Room not found or expired.");
      setView("LOBBY");
    }
  }, []);

  useEffect(() => {
    let bootTimer = null;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        bootTimer = setTimeout(() => {
          if (roomFromUrl) { handleJoinRoom(roomFromUrl); } else { setView("LOBBY"); }
        }, 3500);
      } else {
        if (roomFromUrl) {
          navigate(`/login?redirect=${encodeURIComponent('/clash?room=' + roomFromUrl)}`);
        } else { navigate("/login"); }
      }
    });
    return () => { unsubscribe(); if (bootTimer) clearTimeout(bootTimer); };
  }, [navigate, roomFromUrl, handleJoinRoom]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (roomUnsubscribeRef.current) roomUnsubscribeRef.current();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const currentQuestion = useMemo(() => questions[currentQuestionIndex] || null, [questions, currentQuestionIndex]);

  // ─── Load question bank when "Use My Questions" is toggled ───
  useEffect(() => {
    if (!useMyQuestions) { setMyQuestionBank([]); setSelectedQuestionIds([]); return; }
    const loadBank = async () => {
      setLoadingBank(true);
      try {
        const constraints = [];
        if (stack) constraints.push(where("stack", "==", stack));
        if (difficulty) constraints.push(where("difficulty", "==", difficulty));
        constraints.push(orderBy("createdAt", "desc"));
        constraints.push(limit(50));
        const q = query(collection(db, "clashQuestions"), ...constraints);
        const snap = await getDocs(q);
        setMyQuestionBank(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch { setMyQuestionBank([]); }
      setLoadingBank(false);
    };
    loadBank();
  }, [useMyQuestions, stack, difficulty]);

  // ─── Timer logic ───
  useEffect(() => {
    if (view !== "BATTLE" || !roomData?.config?.timerMinutes || roomData.config.timerMinutes <= 0) {
      setTimeRemaining(null);
      return;
    }
    const battleStartedAt = roomData?.battleStartedAt?.seconds;
    if (!battleStartedAt) return;

    const endTime = battleStartedAt + roomData.config.timerMinutes * 60;

    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, endTime - nowSec);
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        setTimerExpired(true);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      }
    };

    tick();
    timerIntervalRef.current = setInterval(tick, 1000);
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [view, roomData?.config?.timerMinutes, roomData?.battleStartedAt?.seconds]);

  // Auto-finalize when timer expires
  useEffect(() => {
    if (timerExpired && roomData?.status === "BATTLE" && roomId) {
      finalizeBattle();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerExpired]);

  // ─── CREATE A BATTLE ROOM ───
  const handleCreateRoom = async () => {
    const user = auth.currentUser;
    if (!user || creatingBattle) return;
    setCreatingBattle(true);
    setRunState((prev) => ({ ...prev, error: "" }));

    try {
      let selectedQuestions;

      if (useMyQuestions && selectedQuestionIds.length > 0) {
        // Use manually selected questions
        selectedQuestions = myQuestionBank.filter((q) => selectedQuestionIds.includes(q.id));
      } else {
        // Default: fetch + generate
        const existingQuestions = await fetchClashQuestions({ stack, difficulty, count: questionCount });
        const missingCount = Math.max(0, questionCount - existingQuestions.length);
        const generatedQuestions = missingCount > 0
          ? await generateClashQuestions({ stack, difficulty, language, count: missingCount })
          : [];
        selectedQuestions = [...existingQuestions, ...generatedQuestions].slice(0, questionCount);
      }

      if (!selectedQuestions.length) {
        setRunState((prev) => ({ ...prev, error: "Could not load or generate clash questions for selected filters." }));
        return;
      }

      const roomQuestions = selectedQuestions.map((question) => mapRoomQuestion(question, difficulty));
      const initialCode = getStarterCode(roomQuestions[0], language);
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const roomRef = doc(db, "battles", newRoomId);

      await setDoc(roomRef, {
        status: "WAITING",
        mode: "PRACTICAL",
        config: { stack, difficulty, questionCount: roomQuestions.length, language, timerMinutes },
        questions: roomQuestions,
        currentQuestionIndex: 0,
        scores: { [user.uid]: 0 },
        submissions: {},
        player1: { uid: user.uid, name: user.displayName || "Hacker 1", code: initialCode, language },
        player2: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setRoomId(newRoomId);
      setPlayerRole("player1");
      setQuestions(roomQuestions);
      setCurrentQuestionIndex(0);
      setMyCode(initialCode);
      setCodeMap({ [roomQuestions[0].id]: initialCode });
      setView("WAITING");
      listenToRoom(newRoomId, "player1");
    } catch (error) {
      setRunState((prev) => ({ ...prev, error: error.message || "Could not create battle." }));
    } finally {
      setCreatingBattle(false);
    }
  };

  // ─── REAL-TIME SYNC ───
  const listenToRoom = (id, role) => {
    const roomRef = doc(db, "battles", id);
    if (roomUnsubscribeRef.current) roomUnsubscribeRef.current();

    roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      setRoomData(data);
      setQuestions(data?.questions || []);
      setCurrentQuestionIndex(Number(data?.currentQuestionIndex || 0));

      if (data.status === "BATTLE") setView("BATTLE");

      if (data.status === "FINISHED") {
        setFinalizedResult(data.result || null);
        setView("FINISHED");
      }

      if (data.status === "ABORTED") {
        const abortedBy = data?.abortedBy || null;
        setAbortedInfo(abortedBy);
        if (abortedBy?.uid !== auth.currentUser?.uid) setView("ABORTED");
      }

      if (role === "player1" && data.player2) {
        setOpponentCode(data.player2.code);
        setMyCode((prev) => data.player1?.code || prev);
      } else if (role === "player2" && data.player1) {
        setOpponentCode(data.player1.code);
        setMyCode((prev) => data.player2?.code || prev);
      }

      setLanguage(data?.config?.language || "javascript");
    });
  };

  const handleCodeChange = async (newCode) => {
    setMyCode(newCode);
    if (currentQuestion?.id) {
      setCodeMap((prev) => ({ ...prev, [currentQuestion.id]: newCode }));
    }
    if (roomId && playerRole) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        const roomRef = doc(db, "battles", roomId);
        await updateDoc(roomRef, { [`${playerRole}.code`]: newCode, updatedAt: serverTimestamp() });
      }, 300);
    }
  };

  const runCurrentCode = async () => {
    if (!roomId || !currentQuestion?.id || timerExpired) return;
    setRunState({ running: true, submitting: false, error: "", output: null });
    try {
      const response = await runClashCode({ roomId, questionId: currentQuestion.id, code: myCode, language });
      setRunState({ running: false, submitting: false, error: "", output: response?.result || null });
    } catch (error) {
      setRunState({ running: false, submitting: false, error: error.message || "Run failed", output: null });
    }
  };

  const submitCurrentCode = async () => {
    if (!roomId || !currentQuestion?.id || timerExpired) return;
    setRunState({ running: false, submitting: true, error: "", output: null });
    try {
      const response = await submitClashAnswer({ roomId, questionId: currentQuestion.id, code: myCode, language });
      const res = response?.result || null;
      setRunState({ running: false, submitting: false, error: "", output: res });
    } catch (error) {
      setRunState({ running: false, submitting: false, error: error.message || "Submit failed", output: null });
    }
  };

  const finalizeBattle = async () => {
    if (!roomId) return;
    setRunState((prev) => ({ ...prev, error: "" }));
    try {
      const result = await finalizeClashMatch({ roomId });
      setFinalizedResult(result);
    } catch (error) {
      setRunState((prev) => ({ ...prev, error: error.message || "Could not finalize battle" }));
    }
  };

  const abortBattle = async () => {
    if (!roomId || !playerRole) { navigate("/dashboard"); return; }
    setRunState((prev) => ({ ...prev, error: "" }));
    try {
      const roomRef = doc(db, "battles", roomId);
      await updateDoc(roomRef, {
        status: "ABORTED",
        abortedBy: { uid: auth.currentUser?.uid || null, name: auth.currentUser?.displayName || "A player" },
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setRunState((prev) => ({ ...prev, error: error.message || "Could not abort battle" }));
      return;
    }
    navigate("/dashboard");
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/clash?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleQuestionSelection = (qId) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  // ── Outcome calculation ──
  const getOutcome = () => {
    if (!roomData || !finalizedResult) return null;
    const myUid = auth.currentUser?.uid;
    const opponentUid = playerRole === "player1" ? roomData?.player2?.uid : roomData?.player1?.uid;
    const myScore = roomData?.scores?.[myUid] || 0;
    const opponentScore = roomData?.scores?.[opponentUid] || 0;
    if (myScore > opponentScore) return "WON";
    if (myScore < opponentScore) return "LOST";
    return "TIE";
  };

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff41] font-mono selection:bg-[#00ff41] selection:text-black relative overflow-hidden">
      <div className="fixed inset-0 z-50 opacity-50 pointer-events-none mix-blend-overlay" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.1) 2px, rgba(0,255,65,0.1) 4px)" }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#050505] to-[#050505] pointer-events-none" />

      <AnimatePresence mode="wait">

        {/* ── BOOT SEQUENCE ── */}
        {view === "BOOT" && (
          <motion.div key="boot" exit={{ opacity: 0, scale: 1.1 }} className="relative z-10 flex flex-col justify-end h-screen p-12 text-sm md:text-lg">
            <div className="max-w-2xl space-y-2 text-[#00ff41]/80 shadow-[0_0_10px_rgba(0,255,65,0.5)]">
              <p><TerminalText text="> INITIATING PROTOCOL: CLASH_ARENA.EXE" delay={0} /></p>
              <p><TerminalText text="> BYPASSING MAINFRAME SECURITY... [OK]" delay={800} /></p>
              <p><TerminalText text="> ESTABLISHING P2P NEURAL LINK...[OK]" delay={1600} /></p>
              <p><TerminalText text="> DECRYPTING ARENA PROTOCOLS...   [OK]" delay={2200} /></p>
              <p className="text-[#00ff41] font-bold mt-4 animate-pulse"><TerminalText text="> ACCESS GRANTED. ENTERING ARENA..." delay={2800} /></p>
            </div>
          </motion.div>
        )}

        {/* ── LOBBY ── */}
        {view === "LOBBY" && (
          <motion.div key="lobby" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex items-center justify-center min-h-screen py-12">
            <div className="w-full max-w-lg p-8 border border-[#00ff41]/30 rounded-xl bg-black/50 backdrop-blur-md shadow-[0_0_40px_rgba(0,255,65,0.1)]">
              <div className="flex justify-center mb-6">
                <Code2 className="w-12 h-12 animate-pulse drop-shadow-[0_0_15px_rgba(0,255,65,0.8)]" />
              </div>
              <h2 className="text-3xl font-bold text-center mb-8 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(0,255,65,0.8)]">Arena Terminal</h2>
              <div className="space-y-5">

                {/* Stack + Difficulty */}
                <div className="grid grid-cols-2 gap-2">
                  <select value={stack} onChange={(e) => setStack(e.target.value)} className="bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                    {STACK_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                    <option value="EASY">EASY</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HARD">HARD</option>
                  </select>
                </div>

                {/* Language */}
                <div>
                  <label className="text-[10px] tracking-widest uppercase text-[#00ff41]/60 mb-1 block">Language</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                    <option value="javascript">JAVASCRIPT</option>
                    <option value="python">PYTHON</option>
                    <option value="cpp">C++</option>
                    <option value="java">JAVA</option>
                  </select>
                </div>

                {/* Question Count + Timer */}
                {!useMyQuestions && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] tracking-widest uppercase text-[#00ff41]/60 mb-1 block">Questions</label>
                      <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                        {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                          <option key={n} value={n}>{n} {n === 1 ? "Question" : "Questions"}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] tracking-widest uppercase text-[#00ff41]/60 mb-1 block">Timer</label>
                      <select value={timerMinutes} onChange={(e) => setTimerMinutes(Number(e.target.value))} className="w-full bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                        {TIMER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Use My Questions Toggle & List */}
                <div className="border border-[#00ff41]/20 rounded-lg p-3 transition-all duration-300">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={useMyQuestions} onChange={(e) => setUseMyQuestions(e.target.checked)} className="accent-[#00ff41] w-4 h-4" />
                    <span className="text-xs tracking-widest uppercase">Use My Questions</span>
                  </label>

                  {useMyQuestions && (
                    <div className="mt-4 pt-4 border-t border-[#00ff41]/10 max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {loadingBank ? (
                        <p className="text-[10px] text-[#00ff41]/50 flex items-center justify-center gap-2 py-4"><Loader2 className="w-3 h-3 animate-spin" /> Loading question bank...</p>
                      ) : myQuestionBank.length === 0 ? (
                        <p className="text-[10px] text-[#00ff41]/40 text-center py-4 bg-black/50 rounded border border-white/5">No questions found for {stack} • {difficulty}.<br/>Add some from the dashboard.</p>
                      ) : (
                        myQuestionBank.map((q) => (
                          <label key={q.id} className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border transition-all ${selectedQuestionIds.includes(q.id) ? "border-[#00ff41]/50 bg-[#00ff41]/10" : "border-[#00ff41]/10 hover:border-[#00ff41]/30 bg-black/40"}`}>
                            <input type="checkbox" checked={selectedQuestionIds.includes(q.id)} onChange={() => toggleQuestionSelection(q.id)} className="accent-[#00ff41] mt-0.5 w-3.5 h-3.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{q.title}</p>
                              <p className="text-[10px] text-[#00ff41]/60 mt-0.5 truncate">{(q.tags || []).join(", ")}</p>
                            </div>
                          </label>
                        ))
                      )}
                      
                      {selectedQuestionIds.length > 0 && (
                        <div className="sticky bottom-0 bg-black/90 pt-2 pb-1 text-[10px] text-[#00ff41] font-bold tracking-wider text-center border-t border-[#00ff41]/20 mt-2">
                          {selectedQuestionIds.length} question(s) selected
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Create Button */}
                <button
                  onClick={handleCreateRoom}
                  disabled={creatingBattle || (useMyQuestions && selectedQuestionIds.length === 0)}
                  className="w-full py-4 border border-[#00ff41] bg-[#00ff41]/10 hover:bg-[#00ff41] hover:text-black transition-all font-bold tracking-widest flex items-center justify-center gap-3 group shadow-[0_0_15px_rgba(0,255,65,0.2)] disabled:opacity-60 disabled:hover:bg-[#00ff41]/10 disabled:hover:text-[#00ff41]"
                >
                  <Terminal className="w-5 h-5" />
                  {creatingBattle ? "[ GENERATING BATTLE... ]" : "[ GENERATE NEW BATTLE ]"}
                </button>
                {runState.error && <p className="text-xs text-rose-400">{runState.error}</p>}

                {/* Join Room */}
                <div className="flex items-center gap-4 opacity-50">
                  <div className="flex-1 h-px bg-[#00ff41]/50" />
                  <span className="text-xs tracking-widest uppercase">or</span>
                  <div className="flex-1 h-px bg-[#00ff41]/50" />
                </div>
                <div className="flex gap-2">
                  <input type="text" value={roomId} onChange={(e) => setRoomId(e.target.value.toUpperCase())} placeholder="ENTER ROOM ID" className="flex-1 bg-black border border-[#00ff41]/30 px-4 py-3 text-[#00ff41] placeholder:text-[#00ff41]/30 focus:outline-none focus:border-[#00ff41] focus:shadow-[0_0_15px_rgba(0,255,65,0.3)] transition-all uppercase tracking-widest" />
                  <button onClick={() => handleJoinRoom(roomId)} disabled={!roomId} className="px-6 border border-[#00ff41]/30 hover:bg-[#00ff41]/20 disabled:opacity-50 transition-all font-bold tracking-widest">JOIN</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── WAITING ROOM ── */}
        {view === "WAITING" && (
          <motion.div key="waiting" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 flex items-center justify-center h-screen">
            <div className="w-full max-w-lg text-center">
              <Users className="w-16 h-16 mx-auto mb-6 opacity-80 animate-pulse" />
              <h2 className="mb-4 text-2xl font-bold tracking-widest uppercase">Awaiting Opponent Uplink...</h2>
              <p className="text-[#00ff41]/60 mb-8">Transmit this frequency to your challenger:</p>
              <div className="flex items-center gap-0 border border-[#00ff41]/40 bg-black/50 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(0,255,65,0.15)] mb-8">
                <div className="flex-1 px-4 py-4 text-xl tracking-[0.3em] font-bold border-r border-[#00ff41]/40 bg-[#00ff41]/5">{roomId}</div>
                <button onClick={copyInviteLink} className="px-6 py-4 hover:bg-[#00ff41]/20 transition-all flex items-center justify-center min-w-[120px]">
                  {copied ? <CheckCircle2 className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
                </button>
              </div>
              {timerMinutes > 0 && (
                <p className="text-xs text-[#00ff41]/50 mb-4"><Clock className="w-3 h-3 inline mr-1" /> Battle timer: {timerMinutes} minutes</p>
              )}
              <div className="flex items-center justify-center gap-3 text-sm opacity-70">
                <Loader2 className="w-4 h-4 animate-spin" /> Listening on port 8080...
              </div>
            </div>
          </motion.div>
        )}

        {/* ── ABORTED ── */}
        {view === "ABORTED" && (
          <motion.div key="aborted" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 flex items-center justify-center h-screen px-6">
            <div className="w-full max-w-xl rounded-2xl border border-rose-500/30 bg-black/70 p-10 text-center shadow-[0_0_40px_rgba(244,63,94,0.12)] backdrop-blur-md">
              <AlertTriangle className="mx-auto mb-5 h-14 w-14 text-rose-400" />
              <h2 className="mb-3 text-3xl font-bold uppercase tracking-[0.2em] text-rose-300">Battle Aborted</h2>
              <p className="mb-8 text-sm leading-7 text-rose-100/75">
                {(abortedInfo?.name || "Your opponent")} has left the battle.
              </p>
              <button onClick={() => navigate("/dashboard")} className="border border-rose-400/40 px-6 py-3 text-sm font-bold uppercase tracking-[0.25em] text-rose-200 transition-all hover:bg-rose-500/10">
                Return To Dashboard
              </button>
            </div>
          </motion.div>
        )}

        {/* ── FINISHED (WIN / LOSE / TIE) ── */}
        {view === "FINISHED" && (
          <motion.div key="finished" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 flex items-center justify-center min-h-screen px-6 py-12">
            <div className="w-full max-w-2xl text-center">
              {(() => {
                const outcome = getOutcome();
                const myUid = auth.currentUser?.uid;
                const opponentUid = playerRole === "player1" ? roomData?.player2?.uid : roomData?.player1?.uid;
                const myScore = roomData?.scores?.[myUid] || 0;
                const opponentScore = roomData?.scores?.[opponentUid] || 0;

                return (
                  <>
                    {/* Outcome Header */}
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.2 }}>
                      {outcome === "WON" && (
                        <div className="mb-8">
                          <Trophy className="w-20 h-20 mx-auto mb-4 text-[#00ff41] drop-shadow-[0_0_30px_rgba(0,255,65,0.8)]" />
                          <h2 className="text-4xl font-black uppercase tracking-[0.3em] text-[#00ff41] drop-shadow-[0_0_20px_rgba(0,255,65,0.6)]">
                            Congratulations!
                          </h2>
                          <p className="text-xl font-bold text-[#00ff41]/80 mt-2 tracking-widest">YOU WON!</p>
                        </div>
                      )}
                      {outcome === "LOST" && (
                        <div className="mb-8">
                          <AlertTriangle className="w-20 h-20 mx-auto mb-4 text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]" />
                          <h2 className="text-4xl font-black uppercase tracking-[0.3em] text-rose-400">
                            You Lost
                          </h2>
                          <p className="text-sm text-rose-300/60 mt-2">Better luck next time, hacker.</p>
                        </div>
                      )}
                      {outcome === "TIE" && (
                        <div className="mb-8">
                          <Trophy className="w-20 h-20 mx-auto mb-4 text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
                          <h2 className="text-4xl font-black uppercase tracking-[0.3em] text-amber-400">
                            It&apos;s a Tie!
                          </h2>
                          <p className="text-sm text-amber-300/60 mt-2">Equally matched hackers.</p>
                        </div>
                      )}
                    </motion.div>

                    {/* Score Cards */}
                    <div className="grid grid-cols-2 gap-4 mb-8 max-w-md mx-auto">
                      <div className={`p-6 rounded-xl border ${outcome === "WON" ? "border-[#00ff41]/40 bg-[#00ff41]/5" : "border-white/10 bg-white/5"}`}>
                        <p className="text-xs uppercase tracking-widest text-[#00ff41]/60 mb-1">Your Score</p>
                        <p className="text-4xl font-black">{myScore}</p>
                      </div>
                      <div className={`p-6 rounded-xl border ${outcome === "LOST" ? "border-rose-400/40 bg-rose-400/5" : "border-white/10 bg-white/5"}`}>
                        <p className="text-xs uppercase tracking-widest text-rose-400/60 mb-1">Opponent</p>
                        <p className="text-4xl font-black text-rose-400">{opponentScore}</p>
                      </div>
                    </div>

                    {/* View Answers */}
                    <button
                      onClick={() => setShowAnswers(!showAnswers)}
                      className="mb-6 px-6 py-2 border border-[#00ff41]/30 text-xs uppercase tracking-widest hover:bg-[#00ff41]/10 transition-all flex items-center gap-2 mx-auto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {showAnswers ? "Hide Answers" : "View Correct Answers"}
                    </button>

                    {showAnswers && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-8 space-y-3 text-left max-w-lg mx-auto">
                        {questions.map((q, idx) => (
                          <div key={q.id || idx} className="border border-[#00ff41]/20 rounded-lg p-4 bg-black/50">
                            <p className="text-xs font-bold mb-1">Q{idx + 1}: {q.title}</p>
                            <p className="text-[10px] text-[#00ff41]/50 whitespace-pre-wrap">{q.description}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}

                    {/* CTA Buttons */}
                    <div className="flex gap-3 justify-center">
                      <button onClick={() => navigate("/clash")} className="px-6 py-3 border border-[#00ff41] bg-[#00ff41]/10 hover:bg-[#00ff41] hover:text-black transition-all font-bold tracking-widest text-sm">
                        Play Again
                      </button>
                      <button onClick={() => navigate("/dashboard")} className="px-6 py-3 border border-[#00ff41]/30 hover:bg-[#00ff41]/10 transition-all font-bold tracking-widest text-sm">
                        Dashboard
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}

        {/* ── BATTLE ARENA — LeetCode-style Split Layout ── */}
        {view === "BATTLE" && (
          <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col h-screen">

            {/* ── Top Nav Bar ── */}
            <header className="min-h-12 border-b border-white/10 bg-[#1a1a1a] flex flex-wrap items-center justify-between px-4 py-2 gap-4 shrink-0">
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => navigate("/dashboard")} className="text-neutral-400 hover:text-white text-xs whitespace-nowrap">← Back</button>
                <div className="w-px h-5 bg-white/10" />
                <span className="text-xs font-semibold text-white/90 whitespace-nowrap">
                  {roomData?.config?.stack || stack} • {roomData?.config?.difficulty || difficulty}
                </span>
                <span className="text-xs text-neutral-500 ml-1 hidden sm:inline">ROOM: {roomId}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Timer */}
                {timeRemaining !== null && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold shrink-0 ${timeRemaining <= 60 ? "bg-rose-500/15 text-rose-400 animate-pulse ring-1 ring-rose-500/50" : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"}`}>
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(timeRemaining)}
                  </div>
                )}

                {/* Scores */}
                <div className="flex items-center gap-1.5 text-[11px] bg-black/40 px-2 py-1 rounded border border-white/5 shrink-0">
                  <span className="text-emerald-400 font-bold px-1">{roomData?.scores?.[auth.currentUser?.uid] || 0}</span>
                  <span className="text-neutral-600">:</span>
                  <span className="text-rose-400 font-bold px-1">{playerRole === "player1" ? (roomData?.scores?.[roomData?.player2?.uid] || 0) : (roomData?.scores?.[roomData?.player1?.uid] || 0)}</span>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button onClick={finalizeBattle} disabled={timerExpired} className="text-xs bg-amber-500/15 text-amber-300 px-3 py-1.5 rounded hover:bg-amber-500/25 disabled:opacity-40 font-medium transition-colors border border-amber-500/20 hover:border-amber-500/40">Finish Test</button>
                  <button onClick={abortBattle} className="text-xs bg-rose-500/10 text-rose-400 px-3 py-1.5 rounded hover:bg-rose-500/20 font-medium transition-colors border border-rose-500/20 hover:border-rose-500/40">Abort</button>
                </div>
              </div>
            </header>

            {/* Timer expired banner */}
            {timerExpired && (
              <div className="h-9 bg-rose-500/15 border-b border-rose-500/20 flex items-center justify-center text-xs text-rose-300 font-medium gap-2">
                <Clock className="w-3.5 h-3.5" /> Time&apos;s up! Battle auto-finalized.
              </div>
            )}

            {/* ── Main Split: Problem | Editor+Output | Opponent ── */}
            <div className="flex flex-1 overflow-hidden">

              {/* ── LEFT: Problem Description ── */}
              <div className="w-[380px] min-w-[300px] max-w-[460px] flex flex-col border-r border-white/10 bg-[#1e1e1e]">
                {/* Question Tabs */}
                <div className="border-b border-white/10 bg-[#252525] px-3 py-2 flex gap-1 overflow-x-auto shrink-0">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id || idx}
                      onClick={() => {
                        setCurrentQuestionIndex(idx);
                        const q = questions[idx];
                        const savedLocal = codeMap[q.id];
                        const mySubmissions = roomData?.submissions?.[auth.currentUser?.uid] || {};
                        const submittedCode = mySubmissions[q.id]?.code;
                        const targetCode = savedLocal ?? submittedCode ?? getStarterCode(q, language);
                        setMyCode(targetCode);
                        if (roomId && playerRole) {
                          const roomRef = doc(db, "battles", roomId);
                          updateDoc(roomRef, { [`${playerRole}.code`]: targetCode, updatedAt: serverTimestamp() }).catch(()=>{});
                        }
                      }}
                      className={`px-3 py-1.5 text-xs rounded whitespace-nowrap transition-colors ${idx === currentQuestionIndex
                        ? "bg-white/10 text-white font-medium"
                        : "text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
                      }`}
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>

                {/* Problem Content */}
                <div className="flex-1 overflow-auto p-5">
                  {currentQuestion ? (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          currentQuestion.difficulty === "EASY" ? "bg-emerald-500/15 text-emerald-400" :
                          currentQuestion.difficulty === "HARD" ? "bg-rose-500/15 text-rose-400" :
                          "bg-amber-500/15 text-amber-400"
                        }`}>{currentQuestion.difficulty}</span>
                        {currentQuestion.tags?.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-neutral-500">{t}</span>
                        ))}
                      </div>
                      <h2 className="text-lg font-semibold text-white mb-4">
                        {currentQuestionIndex + 1}. {currentQuestion.title}
                      </h2>
                      <div className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                        {currentQuestion.description}
                      </div>
                    </>
                  ) : (
                    <p className="text-neutral-500 text-sm">No question loaded.</p>
                  )}
                </div>
              </div>

              {/* ── CENTER: Code Editor + Output ── */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Editor Header with Language Selector */}
                <div className="h-10 bg-[#252525] border-b border-white/10 flex items-center justify-between px-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <select
                      value={language}
                      onChange={(e) => {
                        const newLang = e.target.value;
                        setLanguage(newLang);
                        const starter = getStarterCode(currentQuestion, newLang);
                        setMyCode(starter);
                        if (currentQuestion?.id) {
                          setCodeMap((prev) => ({ ...prev, [currentQuestion.id]: starter }));
                        }
                        if (roomId && playerRole) {
                          const roomRef = doc(db, "battles", roomId);
                          updateDoc(roomRef, {
                            [`${playerRole}.language`]: newLang,
                            [`${playerRole}.code`]: getStarterCode(currentQuestion, newLang),
                            "config.language": newLang,
                            updatedAt: serverTimestamp(),
                          });
                        }
                      }}
                      disabled={timerExpired}
                      className="bg-[#333] text-neutral-200 text-xs px-2.5 py-1 rounded border border-white/10 focus:outline-none focus:border-white/25 disabled:opacity-50"
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="cpp">C++</option>
                      <option value="java">Java</option>
                    </select>
                  </div>
                  <span className="text-[10px] text-neutral-600">{auth.currentUser?.displayName || "Player 1"}</span>
                </div>

                {/* Code Editor */}
                <div className="flex-1 min-h-0 bg-[#1e1e1e]">
                  <Editor
                    height="100%"
                    language={language === "cpp" ? "cpp" : language}
                    theme="vs-dark"
                    value={myCode}
                    onChange={(v) => handleCodeChange(v || "")}
                    options={{
                      minimap: { enabled: false },
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 14,
                      lineHeight: 21,
                      padding: { top: 12 },
                      readOnly: timerExpired,
                      scrollBeyondLastLine: false,
                      renderLineHighlight: "gutter",
                      cursorBlinking: "smooth",
                    }}
                  />
                </div>

                {/* Bottom Bar: Run/Submit + Output */}
                <div className="border-t border-white/10 bg-[#1a1a1a]">
                  {/* Action Buttons */}
                  <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-neutral-500">Score:</span>
                      <span className="text-emerald-400 font-semibold">{roomData?.scores?.[auth.currentUser?.uid] || 0}</span>
                      <span className="text-neutral-600">|</span>
                      <span className="text-neutral-500">Opponent:</span>
                      <span className="text-rose-400 font-semibold">{playerRole === "player1" ? (roomData?.scores?.[roomData?.player2?.uid] || 0) : (roomData?.scores?.[roomData?.player1?.uid] || 0)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={runCurrentCode}
                        disabled={runState.running || runState.submitting || !currentQuestion || timerExpired}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-white/5 border border-white/10 text-neutral-300 text-xs rounded hover:bg-white/10 disabled:opacity-40 transition-colors"
                      >
                        <FlaskConical className="w-3 h-3" />
                        {runState.running ? "Running..." : "Run"}
                      </button>
                      <button
                        onClick={submitCurrentCode}
                        disabled={runState.running || runState.submitting || !currentQuestion || timerExpired}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-xs rounded font-medium hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                      >
                        <Send className="w-3 h-3" />
                        {runState.submitting ? "Submitting..." : "Submit"}
                      </button>
                      {runState.output && runState.output.passed === runState.output.total && runState.output.total > 0 && currentQuestionIndex < questions.length - 1 && (
                        <button
                          onClick={() => {
                            const nextIdx = currentQuestionIndex + 1;
                            setCurrentQuestionIndex(nextIdx);
                            const nextQ = questions[nextIdx];
                            const savedLocal = codeMap[nextQ.id];
                            const mySubmissions = roomData?.submissions?.[auth.currentUser?.uid] || {};
                            const submittedCode = mySubmissions[nextQ.id]?.code;
                            const targetCode = savedLocal ?? submittedCode ?? getStarterCode(nextQ, language);
                            setMyCode(targetCode);
                            if (roomId && playerRole) {
                              const roomRef = doc(db, "battles", roomId);
                              updateDoc(roomRef, { [`${playerRole}.code`]: targetCode, updatedAt: serverTimestamp() }).catch(()=>{});
                            }
                            setRunState({ running: false, submitting: false, error: "", output: null });
                          }}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 text-white text-xs font-medium rounded hover:bg-cyan-500 transition-colors"
                        >
                          Next Question ➔
                        </button>
                      )}
                      {currentQuestionIndex === questions.length - 1 && (
                        <button
                          onClick={finalizeBattle}
                          disabled={timerExpired}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white text-xs font-medium rounded hover:bg-amber-400 disabled:opacity-40 transition-colors"
                        >
                          <Trophy className="w-3 h-3" />
                          Finish Test
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Output Panel */}
                  <div className="max-h-[180px] overflow-auto px-4 py-3 text-[11px] font-mono leading-5 text-neutral-400">
                    {runState.running && <p className="text-cyan-400">▸ Running test harness...</p>}
                    {runState.submitting && <p className="text-emerald-400">▸ Submitting solution...</p>}
                    {runState.error && <p className="text-rose-400">✕ {runState.error}</p>}
                    {!runState.error && !runState.running && !runState.submitting && !runState.output && (
                      <p className="text-neutral-600">Run code or submit to see results</p>
                    )}
                    {runState.output && (
                      <>
                        <p className="text-emerald-400 mb-2">
                          ✓ Passed {runState.output.passed}/{runState.output.total} • {runState.output.elapsedMs}ms • {runState.output.points} pts
                        </p>
                        {(runState.output.cases || []).filter((c) => !c.hidden).map((item) => (
                          <div key={`c-${item.index}`} className="mb-1.5 pl-2 border-l-2 border-white/10">
                            <span className={item.passed ? "text-emerald-400" : "text-rose-400"}>
                              {item.passed ? "✓" : "✕"} Case {item.index + 1}
                            </span>
                            {"expected" in item && <span className="text-neutral-500 ml-2">expected: {formatTerminalValue(item.expected)}</span>}
                            {"output" in item && <span className="text-neutral-500 ml-2">got: {formatTerminalValue(item.output)}</span>}
                            {item.error && <span className="text-rose-400 ml-2">{item.error}</span>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── RIGHT: Opponent Activity Sidebar ── */}
              <div className="w-[220px] min-w-[180px] max-w-[260px] flex flex-col border-l border-white/10 bg-[#1a1a1a]">
                <div className="h-10 bg-[#252525] border-b border-white/10 flex items-center px-3 gap-2 shrink-0">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Opponent</span>
                  <span className="text-[10px] text-neutral-600 ml-auto truncate">
                    {playerRole === "player1" ? (roomData?.player2?.name || "...") : (roomData?.player1?.name || "...")}
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <OpponentActivity opponentCode={opponentCode} />
                </div>
                <div className="border-t border-white/8 px-3 py-2 text-[10px] text-neutral-600 text-center">
                  Code hidden
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
