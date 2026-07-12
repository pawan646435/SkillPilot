// src/pages/PanelReport.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Trophy, RotateCcw, ArrowRight, BrainCircuit } from "lucide-react";
import Noise from "../components/Noise";
import BackgroundGlow from "../components/BackgroundGlow";

const HIRE_CONFIG = {
  "Strong Hire": { color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  "Hire": { color: "text-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/20" },
  "Consider": { color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  "No Hire": { color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20" },
};

function scoreConfig(score) {
  if (score >= 80) return { color: "text-emerald-400", border: "border-emerald-400/30", bg: "bg-emerald-400/10" };
  if (score >= 60) return { color: "text-sky-400", border: "border-sky-400/30", bg: "bg-sky-400/10" };
  if (score >= 40) return { color: "text-amber-400", border: "border-amber-400/30", bg: "bg-amber-400/10" };
  return { color: "text-rose-400", border: "border-rose-400/30", bg: "bg-rose-400/10" };
}

export default function PanelReport() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const report = state?.report;

  if (!report) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-neutral-500">
        <div className="text-center space-y-4">
          <p>No report data found.</p>
          <button
            onClick={() => navigate("/interview/panel")}
            className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg"
          >
            Start New Panel Interview
          </button>
        </div>
      </div>
    );
  }

  const hireConfig = HIRE_CONFIG[report.hireRecommendation] || HIRE_CONFIG["Consider"];
  const scoreCfg = scoreConfig(report.overallScore ?? 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] relative">
      <Noise />
      <BackgroundGlow />

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 mb-6">
            <Users className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-4xl font-semibold text-white font-display tracking-tight mb-2">
            Panel Interview Complete
          </h1>
          <p className="text-neutral-500 text-sm">
            Technical Interviewer + Hiring Manager · synthesized by the Panel Lead
          </p>
        </motion.div>

        {/* Score Hero */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 mb-6 flex flex-col sm:flex-row items-center gap-8"
        >
          {/* Score Circle */}
          <div className="flex flex-col items-center shrink-0">
            <div className={`w-28 h-28 rounded-full border-4 ${scoreCfg.border} ${scoreCfg.bg} flex flex-col items-center justify-center`}>
              <span className={`text-4xl font-bold font-mono ${scoreCfg.color}`}>
                {report.overallScore}
              </span>
              <span className="text-xs text-neutral-600">/100</span>
            </div>
          </div>

          {/* Summary */}
          <div className="flex-1 text-center sm:text-left">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border mb-4 ${hireConfig.bg} ${hireConfig.border} ${hireConfig.color}`}>
              <Trophy className="w-4 h-4" />
              {report.hireRecommendation}
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed">
              Weighted 60% technical competence, 40% leadership/collaboration/culture.
            </p>
          </div>
        </motion.div>

        {/* Technical + Cultural Fit Summaries */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"
        >
          <div className="p-6 rounded-2xl bg-sky-400/[0.04] border border-sky-400/10">
            <div className="flex items-center gap-2 mb-4">
              <BrainCircuit className="w-4 h-4 text-sky-400" />
              <p className="text-sm font-semibold text-sky-400">Technical Interviewer</p>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed">{report.technicalSummary}</p>
          </div>

          <div className="p-6 rounded-2xl bg-violet-400/[0.04] border border-violet-400/10">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-violet-400" />
              <p className="text-sm font-semibold text-violet-400">Hiring Manager</p>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed">{report.culturalFitSummary}</p>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <button
            onClick={() => navigate("/interview/panel")}
            className="flex items-center justify-center gap-2 flex-1 px-6 py-3.5 bg-white text-black font-semibold rounded-xl text-sm hover:bg-neutral-100 transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.01]"
          >
            <RotateCcw className="w-4 h-4" />
            Practice Again
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center justify-center gap-2 flex-1 px-6 py-3.5 bg-white/[0.04] border border-white/10 text-neutral-300 font-semibold rounded-xl text-sm hover:bg-white/[0.07] hover:text-white transition-all duration-200"
          >
            Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>

      </div>
    </div>
  );
}
