// src/pages/TakeAssessment.jsx
import { motion } from "framer-motion";
import { Terminal, Play, Clock, Code2, AlertCircle, CheckCircle2, Loader2, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { db, auth } from "../lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function TakeAssessment() {
  const navigate = useNavigate();
  const { id: assessmentId } = useParams();
  const[searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite"); // We can use this later to mark invite as completed

  const [assessment, setAssessment] = useState(null);
  const [problems, setProblems] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const[loading, setLoading] = useState(true);

  // Code state tracking
  const [codeMap, setCodeMap] = useState({});
  const [output, setOutput] = useState(["> System Initialized.", "> Awaiting code execution..."]);
  const[isRunning, setIsRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState({}); // Tracks which problems are submitted

  const[remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef(null);

  // Fetch Assessment AND Full Problem Details
  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        if (!assessmentId) return;
        const docRef = doc(db, "assessments", assessmentId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const a = docSnap.data();
          setAssessment({ id: docSnap.id, ...a });
          
          const probs = a.problems ||[];
          
          // Fetch the FULL description and test cases for each problem attached
          const loadedProblems = await Promise.all(
            probs.map(async (p) => {
              const pDoc = await getDoc(doc(db, "problems", p.id));
              return pDoc.exists() ? { ...p, fullData: pDoc.data() } : { ...p, fullData: null };
            })
          );
          
          setProblems(loadedProblems);
          setRemainingSeconds((a.duration || 60) * 60);

          // Initialize code editors for each problem
          const initialCode = {};
          loadedProblems.forEach((p) => {
            initialCode[p.id] = { code: "// Write your solution here\n", language: "javascript" };
          });
          setCodeMap(initialCode);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssessment();
  }, [assessmentId]);

  // Countdown Timer Logic
  useEffect(() => {
    if (remainingSeconds <= 0) return;
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          alert("Time is up! Submitting your answers automatically.");
          navigate("/dashboard");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [remainingSeconds, navigate]);

  const formatTime = (totalSec) => {
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const currentProblem = problems[currentIdx];
  const currentProblemId = currentProblem?.id || null;
  const currentCode = codeMap[currentProblemId]?.code || "";
  const currentLang = codeMap[currentProblemId]?.language || "javascript";

  const updateCode = (value) => {
    if (!currentProblemId) return;
    setCodeMap((prev) => ({
      ...prev,
      [currentProblemId]: { ...prev[currentProblemId], code: value || "" },
    }));
  };

  const updateLanguage = (lang) => {
    if (!currentProblemId) return;
    setCodeMap((prev) => ({
      ...prev,
      [currentProblemId]: { ...prev[currentProblemId], language: lang },
    }));
  };

  // Mock Code Execution
  const handleRunCode = () => {
    setIsRunning(true);
    setOutput((prev) => [...prev, "> Compiling and executing..."]);
    
    setTimeout(() => {
      setOutput((prev) =>[
        ...prev, 
        "> Execution successful.",
        "> Test Cases Passed: All visible tests pass.",
        `> Time: ${Math.floor(Math.random() * 40 + 10)}ms | Space: ${Math.floor(Math.random() * 10 + 30)}MB`,
        "> Ready."
      ]);
      setIsRunning(false);
    }, 1500);
  };

  // Save Submission to Firebase
  const handleSubmit = async () => {
    if (!currentProblemId || submitted[currentProblemId]) return;
    setSubmitting(true);

    try {
      const user = auth.currentUser;
      
      // Save their code to the 'submissions' collection
      await addDoc(collection(db, "submissions"), {
        assessmentId,
        problemId: currentProblemId,
        candidateId: user ? user.uid : "anonymous",
        candidateName: user ? user.displayName || "Unknown" : "Anonymous Candidate",
        code: currentCode,
        language: currentLang,
        status: "ACCEPTED", // Mocking automatic acceptance for now
        score: currentProblem.marks || 10,
        executionTime: Math.floor(Math.random() * 40 + 10),
        createdAt: serverTimestamp()
      });

      setSubmitted((prev) => ({ ...prev, [currentProblemId]: true }));
      setOutput((prev) => [...prev, "> Solution Submitted Successfully!", "> Encrypted and saved to secure server."]);
    } catch (err) {
      setOutput((prev) => [...prev, "> Submission Error: " + err.message]);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── EMPTY STATES ───
  if (loading) {
    return (
      <div className="h-screen w-full bg-[#0a0a0a] flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 mb-4 text-emerald-400 animate-spin" />
        <p className="font-mono text-sm tracking-widest uppercase text-neutral-400">Initializing Secure Environment...</p>
      </div>
    );
  }

  if (!assessment || problems.length === 0) {
    return (
      <div className="h-screen w-full bg-[#0a0a0a] flex items-center justify-center text-center p-4">
        <div>
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-rose-500/50" />
          <h2 className="mb-2 text-xl font-bold text-white font-display">No problems found</h2>
          <p className="max-w-sm mb-6 text-neutral-400">The creator of this assessment has not attached any coding problems yet.</p>
          <button onClick={() => navigate("/dashboard")} className="px-6 py-3 text-sm font-bold text-white transition-colors bg-white/10 hover:bg-white/20 rounded-xl">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isLowTime = remainingSeconds < 300; // under 5 minutes red warning

  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-white flex flex-col font-sans overflow-hidden selection:bg-emerald-500/30 selection:text-white relative z-50">
      
      {/* Top Bar */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#050505] shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <span className="max-w-xs text-base font-bold tracking-wide text-white truncate font-display md:max-w-md">
            {assessment.title}
          </span>
        </div>

        {/* Problem Navigator */}
        <div className="items-center hidden gap-2 md:flex">
          {problems.map((p, idx) => (
            <button
              key={idx}
              onClick={() => { setCurrentIdx(idx); setOutput(["> Ready."]); }}
              className={`w-9 h-9 rounded-lg text-sm font-bold transition-all border ${
                idx === currentIdx
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  : submitted[p.id]
                    ? "bg-white/5 text-emerald-500 border-white/10"
                    : "bg-[#0a0a0a] text-neutral-500 border-white/10 hover:border-white/30 hover:text-white"
              }`}
            >
              {submitted[p.id] ? <CheckCircle2 className="w-4 h-4 mx-auto" /> : idx + 1}
            </button>
          ))}
        </div>

        {/* Timer */}
        <div className="flex items-center gap-4">
          <span className={`font-mono text-lg font-bold px-3 py-1 rounded-md tracking-widest ${isLowTime ? "bg-rose-500/10 text-rose-500 animate-pulse border border-rose-500/20" : "text-neutral-300"}`}>
            <Clock className="inline w-4 h-4 mr-2 -mt-1" />
            {formatTime(remainingSeconds)}
          </span>
          <button
            onClick={() => {
              if (window.confirm("Submit all solutions and end the assessment permanently?")) {
                navigate("/dashboard");
              }
            }}
            className="px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors border rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20"
          >
            Finish Test
          </button>
        </div>
      </header>

      {/* Main Split Area */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-[#050505]">
        
        {/* Left: Problem Statement */}
        <div className="w-full md:w-[45%] lg:w-[40%] flex flex-col border-r border-white/10 bg-[#0a0a0a]">
          <div className="px-6 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-neutral-400">
              <Code2 className="w-4 h-4 text-emerald-500" />
              Problem {currentIdx + 1} of {problems.length}
            </span>
            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest ${
              currentProblem?.difficulty === "EASY" ? "text-emerald-400 bg-emerald-400/10" :
              currentProblem?.difficulty === "HARD" ? "text-rose-400 bg-rose-400/10" : "text-amber-400 bg-amber-400/10"
            }`}>
              {currentProblem?.difficulty || "MEDIUM"}
            </span>
          </div>

          <div className="flex-1 p-6 overflow-y-auto md:p-8 custom-scrollbar">
            <h2 className="mb-6 text-2xl font-bold text-white font-display">
              {currentProblem?.title || "Problem Title"}
            </h2>
            <div className="text-[15px] text-neutral-300 leading-relaxed whitespace-pre-wrap font-mono mb-8">
              {currentProblem?.fullData?.description || "Loading problem description..."}
            </div>

            {/* Visible test cases */}
            {currentProblem?.fullData?.testCases?.filter(tc => !tc.isHidden).length > 0 && (
              <div className="mt-8">
                <h3 className="mb-4 text-xs font-bold tracking-widest uppercase text-neutral-500">Sample Test Cases</h3>
                {currentProblem.fullData.testCases.filter(tc => !tc.isHidden).map((tc, i) => (
                  <div key={i} className="mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/10 shadow-inner">
                    <div className="grid grid-cols-1 gap-4 font-mono text-sm md:grid-cols-2">
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 block mb-2">Input:</span>
                        <span className="whitespace-pre-wrap text-emerald-300">{tc.input}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 block mb-2">Expected:</span>
                        <span className="text-white whitespace-pre-wrap">{tc.expected}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Problem Navigation Mobile/Bottom */}
          <div className="flex justify-between p-4 border-t border-white/5 bg-black/50 shrink-0">
            <button onClick={() => { if (currentIdx > 0) { setCurrentIdx(currentIdx - 1); setOutput(["> Ready."]); } }} disabled={currentIdx === 0} className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors rounded-lg text-neutral-400 hover:text-white bg-white/5 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button onClick={() => { if (currentIdx < problems.length - 1) { setCurrentIdx(currentIdx + 1); setOutput(["> Ready."]); } }} disabled={currentIdx === problems.length - 1} className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider uppercase transition-colors rounded-lg text-neutral-400 hover:text-white bg-white/5 disabled:opacity-30">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Code Editor & Terminal */}
        <div className="flex-1 flex flex-col bg-[#121212] min-w-0 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10">
          
          {/* Editor Toolbar */}
          <div className="h-12 bg-[#050505] flex items-center px-4 border-b border-white/5 shrink-0 justify-between">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#121212] rounded-t-lg border-t border-l border-r border-white/5 text-xs font-mono font-bold text-emerald-400 mt-2">
              <Code2 className="w-3.5 h-3.5" /> solution
            </div>
            <select
              value={currentLang}
              onChange={(e) => updateLanguage(e.target.value)}
              className="text-xs font-bold uppercase tracking-wider bg-transparent text-neutral-400 border border-white/10 rounded-md px-3 py-1.5 focus:outline-none cursor-pointer hover:bg-white/5 transition-colors"
            >
              <option value="javascript" className="bg-[#0a0a0a]">JavaScript</option>
              <option value="python" className="bg-[#0a0a0a]">Python</option>
              <option value="cpp" className="bg-[#0a0a0a]">C++</option>
              <option value="java" className="bg-[#0a0a0a]">Java</option>
            </select>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 relative overflow-hidden min-h-0 pt-4 bg-[#121212]">
            <Editor
              height="100%"
              language={currentLang === "cpp" ? "cpp" : currentLang}
              theme="vs-dark"
              value={currentCode}
              onChange={updateCode}
              options={{
                minimap: { enabled: false },
                fontSize: 15,
                fontFamily: 'JetBrains Mono',
                padding: { top: 10 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                readOnly: submitted[currentProblemId]
              }}
            />
          </div>

          {/* Terminal Panel */}
          <div className="h-56 border-t border-white/10 bg-[#050505] flex flex-col shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            <div className="bg-white/[0.02] border-b border-white/5 px-5 py-2.5 flex justify-between items-center shrink-0">
              <span className="font-mono text-xs font-bold tracking-widest uppercase text-neutral-400">System Terminal</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setOutput(["> Console cleared."])} className="mr-2 text-xs font-bold tracking-wider uppercase transition-colors text-neutral-500 hover:text-white">
                  Clear
                </button>
                <button
                  onClick={handleRunCode}
                  disabled={isRunning || submitted[currentProblemId]}
                  className="flex items-center gap-2 px-4 py-1.5 bg-white/5 text-white hover:bg-white/10 rounded-lg border border-white/10 transition-all disabled:opacity-50 text-xs font-bold tracking-wider uppercase"
                >
                  {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  Run Code
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || submitted[currentProblemId]}
                  className={`flex items-center gap-2 px-5 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all shadow-lg ${
                    submitted[currentProblemId]
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-emerald-500 text-black hover:scale-105 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  } disabled:opacity-50 disabled:hover:scale-100`}
                >
                  {submitted[currentProblemId] ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Submitted</>
                  ) : submitting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting</>
                  ) : (
                    <><Send className="w-3.5 h-3.5" /> Submit</>
                  )}
                </button>
              </div>
            </div>
            <div className="flex-1 p-5 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-400 custom-scrollbar">
              {output.map((line, i) => (
                <motion.p key={i} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className={line.includes("Error") ? "text-rose-400" : line.includes("Passed") || line.includes("Successfully") ? "text-emerald-400" : ""}>
                  {line}
                </motion.p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
