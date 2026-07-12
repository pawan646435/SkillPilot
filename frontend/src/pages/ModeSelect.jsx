// src/pages/ModeSelect.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import { BrainCircuit, Users, ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "../context/authContextStore";
import Noise from "../components/Noise";
import BackgroundGlow from "../components/BackgroundGlow";

export default function ModeSelect() {
  const navigate = useNavigate();
  const { user, authReady } = useAuth();

  // Same auth gate as InterviewSetup -- both downstream flows require a
  // signed-in user (the backend's require_auth dependency enforces this
  // regardless, this just avoids a pointless round trip for a logged-out visitor).
  useEffect(() => {
    if (authReady && !user) {
      navigate("/login?redirect=%2Finterview%2Fselect");
    }
  }, [authReady, user, navigate]);

  if (!authReady || !user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-neutral-400 font-mono text-sm">
        {authReady ? "Redirecting to login..." : "Checking session..."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] relative overflow-hidden flex items-center justify-center">
      <Noise />
      <BackgroundGlow />

      <div className="relative z-10 w-full max-w-3xl px-6 py-16 mx-auto">
        <Motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h1 className="mb-3 text-4xl font-semibold tracking-tight text-white font-display">
            Choose Your Interview
          </h1>
          <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed">
            Two ways to practice — pick the one that fits what you're preparing for.
          </p>
        </Motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Classic */}
          <Motion.button
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            onClick={() => navigate("/interview")}
            className="group text-left p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.05] transition-all duration-200"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 mb-6 rounded-2xl bg-white/[0.04] border border-white/10">
              <BrainCircuit className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white font-display">
              Classic Interview
            </h2>
            <p className="mb-6 text-sm text-neutral-400 leading-relaxed">
              Pick a role, difficulty, and question count. One AI interviewer, instant
              feedback after every answer.
            </p>
            <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">
              Start Classic
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Motion.button>

          {/* AI Panel */}
          <Motion.button
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            onClick={() => navigate("/interview/panel")}
            className="group relative text-left p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-sky-400/30 hover:bg-white/[0.05] transition-all duration-200"
          >
            <span className="absolute top-6 right-6 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-400/10 border border-sky-400/20 text-[10px] font-semibold uppercase tracking-wider text-sky-400">
              <Sparkles className="w-3 h-3" /> New
            </span>
            <div className="inline-flex items-center justify-center w-14 h-14 mb-6 rounded-2xl bg-white/[0.04] border border-white/10">
              <Users className="w-7 h-7 text-sky-400" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white font-display">
              AI Panel Interview
            </h2>
            <p className="mb-6 text-sm text-neutral-400 leading-relaxed">
              Paste your resume — questions are grounded in your real experience, asked by
              a Technical Interviewer and a Hiring Manager, with real-time streaming responses.
            </p>
            <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">
              Start Panel Interview
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Motion.button>
        </div>
      </div>
    </div>
  );
}
