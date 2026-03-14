// src/pages/dashboard/AssessmentResults.jsx
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Medal, BarChart3, Loader2, ChevronRight, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

const rankColors = {
  0: "from-amber-300 to-yellow-600 text-black", // Gold
  1: "from-gray-300 to-gray-500 text-black",    // Silver
  2: "from-orange-400 to-amber-700 text-white", // Bronze
};

export default function AssessmentResults() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        // 1. Fetch Assessment Details
        const assessRef = doc(db, "assessments", id);
        const assessSnap = await getDoc(assessRef);
        if (assessSnap.exists()) setAssessment({ id: assessSnap.id, ...assessSnap.data() });

        // 2. Fetch all Submissions for this assessment
        const q = query(collection(db, "submissions"), where("assessmentId", "==", id));
        const subSnap = await getDocs(q);
        
        // 3. Group submissions by candidate to calculate total scores
        const candidateMap = {};
        subSnap.docs.forEach((docSnap) => {
          const sub = docSnap.data();
          if (!candidateMap[sub.candidateId]) {
            candidateMap[sub.candidateId] = {
              candidateId: sub.candidateId,
              candidateName: sub.candidateName || "Anonymous Hacker",
              totalScore: 0,
              submissionCount: 0
            };
          }
          candidateMap[sub.candidateId].totalScore += sub.score || 0;
          candidateMap[sub.candidateId].submissionCount += 1;
        });

        // 4. Convert to array and sort by score descending
        const sortedLeaderboard = Object.values(candidateMap).sort((a, b) => b.totalScore - a.totalScore);
        setLeaderboard(sortedLeaderboard);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [id]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;
  }

  const totalParticipants = leaderboard.length;
  const avgScore = totalParticipants > 0 ? Math.round(leaderboard.reduce((s, e) => s + e.totalScore, 0) / totalParticipants) : 0;
  const topScore = totalParticipants > 0 ? leaderboard[0].totalScore : 0;

  return (
    <div className="flex flex-col w-full max-w-4xl gap-8 mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/dashboard/assessments/${id}`} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white font-display">
            <Trophy className="w-7 h-7 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
            Results Dashboard
          </h1>
          <p className="mt-1 text-sm text-neutral-400">{assessment?.title} — Global Leaderboard</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[
          { label: "Total Participants", value: totalParticipants, icon: User, color: "text-white", glow: "group-hover:bg-white/10" },
          { label: "Average Score", value: avgScore, icon: BarChart3, color: "text-blue-400", glow: "group-hover:bg-blue-500/10" },
          { label: "Top Score", value: topScore, icon: Trophy, color: "text-amber-400", glow: "group-hover:bg-amber-500/10" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="relative p-6 overflow-hidden border shadow-xl rounded-2xl bg-surface border-white/5 group">
            <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl transition-colors duration-500 ${stat.glow}`} />
            <div className="relative z-10 flex items-center gap-2 mb-3 text-xs font-bold tracking-widest uppercase text-neutral-500">
              <stat.icon className="w-4 h-4" /> {stat.label}
            </div>
            <div className={`text-4xl font-mono font-bold relative z-10 ${stat.color}`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Leaderboard List */}
      <div className="p-6 border shadow-xl rounded-2xl bg-surface border-white/5">
        <h2 className="mb-6 text-sm font-bold tracking-widest uppercase text-neutral-500">Candidate Rankings</h2>

        {leaderboard.length === 0 ? (
          <div className="text-neutral-500 text-sm py-12 text-center border border-dashed border-white/10 rounded-xl bg-[#0a0a0a] font-mono">
            No submissions yet. Waiting for candidates to finish the assessment.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {leaderboard.map((entry, idx) => (
              <motion.div key={entry.candidateId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}>
                <Link to={`/dashboard/assessments/${id}/results/${entry.candidateId}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-emerald-500/30 hover:bg-white/[0.02] transition-all group shadow-lg">
                  
                  <div className="flex items-center gap-4 mb-4 sm:mb-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-lg shadow-inner ${idx < 3 ? `bg-gradient-to-br ${rankColors[idx]}` : "bg-white/[0.05] text-neutral-400 border border-white/10"}`}>
                      {idx < 3 ? <Medal className="w-5 h-5" /> : idx + 1}
                    </div>
                    <div>
                      <p className="text-lg font-semibold tracking-wide text-white transition-colors group-hover:text-emerald-400">
                        {entry.candidateName}
                      </p>
                      <p className="text-xs font-mono text-neutral-500 mt-0.5">ID: {entry.candidateId.slice(0, 8)}...</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 p-3 rounded-lg sm:gap-6 bg-black/50 sm:bg-transparent sm:p-0">
                    <div className="flex-1 text-center sm:text-right sm:flex-none">
                      <div className="font-mono text-xl font-bold text-emerald-400">{entry.totalScore}</div>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-600">Score</div>
                    </div>
                    <div className="flex-1 pl-4 text-center border-l sm:text-right sm:flex-none sm:border-none border-white/10 sm:pl-0">
                      <div className="font-mono text-base font-bold text-neutral-300">{entry.submissionCount}</div>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-600">Submissions</div>
                    </div>
                    <ChevronRight className="hidden w-5 h-5 transition-colors text-neutral-600 group-hover:text-emerald-400 sm:block" />
                  </div>

                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}