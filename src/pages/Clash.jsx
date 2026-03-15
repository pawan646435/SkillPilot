// src/pages/Clash.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Users, Play, Copy, CheckCircle2, Code2, AlertTriangle, Loader2, FlaskConical, Send, Trophy } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { fetchClashQuestions, finalizeClashMatch, generateClashQuestions, joinClashRoom, runClashCode, submitClashAnswer } from "../services/clashService";

const DEFAULT_CODE_BY_LANGUAGE = {
  javascript: `function solution(...args) {
  return null;
}
`,
  python: `def solution(*args):
    return None
`,
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

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [text, delay]);
  return <span>{displayed}</span>;
};

export default function Clash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomFromUrl = searchParams.get("room");
  const syncTimerRef = useRef(null);
  const roomUnsubscribeRef = useRef(null);

  const [view, setView] = useState("BOOT"); 
  const [roomId, setRoomId] = useState(roomFromUrl || "");
  const [roomData, setRoomData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [myCode, setMyCode] = useState("// Awaiting input...\n");
  const [opponentCode, setOpponentCode] = useState("// Intercepting opponent uplink...\n");
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

  // ─── 1. BOOT SEQUENCE & AUTH CHECK ───
  useEffect(() => {
    let bootTimer = null;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is logged in, proceed with boot sequence
        bootTimer = setTimeout(() => {
          if (roomFromUrl) {
            handleJoinRoom(roomFromUrl);
          } else {
            setView("LOBBY");
          }
        }, 3500);
      } else {
        // User not logged in, redirect to login but save the destination!
        if (roomFromUrl) {
          navigate(`/login?redirect=${encodeURIComponent('/clash?room=' + roomFromUrl)}`);
        } else {
          navigate("/login");
        }
      }
    });

    return () => {
      unsubscribe();
      if (bootTimer) {
        clearTimeout(bootTimer);
      }
    };
  }, [navigate, roomFromUrl]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
      }
    };
  }, []);

  const currentQuestion = useMemo(() => questions[currentQuestionIndex] || null, [questions, currentQuestionIndex]);

  // ─── 2. CREATE A BATTLE ROOM ───
  const handleCreateRoom = async () => {
    const user = auth.currentUser;
    if (!user || creatingBattle) return;

    setCreatingBattle(true);
    setRunState((prev) => ({ ...prev, error: "" }));

    try {
      const existingQuestions = await fetchClashQuestions({ stack, difficulty, count: questionCount });
      const missingCount = Math.max(0, questionCount - existingQuestions.length);

      const generatedQuestions =
        missingCount > 0
          ? await generateClashQuestions({ stack, difficulty, language, count: missingCount })
          : [];

      const selectedQuestions = [...existingQuestions, ...generatedQuestions].slice(0, questionCount);

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
        config: {
          stack,
          difficulty,
          questionCount: roomQuestions.length,
          language,
        },
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
      setView("WAITING");
      listenToRoom(newRoomId, "player1");
    } catch (error) {
      setRunState((prev) => ({ ...prev, error: error.message || "Could not create battle." }));
    } finally {
      setCreatingBattle(false);
    }
  };

  // ─── 3. JOIN A BATTLE ROOM ───
  const handleJoinRoom = async (idToJoin) => {
    try {
      const response = await joinClashRoom({ roomId: idToJoin });
      const joinedRoom = response?.room;
      const role = response?.role;

      if (!joinedRoom || !role) {
        throw new Error("Room not found or unavailable.");
      }

      const joinLanguage = joinedRoom?.config?.language || "javascript";
      const fallbackCode = getStarterCode(joinedRoom?.questions?.[0], joinLanguage);
      const initialCode =
        role === "player1"
          ? joinedRoom?.player1?.code || fallbackCode
          : joinedRoom?.player2?.code || fallbackCode;

      setRoomId(idToJoin);
      setRoomData(joinedRoom);
      setQuestions(joinedRoom?.questions || []);
      setCurrentQuestionIndex(Number(joinedRoom?.currentQuestionIndex || 0));
      setPlayerRole(role);
      setLanguage(joinLanguage);
      setMyCode(initialCode);
      setView(joinedRoom?.status === "BATTLE" ? "BATTLE" : "WAITING");
      listenToRoom(idToJoin, role);
    } catch (error) {
      alert(error.message || "Room not found or expired.");
      setView("LOBBY");
    }
  };

  // ─── 4. REAL-TIME SYNC ───
  const listenToRoom = (id, role) => {
    const roomRef = doc(db, "battles", id);
    if (roomUnsubscribeRef.current) {
      roomUnsubscribeRef.current();
    }

    roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      setRoomData(data);
      setQuestions(data?.questions || []);
      setCurrentQuestionIndex(Number(data?.currentQuestionIndex || 0));
      
      if (data.status === "BATTLE") {
        setView("BATTLE");
      }

      if (data.status === "FINISHED") {
        setFinalizedResult(data.result || null);
      }

      if (data.status === "ABORTED") {
        const abortedBy = data?.abortedBy || null;
        setAbortedInfo(abortedBy);

        if (abortedBy?.uid !== auth.currentUser?.uid) {
          setView("ABORTED");
        }
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
    if (roomId && playerRole) {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }

      syncTimerRef.current = setTimeout(async () => {
        const roomRef = doc(db, "battles", roomId);
        await updateDoc(roomRef, { [`${playerRole}.code`]: newCode, updatedAt: serverTimestamp() });
      }, 300);
    }
  };

  const runCurrentCode = async () => {
    if (!roomId || !currentQuestion?.id) return;

    setRunState({ running: true, submitting: false, error: "", output: null });
    try {
      const response = await runClashCode({
        roomId,
        questionId: currentQuestion.id,
        code: myCode,
        language,
      });
      setRunState({ running: false, submitting: false, error: "", output: response?.result || null });
    } catch (error) {
      setRunState({ running: false, submitting: false, error: error.message || "Run failed", output: null });
    }
  };

  const submitCurrentCode = async () => {
    if (!roomId || !currentQuestion?.id) return;

    setRunState({ running: false, submitting: true, error: "", output: null });
    try {
      const response = await submitClashAnswer({
        roomId,
        questionId: currentQuestion.id,
        code: myCode,
        language,
      });
      setRunState({ running: false, submitting: false, error: "", output: response?.result || null });
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
    if (!roomId || !playerRole) {
      navigate("/dashboard");
      return;
    }

    setRunState((prev) => ({ ...prev, error: "" }));

    try {
      const roomRef = doc(db, "battles", roomId);
      await updateDoc(roomRef, {
        status: "ABORTED",
        abortedBy: {
          uid: auth.currentUser?.uid || null,
          name: auth.currentUser?.displayName || "A player",
        },
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

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff41] font-mono selection:bg-[#00ff41] selection:text-black relative overflow-hidden">
      <div className="fixed inset-0 z-50 opacity-50 pointer-events-none mix-blend-overlay" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.1) 2px, rgba(0,255,65,0.1) 4px)" }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#050505] to-[#050505] pointer-events-none" />

      <AnimatePresence mode="wait">
        
        {/* BOOT SEQUENCE */}
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

        {/* LOBBY */}
        {view === "LOBBY" && (
          <motion.div key="lobby" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex items-center justify-center h-screen">
            <div className="w-full max-w-md p-8 border border-[#00ff41]/30 rounded-xl bg-black/50 backdrop-blur-md shadow-[0_0_40px_rgba(0,255,65,0.1)]">
              <div className="flex justify-center mb-6">
                <Code2 className="w-12 h-12 animate-pulse drop-shadow-[0_0_15px_rgba(0,255,65,0.8)]" />
              </div>
              <h2 className="text-3xl font-bold text-center mb-8 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(0,255,65,0.8)]">Arena Terminal</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-2">
                  <select value={stack} onChange={(e) => setStack(e.target.value)} className="bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                    <option value="DSA">DSA</option>
                    <option value="JAVASCRIPT">JAVASCRIPT</option>
                    <option value="PYTHON">PYTHON</option>
                  </select>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                    <option value="EASY">EASY</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HARD">HARD</option>
                  </select>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase">
                    <option value="javascript">JAVASCRIPT</option>
                    <option value="python">PYTHON</option>
                  </select>
                  <input type="number" min={1} max={5} value={questionCount} onChange={(e) => setQuestionCount(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} className="bg-black border border-[#00ff41]/30 px-3 py-2 text-xs tracking-widest uppercase" placeholder="Q COUNT" />
                </div>
                <button onClick={handleCreateRoom} disabled={creatingBattle} className="w-full py-4 border border-[#00ff41] bg-[#00ff41]/10 hover:bg-[#00ff41] hover:text-black transition-all font-bold tracking-widest flex items-center justify-center gap-3 group shadow-[0_0_15px_rgba(0,255,65,0.2)] disabled:opacity-60 disabled:hover:bg-[#00ff41]/10 disabled:hover:text-[#00ff41]">
                  <Terminal className="w-5 h-5" />
                  {creatingBattle ? "[ GENERATING BATTLE... ]" : "[ GENERATE NEW BATTLE ]"}
                </button>
                {runState.error && <p className="text-xs text-rose-400">{runState.error}</p>}
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

        {/* WAITING ROOM */}
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
              <div className="flex items-center justify-center gap-3 text-sm opacity-70">
                <Loader2 className="w-4 h-4 animate-spin" /> Listening on port 8080...
              </div>
            </div>
          </motion.div>
        )}

        {view === "ABORTED" && (
          <motion.div key="aborted" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 flex items-center justify-center h-screen px-6">
            <div className="w-full max-w-xl rounded-2xl border border-rose-500/30 bg-black/70 p-10 text-center shadow-[0_0_40px_rgba(244,63,94,0.12)] backdrop-blur-md">
              <AlertTriangle className="mx-auto mb-5 h-14 w-14 text-rose-400" />
              <h2 className="mb-3 text-3xl font-bold uppercase tracking-[0.2em] text-rose-300">Battle Aborted</h2>
              <p className="mb-8 text-sm leading-7 text-rose-100/75">
                {(abortedInfo?.name || "Your opponent")} has left the battle.
              </p>
              <button
                onClick={() => navigate("/dashboard")}
                className="border border-rose-400/40 px-6 py-3 text-sm font-bold uppercase tracking-[0.25em] text-rose-200 transition-all hover:bg-rose-500/10"
              >
                Return To Dashboard
              </button>
            </div>
          </motion.div>
        )}

        {/* BATTLE ARENA (SPLIT SCREEN) */}
        {view === "BATTLE" && (
          <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col h-screen">
            <header className="h-14 border-b border-[#00ff41]/20 bg-black/80 flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
                <span className="font-bold tracking-widest uppercase text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]">Live Clash</span>
              </div>
              <div className="text-2xl font-black tracking-widest drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]">ROOM: {roomId}</div>
              <div className="flex items-center gap-2">
                <button onClick={finalizeBattle} className="text-xs border border-amber-400/50 text-amber-300 px-3 py-1 hover:bg-amber-400/20 uppercase tracking-widest">Finalize</button>
                <button onClick={abortBattle} className="text-xs border border-[#00ff41]/30 px-3 py-1 hover:bg-[#00ff41]/20 uppercase tracking-widest">Abort</button>
              </div>
            </header>

            <div className="h-28 border-b border-[#00ff41]/20 bg-black/70 px-4 py-2 overflow-x-auto">
              <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-widest text-[#00ff41]/70">
                <Trophy className="w-3.5 h-3.5" />
                Practical Clash • {roomData?.config?.stack || stack} • {roomData?.config?.difficulty || difficulty}
              </div>
              <div className="flex gap-2">
                {questions.map((q, idx) => (
                  <button
                    key={q.id || idx}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`px-3 py-2 text-xs border rounded ${idx === currentQuestionIndex ? "border-[#00ff41] bg-[#00ff41]/10" : "border-[#00ff41]/30"}`}
                  >
                    Q{idx + 1} • {q.title || "Untitled"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden xl:flex-row">
              {/* My Editor + Output */}
              <div className="flex min-h-0 flex-[1.2] flex-col border-r border-[#00ff41]/20 relative">
                <div className="h-10 bg-black/80 border-b border-[#00ff41]/20 flex items-center px-4 justify-between">
                  <span className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase"><div className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse" /> Local Terminal</span>
                  <span className="text-xs text-[#00ff41]/50">{auth.currentUser?.displayName || "Player 1"}</span>
                </div>
                <div className="min-h-0 flex-1 relative bg-[#050505]">
                  <Editor height="100%" language={language} theme="vs-dark" value={myCode} onChange={(v) => handleCodeChange(v || "")} options={{ minimap: { enabled: false }, fontFamily: 'JetBrains Mono', fontSize: 15, padding: { top: 16 } }} />
                </div>
                <div className="border-t border-cyan-400/20 bg-black/95 p-4">
                  <OutputTerminal runState={runState} finalizedResult={finalizedResult} />
                </div>
              </div>

              {/* Opponent Preview */}
              <div className="relative flex min-h-[260px] w-full flex-col overflow-hidden border-t border-[#00ff41]/20 bg-black/75 xl:min-h-0 xl:w-[340px] xl:max-w-[340px] xl:border-l xl:border-t-0">
                <div className="h-10 bg-black/80 border-b border-[#00ff41]/20 flex items-center px-4 justify-between">
                  <span className="text-xs font-bold tracking-widest uppercase text-rose-500 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]"><div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Network Intercept</span>
                  <span className="text-xs text-rose-500/50">{roomData?.player2?.name && playerRole === "player1" ? roomData.player2.name : roomData?.player1?.name && playerRole === "player2" ? roomData.player1.name : "Opponent"}</span>
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden bg-[#050505]">
                  <div className="absolute inset-0 z-20 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.12),_transparent_55%)]" />
                  <div className="absolute right-3 top-3 z-30 rounded-full border border-rose-400/20 bg-black/60 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-rose-200/80 backdrop-blur-md">
                    Obfuscated Feed
                  </div>
                  <div className="pointer-events-none absolute inset-0 z-20 backdrop-blur-[3px]" />
                  <div className="absolute inset-0 scale-[1.02] opacity-75 blur-[7px]">
                    <Editor height="100%" language={language} theme="vs-dark" value={opponentCode} options={{ minimap: { enabled: false }, fontFamily: 'JetBrains Mono', fontSize: 14, padding: { top: 16 }, readOnly: true }} />
                  </div>
                </div>
                <div className="border-t border-rose-400/15 bg-rose-500/5 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-rose-200/55">
                  opponent source blurred for practical mode
                </div>
              </div>
            </div>

            <div className="border-t border-[#00ff41]/20 bg-black/90 p-4 overflow-auto">
              <div className="grid min-h-[220px] grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2 border border-[#00ff41]/20 rounded p-3 overflow-auto">
                  <div className="text-xs uppercase tracking-widest text-[#00ff41]/60 mb-2">Current Question</div>
                  <h3 className="text-sm font-bold mb-2">{currentQuestion?.title || "No question selected"}</h3>
                  <p className="text-xs text-[#00ff41]/70 whitespace-pre-wrap">{currentQuestion?.description || "Choose a clash format and start a room."}</p>
                </div>
                <div className="border border-[#00ff41]/20 rounded p-3 flex flex-col">
                  <div className="text-xs uppercase tracking-widest text-[#00ff41]/60 mb-2">Execute</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={runCurrentCode} disabled={runState.running || runState.submitting || !currentQuestion} className="py-2 border border-cyan-400/50 text-cyan-300 text-xs uppercase tracking-widest hover:bg-cyan-400/20 disabled:opacity-50 flex items-center justify-center gap-1">
                      <FlaskConical className="w-3.5 h-3.5" />
                      {runState.running ? "Running..." : "Run Code"}
                    </button>
                    <button onClick={submitCurrentCode} disabled={runState.running || runState.submitting || !currentQuestion} className="py-2 border border-[#00ff41]/50 text-[#00ff41] text-xs uppercase tracking-widest hover:bg-[#00ff41]/20 disabled:opacity-50 flex items-center justify-center gap-1">
                      <Send className="w-3.5 h-3.5" />
                      {runState.submitting ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[#00ff41]/60">
                    My Score: {roomData?.scores?.[auth.currentUser?.uid] || 0}
                  </div>
                  <div className="text-[11px] text-rose-300/70 mb-2">
                    Opponent Score: {playerRole === "player1" ? (roomData?.scores?.[roomData?.player2?.uid] || 0) : (roomData?.scores?.[roomData?.player1?.uid] || 0)}
                  </div>
                  <div className="mt-auto text-[11px] text-neutral-300/50 border border-white/10 rounded p-3">
                    Results stream in the output terminal beside your editor.
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
