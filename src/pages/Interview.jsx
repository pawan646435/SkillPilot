// src/pages/Interview.jsx
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Play, Bot, User, Send, Code2, AlertCircle, Loader2, Sparkles, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";

export default function Interview() {
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const[code, setCode] = useState('// Write your solution here\nfunction reverseString(s) {\n  // Your code here\n}\n');
  const [output, setOutput] = useState(["> System Initialized.", "> Awaiting connection..."]);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isAITyping, setIsAITyping] = useState(false);
  const[seconds, setSeconds] = useState(0);

  // Timer Tick
  useEffect(() => {
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  },[]);

  // Format Time
  const formatTime = (totalSec) => {
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Scroll Chat to Bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAITyping]);

  // AI Greeting
  useEffect(() => {
    setIsAITyping(true);
    setTimeout(() => {
      setMessages([{ role: "ai", content: "Initializing neural connection... Welcome to SkillPilot. I am your AI Interviewer. Please review the problem statement and let me know your approach before writing code." }]);
      setIsAITyping(false);
    }, 2000);
  },[]);

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput(prev =>[...prev, "> Executing logic via secure terminal..."]);
    // Mocking an execution delay
    setTimeout(() => {
      setOutput(prev =>[...prev, "> Execution complete. 0 Errors.", "> Output:[ 'o', 'l', 'l', 'e', 'h' ]"]);
      setIsRunning(false);
    }, 1500);
  };

  const handleSendMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || isAITyping) return;

    setMessages(prev =>[...prev, { role: "user", content: msg }]);
    setChatInput("");
    setIsAITyping(true);

    // Mock AI Response
    setTimeout(() => {
      setMessages(prev =>[...prev, { role: "ai", content: "That sounds like a solid approach! Modifying the array in-place with two pointers ensures O(1) space complexity. Go ahead and write out the code, and let's see how it runs." }]);
      setIsAITyping(false);
    }, 2500);
  };

  return (
    <div className="h-screen w-full bg-[#050505] text-white flex flex-col font-sans overflow-hidden border-t-4 border-emerald-500 shadow-inner">
      {/* Intense Top Bar */}
      <header className="z-20 flex items-center justify-between px-6 border-b h-14 border-emerald-500/10 bg-black/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <span className="font-display font-bold text-lg tracking-widest uppercase text-white drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">
            Arena.AI
          </span>
          <span className="ml-4 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold tracking-widest border border-emerald-500/30 flex items-center gap-1 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <Sparkles className="w-3 h-3" /> LIVE INTERVIEW
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-emerald-400 font-mono tracking-widest text-lg font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">
            {formatTime(seconds)}
          </span>
          <button onClick={() => navigate("/dashboard")} className="px-4 py-1.5 bg-rose-500/10 text-rose-400 rounded hover:bg-rose-500/20 transition-colors border border-rose-500/20 text-xs font-bold tracking-wider uppercase flex items-center gap-2">
            <LogOut className="w-3.5 h-3.5" /> End Session
          </button>
        </div>
      </header>

      {/* Tri-Pane Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-[#0a0a0a] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/10 via-[#0a0a0a] to-[#0a0a0a]">
        
        {/* LEFT PANE: Problem & Terminal */}
        <div className="relative z-10 flex flex-col w-1/3 border-r border-white/5">
          
          {/* Problem Statement */}
          <div className="flex flex-col overflow-hidden border-b h-1/2 border-white/5 bg-black/40">
            <div className="px-5 py-3 bg-white/[0.02] border-b border-white/5 text-xs text-neutral-400 font-mono tracking-widest uppercase flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-emerald-400" /> Problem Overview
            </div>
            <div className="flex-1 p-6 overflow-y-auto scrollbar-hide">
              <h1 className="mb-4 text-3xl font-bold text-transparent font-display bg-clip-text bg-gradient-to-r from-white to-neutral-500">Reverse String</h1>
              <p className="mb-6 font-sans text-sm leading-relaxed text-neutral-300">
                Write a function that reverses a string. The input string is given as an array of characters <code className="bg-white/10 px-1 py-0.5 rounded text-emerald-300 font-mono text-xs">s</code>.
              </p>
              <div className="p-4 mb-4 font-mono text-xs border rounded-lg shadow-inner bg-white/5 border-white/5 text-emerald-50">
                <span className="block mb-1 uppercase text-neutral-500">Example 1:</span>
                Input: s = ["h","e","l","l","o"]<br/>
                Output:["o","l","l","e","h"]
              </div>
              <p className="font-mono text-xs text-rose-400">Constraint: O(1) extra memory</p>
            </div>
          </div>

          {/* Terminal */}
          <div className="flex flex-col overflow-hidden h-1/2 bg-black/80">
            <div className="px-5 py-3 bg-white/[0.02] border-b border-white/5 text-xs text-neutral-400 font-mono tracking-widest uppercase flex justify-between items-center">
              <span className="flex items-center gap-2"><Terminal className="w-4 h-4 text-emerald-400" /> System Log</span>
              <button onClick={handleRunCode} disabled={isRunning} className="px-4 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold hover:bg-emerald-500/20 transition-all flex items-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                EXECUTE
              </button>
            </div>
            <div className="flex-1 p-5 font-mono text-[11px] text-emerald-500/80 overflow-y-auto leading-loose tracking-widest">
              {output.map((line, i) => (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={i}>{line}</motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* MIDDLE PANE: Code Editor */}
        <div className="flex-1 flex flex-col bg-[#0e0e0e] shadow-2xl relative">
          <div className="h-10 bg-[#050505] flex items-end px-3 gap-1 border-b border-white/5">
            <div className="px-5 py-2 bg-[#0e0e0e] border-t border-l border-r border-white/5 rounded-t-lg text-xs font-mono text-emerald-400 flex items-center gap-2 shadow-inner">
              <Code2 className="w-4 h-4" /> solution.js
            </div>
          </div>
          <div className="relative flex-1 pt-4">
            <Editor height="100%" language="javascript" theme="vs-dark" value={code} onChange={setCode} options={{ minimap: { enabled: false }, fontSize: 16, fontFamily: 'JetBrains Mono', scrollBeyondLastLine: false, padding: { top: 10 } }} />
          </div>
        </div>

        {/* RIGHT PANE: AI Chat */}
        <div className="w-[380px] bg-[#050505] flex flex-col border-l border-white/5 relative shadow-[-20px_0_40px_rgba(0,0,0,0.5)] z-20">
          <div className="flex items-center gap-4 p-5 border-b border-white/5 bg-gradient-to-b from-emerald-500/5 to-transparent shrink-0">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 relative shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <Bot className="w-6 h-6 text-emerald-400" />
              <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#050505]" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-wide text-white font-display">Nexus AI</h3>
              <p className="text-[10px] font-mono tracking-widest text-emerald-500 uppercase">Evaluating Candidate</p>
            </div>
          </div>

          <div className="flex flex-col flex-1 gap-6 p-6 overflow-y-auto scrollbar-hide">
            <AnimatePresence>
              {messages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4 }} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-full`}>
                  <div className={`p-4 text-sm leading-relaxed rounded-2xl shadow-xl ${msg.role === "ai" ? "bg-white/[0.03] border border-white/5 text-neutral-300 rounded-tl-sm" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-50 rounded-tr-sm"}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isAITyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 bg-white/[0.02] border border-white/5 p-4 rounded-2xl rounded-tl-sm w-fit">
                <motion.span animate={{ opacity:[0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} className="w-2 h-2 rounded-full bg-emerald-400" />
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} className="w-2 h-2 rounded-full bg-emerald-400" />
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} className="w-2 h-2 rounded-full bg-emerald-400" />
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={e => { e.preventDefault(); handleSendMessage(); }} className="p-5 border-t border-white/5 bg-black/40 shrink-0">
            <div className="relative group">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={isAITyping} placeholder={isAITyping ? "Processing..." : "Explain your thought process..."} className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-5 pr-14 py-4 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500/40 focus:bg-white/[0.06] transition-all" />
              <button type="submit" disabled={!chatInput.trim() || isAITyping} className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all disabled:opacity-30 disabled:hover:scale-100 hover:scale-110">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}