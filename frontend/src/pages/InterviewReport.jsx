// src/pages/InterviewReport.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BrainCircuit, ArrowRight, ChevronDown, ChevronUp,
  Trophy, TrendingUp, AlertTriangle, CheckCircle2, RotateCcw
} from "lucide-react";
import { useState } from "react";
import Noise from "../components/Noise";
import BackgroundGlow from "../components/BackgroundGlow";

const GRADE_CONFIG = {
  A: { color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", label: "Excellent" },
  B: { color: "text-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/20", label: "Good" },
  C: { color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20", label: "Average" },
  D: { color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Below Average" },
  F: { color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20", label: "Needs Work" },
};

const HIRE_CONFIG = {
  "Strong Hire": { color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  "Hire": { color: "text-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/20" },
  "Consider": { color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  "No Hire": { color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20" },
};

export default function InterviewReport() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [expandedQA, setExpandedQA] = useState(null);

  const report = state?.report;
  const allQA = state?.allQA || [];
  const role = state?.role || "Unknown Role";
  const difficulty = state?.difficulty || "Medium";

  if (!report) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-neutral-500">
        <div className="text-center space-y-4">
          <p>No report data found.</p>
          <button
            onClick={() => navigate("/interview")}
            className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg"
          >
            Start New Interview
          </button>
        </div>
      </div>
    );
  }

  const gradeConfig = GRADE_CONFIG[report.grade] || GRADE_CONFIG["C"];
  const hireConfig = HIRE_CONFIG[report.hiringRecommendation] || HIRE_CONFIG["Consider"];

  const scoreColor = (score) => {
    if (score >= 8) return "text-emerald-400";
    if (score >= 5) return "text-amber-400";
    return "text-rose-400";
  };

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
            <BrainCircuit className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-4xl font-semibold text-white font-display tracking-tight mb-2">
            Interview Complete
          </h1>
          <p className="text-neutral-500 text-sm">
            {role} · {difficulty} · {allQA.length} questions
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
            <div className={`w-28 h-28 rounded-full border-4 ${gradeConfig.border} ${gradeConfig.bg} flex flex-col items-center justify-center`}>
              <span className={`text-4xl font-bold font-mono ${gradeConfig.color}`}>
                {report.overallScore}
              </span>
              <span className="text-xs text-neutral-600">/100</span>
            </div>
            <div className={`mt-3 px-3 py-1 rounded-full text-xs font-semibold border ${gradeConfig.bg} ${gradeConfig.border} ${gradeConfig.color}`}>
              Grade {report.grade} · {gradeConfig.label}
            </div>
          </div>

          {/* Summary */}
          <div className="flex-1 text-center sm:text-left">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border mb-4 ${hireConfig.bg} ${hireConfig.border} ${hireConfig.color}`}>
              <Trophy className="w-4 h-4" />
              {report.hiringRecommendation}
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed mb-2">{report.summary}</p>
            {report.recommendationReason && (
              <p className="text-xs text-neutral-600 italic">{report.recommendationReason}</p>
            )}
          </div>
        </motion.div>

        {/* Strengths & Improvements */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"
        >
          <div className="p-6 rounded-2xl bg-emerald-400/[0.04] border border-emerald-400/10">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-400">Top Strengths</p>
            </div>
            <ul className="space-y-2">
              {report.topStrengths?.map((s, i) => (
                <li key={i} className="text-sm text-neutral-400 flex items-start gap-2">
                  <span className="text-emerald-400 shrink-0 mt-0.5">+</span>{s}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-amber-400/[0.04] border border-amber-400/10">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-semibold text-amber-400">Key Improvements</p>
            </div>
            <ul className="space-y-2">
              {report.criticalImprovements?.map((s, i) => (
                <li key={i} className="text-sm text-neutral-400 flex items-start gap-2">
                  <span className="text-amber-400 shrink-0 mt-0.5">→</span>{s}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Next Steps */}
        {report.nextSteps?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 mb-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <p className="text-sm font-semibold text-sky-400">Recommended Next Steps</p>
            </div>
            <ul className="space-y-2">
              {report.nextSteps.map((step, i) => (
                <li key={i} className="text-sm text-neutral-400 flex items-start gap-2">
                  <span className="font-mono text-xs text-neutral-600 shrink-0 mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Q&A Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <h2 className="text-lg font-semibold text-white font-display mb-4">Question Breakdown</h2>
          <div className="space-y-3">
            {allQA.map((qa, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white/[0.02] border border-white/8 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedQA(expandedQA === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="font-mono text-xs text-neutral-600 shrink-0">Q{i + 1}</span>
                    {qa.topic && (
                      <span className="px-2 py-0.5 rounded-md bg-white/5 text-xs text-neutral-500 font-mono shrink-0">
                        {qa.topic}
                      </span>
                    )}
                    <span className="text-sm text-neutral-300 truncate">{qa.question}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className={`text-sm font-bold font-mono ${scoreColor(qa.score)}`}>
                      {qa.score}/10
                    </span>
                    {expandedQA === i
                      ? <ChevronUp className="w-4 h-4 text-neutral-600" />
                      : <ChevronDown className="w-4 h-4 text-neutral-600" />
                    }
                  </div>
                </button>

                {expandedQA === i && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-5 pb-5 space-y-4 border-t border-white/5"
                  >
                    <div className="pt-4">
                      <p className="text-xs text-neutral-600 uppercase tracking-wider mb-2">Your Answer</p>
                      <p className="text-sm text-neutral-400 leading-relaxed">
                        {qa.answer || <span className="italic text-neutral-700">No answer provided</span>}
                      </p>
                    </div>
                    {qa.feedback && (
                      <div>
                        <p className="text-xs text-neutral-600 uppercase tracking-wider mb-2">Feedback</p>
                        <p className="text-sm text-neutral-400 leading-relaxed">{qa.feedback}</p>
                      </div>
                    )}
                    {qa.modelAnswer && (
                      <div>
                        <p className="text-xs text-neutral-600 uppercase tracking-wider mb-2">Model Answer</p>
                        <p className="text-sm text-neutral-500 leading-relaxed italic">{qa.modelAnswer}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <button
            onClick={() => navigate("/interview")}
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
