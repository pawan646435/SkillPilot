// src/pages/InterviewSetup.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BrainCircuit, ChevronRight, Zap, Target, Layers } from "lucide-react";
import Noise from "../components/Noise";
import BackgroundGlow from "../components/BackgroundGlow";

const ROLES = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "DevOps / SRE",
  "ML / AI Engineer",
  "Mobile Engineer",
  "Data Engineer",
  "System Design",
];

const DIFFICULTIES = [
  {
    id: "Easy",
    label: "Easy",
    description: "Junior-level concepts, fundamentals",
    icon: Zap,
    color: "text-emerald-400",
    border: "border-emerald-400/30",
    bg: "bg-emerald-400/5",
    activeBg: "bg-emerald-400/10",
    activeBorder: "border-emerald-400",
  },
  {
    id: "Medium",
    label: "Medium",
    description: "Mid-level, real-world scenarios",
    icon: Target,
    color: "text-amber-400",
    border: "border-amber-400/30",
    bg: "bg-amber-400/5",
    activeBg: "bg-amber-400/10",
    activeBorder: "border-amber-400",
  },
  {
    id: "Hard",
    label: "Hard",
    description: "Senior-level, complex systems",
    icon: Layers,
    color: "text-rose-400",
    border: "border-rose-400/30",
    bg: "bg-rose-400/5",
    activeBg: "bg-rose-400/10",
    activeBorder: "border-rose-400",
  },
];

const QUESTION_COUNTS = [3, 5, 8, 10];

export default function InterviewSetup() {
  const navigate = useNavigate();
  const [role, setRole] = useState("Frontend Engineer");
  const [difficulty, setDifficulty] = useState("Medium");
  const [questionCount, setQuestionCount] = useState(5);

  const handleStart = () => {
    navigate("/interview/room", {
      state: { role, difficulty, questionCount },
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] relative overflow-hidden flex items-center justify-center">
      <Noise />
      <BackgroundGlow />

      <div className="relative z-10 w-full max-w-2xl px-6 py-16 mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-white/[0.04] border border-white/10">
            <BrainCircuit className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="mb-3 text-4xl font-semibold tracking-tight text-white font-display">
            AI Interview
          </h1>
          <p className="text-neutral-400 text-sm max-w-sm mx-auto leading-relaxed">
            Practice with an AI interviewer that adapts to your role and gives real-time feedback on every answer.
          </p>
        </motion.div>

        {/* Config Card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 space-y-8"
        >
          {/* Role Selector */}
          <div>
            <label className="block mb-3 text-sm font-medium text-neutral-300">
              Job Role
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border text-left leading-tight ${
                    role === r
                      ? "bg-white/10 border-white/30 text-white"
                      : "bg-white/[0.02] border-white/5 text-neutral-500 hover:text-white hover:border-white/15 hover:bg-white/[0.04]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block mb-3 text-sm font-medium text-neutral-300">
              Difficulty
            </label>
            <div className="grid grid-cols-3 gap-3">
              {DIFFICULTIES.map((d) => {
                const Icon = d.icon;
                const isActive = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id)}
                    className={`p-4 rounded-xl border transition-all duration-200 text-left ${
                      isActive
                        ? `${d.activeBg} ${d.activeBorder}`
                        : `${d.bg} ${d.border} hover:border-white/20`
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${d.color}`} />
                    <p className={`text-sm font-semibold ${isActive ? "text-white" : "text-neutral-400"}`}>
                      {d.label}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">{d.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question Count */}
          <div>
            <label className="block mb-3 text-sm font-medium text-neutral-300">
              Number of Questions
            </label>
            <div className="flex gap-3">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-mono font-semibold border transition-all duration-200 ${
                    questionCount === n
                      ? "bg-white/10 border-white/30 text-white"
                      : "bg-white/[0.02] border-white/5 text-neutral-500 hover:text-white hover:border-white/15"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-600">
              Estimated time: ~{questionCount * 3}–{questionCount * 5} minutes
            </p>
          </div>

          {/* Summary + Start */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-4 text-xs text-neutral-600 font-mono">
              <span>{role}</span>
              <span>·</span>
              <span>{difficulty}</span>
              <span>·</span>
              <span>{questionCount} questions</span>
            </div>
            <button
              onClick={handleStart}
              className="flex items-center justify-center w-full gap-2 px-6 py-3.5 bg-white text-black font-semibold rounded-xl hover:bg-neutral-100 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.01] text-sm"
            >
              Start Interview
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
