// src/pages/dashboard/ProblemDetail.jsx
import { motion } from "framer-motion";
import { ArrowLeft, Edit, Trash2, Clock, HardDrive, Tag, Eye, EyeOff, Code2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";

const difficultyColors = {
  EASY: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  MEDIUM: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  HARD: "bg-rose-400/10 text-rose-400 border-rose-400/20",
};

export default function ProblemDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        const docRef = doc(db, "problems", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProblem({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.error("No such problem!");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProblem();
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this problem permanently?")) return;
    try {
      await deleteDoc(doc(db, "problems", id));
      navigate("/dashboard/problems");
    } catch {
      alert("Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-neutral-500">Problem not found.</p>
        <Link to="/dashboard/problems" className="text-sm underline text-emerald-400 hover:text-emerald-300">
          Back to problems
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-4xl gap-8 mx-auto">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <Link
            to="/dashboard/problems"
            className="p-2 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-all mt-0.5"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white font-display">
              {problem.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className={"px-3 py-1 rounded-full text-xs font-bold border tracking-wider " + (difficultyColors[problem.difficulty] || difficultyColors.MEDIUM)}>
                {problem.difficulty}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-mono text-neutral-400">
                <Clock className="w-3.5 h-3.5" /> {problem.timeLimit}s
              </span>
              <span className="flex items-center gap-1.5 text-xs font-mono text-neutral-400">
                <HardDrive className="w-3.5 h-3.5" /> {problem.memoryLimit}MB
              </span>
              <span className="font-mono text-xs text-neutral-600">
                ID: {problem.id.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/dashboard/problems/${id}/edit`}
            className="px-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-white hover:bg-white/[0.08] text-sm font-medium flex items-center gap-2 transition-all shadow-lg"
          >
            <Edit className="w-4 h-4 text-blue-400" /> Edit
          </Link>
          <button
            onClick={handleDelete}
            className="px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 hover:bg-rose-500/20 text-sm font-medium flex items-center gap-2 transition-all shadow-lg"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Tags */}
      {problem.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {problem.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold tracking-wider bg-white/5 text-neutral-300 rounded-lg border border-white/10 uppercase"
            >
              <Tag className="w-3 h-3 text-neutral-500" /> {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 border shadow-xl rounded-2xl bg-surface border-white/5"
      >
        <h2 className="flex items-center gap-2 mb-6 text-sm font-bold tracking-widest uppercase text-neutral-500">
          <Code2 className="w-4 h-4" /> Problem Description
        </h2>
        <div className="text-neutral-300 text-[15px] leading-loose whitespace-pre-wrap font-mono">
          {problem.description}
        </div>
      </motion.div>

      {/* Test Cases */}
      <div>
        <h2 className="mb-6 ml-2 text-sm font-bold tracking-widest uppercase text-neutral-500">
          Test Cases ({problem.testCases?.length || 0})
        </h2>
        <div className="flex flex-col gap-4">
          {problem.testCases?.length > 0 ? (
            problem.testCases.map((tc, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/10 shadow-lg relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-1 h-full transition-colors bg-white/5 group-hover:bg-emerald-500/50" />
                <div className="flex items-center justify-between pl-2 mb-4">
                  <span className="text-xs font-bold tracking-widest uppercase text-neutral-400">
                    Test Case #{idx + 1}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md ${tc.isHidden ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400"}`}>
                    {tc.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {tc.isHidden ? "HIDDEN" : "VISIBLE"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 pl-2 md:grid-cols-2">
                  <div>
                    <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mb-2">Input</p>
                    <pre className="px-4 py-3 bg-white/[0.02] rounded-xl text-sm text-emerald-300 font-mono whitespace-pre-wrap border border-white/5">
                      {tc.input || "(empty)"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mb-2">Expected Output</p>
                    <pre className="px-4 py-3 bg-white/[0.02] rounded-xl text-sm text-emerald-300 font-mono whitespace-pre-wrap border border-white/5">
                      {tc.expected || "(empty)"}
                    </pre>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-neutral-500 text-sm py-10 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
              No test cases configured.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
