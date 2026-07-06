// src/pages/dashboard/CandidateResult.jsx
import { motion } from "framer-motion";
import { ArrowLeft, User, Clock, Code2, CheckCircle2, Loader2, BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";

export default function CandidateResult() {
  const { id: assessmentId, candidateId } = useParams();
  
  const [candidate, setCandidate] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch the user/candidate info
        const userSnap = await getDoc(doc(db, "users", candidateId));
        if (userSnap.exists()) {
          setCandidate({ id: userSnap.id, ...userSnap.data() });
        } else {
          // Fallback if anonymous
          setCandidate({ id: candidateId, name: "Anonymous Hacker" });
        }

        // 2. Fetch submissions for this specific assessment AND candidate
        const q = query(
          collection(db, "submissions"), 
          where("assessmentId", "==", assessmentId),
          where("candidateId", "==", candidateId)
        );
        const subSnap = await getDocs(q);
        
        // 3. For each submission, fetch the corresponding problem title
        const subData = await Promise.all(subSnap.docs.map(async (d) => {
          const sub = d.data();
          let problemTitle = "Unknown Problem";
          if (sub.problemId) {
            const pSnap = await getDoc(doc(db, "problems", sub.problemId));
            if (pSnap.exists()) problemTitle = pSnap.data().title;
          }
          return { id: d.id, ...sub, problemTitle };
        }));

        setSubmissions(subData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [assessmentId, candidateId]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;
  if (!candidate) return <div className="text-center text-neutral-500">Candidate data not found.</div>;

  const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
  const acceptedCount = submissions.filter((s) => s.status === "ACCEPTED").length;

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-5">
        <Link to={`/dashboard/assessments/${assessmentId}/results`} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-2xl font-display font-bold text-neutral-300 shadow-inner">
            {candidate?.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-wide">
              {candidate?.name || "Candidate"}
            </h1>
            <p className="text-neutral-500 text-sm font-mono mt-1">{candidate?.email || `ID: ${candidateId}`}</p>
          </div>
        </div>
      </div>

      {/* Score Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center shadow-[0_0_30px_rgba(16,185,129,0.05)]">
          <BarChart3 className="w-6 h-6 text-emerald-400 mx-auto mb-3" />
          <div className="text-4xl font-mono font-bold text-emerald-400">{totalScore}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70 mt-2">Total Score</div>
        </div>
        <div className="p-6 rounded-2xl bg-surface border border-white/5 text-center shadow-xl">
          <Code2 className="w-6 h-6 text-neutral-400 mx-auto mb-3" />
          <div className="text-4xl font-mono font-bold text-white">{submissions.length}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-2">Submissions</div>
        </div>
        <div className="p-6 rounded-2xl bg-surface border border-white/5 text-center shadow-xl">
          <CheckCircle2 className="w-6 h-6 text-blue-400 mx-auto mb-3" />
          <div className="text-4xl font-mono font-bold text-white">{acceptedCount}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-2">Accepted Solutions</div>
        </div>
      </div>

      {/* Submissions Detail */}
      <div className="p-6 rounded-2xl bg-surface border border-white/5 shadow-xl">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-6">Code Review</h2>

        {submissions.length === 0 ? (
          <div className="text-neutral-500 text-sm py-10 text-center border border-dashed border-white/10 rounded-xl bg-[#0a0a0a]">
            No code submitted by this candidate.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {submissions.map((sub, idx) => (
              <motion.div key={sub.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="rounded-xl border border-white/10 overflow-hidden shadow-lg">
                
                {/* Submission Header */}
                <div className="bg-[#0a0a0a] px-5 py-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Code2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-white font-display font-semibold tracking-wide text-lg">
                      {sub.problemTitle}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest ${sub.status === "ACCEPTED" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                      {sub.status || "PENDING"}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-5 text-xs font-mono text-neutral-400 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1">Score: <span className="text-emerald-400">{sub.score || 0}</span></span>
                    <span className="px-2 py-1 bg-white/5 rounded border border-white/10">{sub.language || "N/A"}</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {sub.executionTime || 0}ms</span>
                  </div>
                </div>

                {/* Code Preview */}
                <div className="bg-[#050505] p-5">
                  <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest mb-3">Submitted Code</p>
                  <pre className="bg-black border border-white/5 rounded-lg p-4 text-sm text-emerald-50 font-mono overflow-x-auto max-h-96 custom-scrollbar shadow-inner">
                    {sub.code || "// No code written"}
                  </pre>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
