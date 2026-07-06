// src/pages/dashboard/DashboardOverview.jsx
import { motion as Motion } from "framer-motion";
import { Users, FileCode2, Activity, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";

export default function DashboardOverview() {
  const navigate = useNavigate();
  const[stats, setStats] = useState([
    { title: "Problems Solved", value: "-", icon: FileCode2 },
    { title: "Battles Won", value: "-", icon: Activity },
    { title: "Current Rank", value: "-", icon: Users },
  ]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        // Fetch user stats from Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        let problemsSolved = 0;
        let battlesWon = 0;
        let currentRank = "Unranked";

        if (userDoc.exists() && userDoc.data().stats) {
          const dataStats = userDoc.data().stats;
          problemsSolved = dataStats.problemsSolved || 0;
          battlesWon = dataStats.battlesWon || 0;
          currentRank = dataStats.currentRank || "Unranked";
        }

        setStats([
          { title: "Problems Solved", value: problemsSolved.toString(), icon: FileCode2 },
          { title: "Battles Won", value: battlesWon.toString(), icon: Activity },
          { title: "Current Rank", value: currentRank.toString(), icon: Users },
        ]);

        const player1Query = query(collection(db, "battles"), where("player1.uid", "==", user.uid), orderBy("updatedAt", "desc"), limit(10));
        const player2Query = query(collection(db, "battles"), where("player2.uid", "==", user.uid), orderBy("updatedAt", "desc"), limit(10));

        const [player1Snap, player2Snap] = await Promise.all([getDocs(player1Query), getDocs(player2Query)]);
        const merged = [...player1Snap.docs, ...player2Snap.docs].reduce((acc, docSnap) => {
          acc[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
          return acc;
        }, {});

        const recent = Object.values(merged)
          .sort((a, b) => {
            const aTime = a?.updatedAt?.seconds || 0;
            const bTime = b?.updatedAt?.seconds || 0;
            return bTime - aTime;
          })
          .slice(0, 5);

        setRecentMatches(recent);
      } catch (err) {
        console.warn("Could not load dashboard stats:", err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  },[]);

  return (
    <div className="flex flex-col w-full gap-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 text-4xl font-semibold tracking-tight text-white font-display">Overview</h1>
          <p className="text-sm text-neutral-400">Monitor your coding progress and battle stats.</p>
        </div>
        
        <button onClick={() => navigate('/clash')} className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg hover:scale-105 transition-transform duration-300 shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center gap-2 text-sm">
          Enter Arena
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 text-emerald-400">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-neutral-400">{stat.title}</h3>
              </div>
              <div className="flex items-end justify-between">
                <span className="font-mono text-4xl font-bold text-white">
                  {loading ? (
                    <Motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-20 h-10 rounded-md bg-white/10"
                    />
                  ) : (
                    stat.value
                  )}
                </span>
              </div>
            </Motion.div>
          );
        })}
      </div>

      {/* Recent Clash Matches */}
      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-4 p-8 rounded-2xl bg-white/[0.02] border border-white/5 min-h-[300px]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-medium text-white font-display">Recent Clash Matches</h3>
          <button onClick={() => navigate('/dashboard/clash-history')} className="px-3 py-1 text-xs border rounded border-white/15 text-neutral-300 hover:text-white hover:border-white/30">
            View All
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-neutral-400">Loading recent matches...</div>
        ) : recentMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[210px] text-center">
            <div className="flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-white/5">
              <FileCode2 className="w-8 h-8 text-neutral-600" />
            </div>
            <h3 className="mb-2 text-xl font-medium text-white font-display">No recent battles</h3>
            <p className="max-w-sm text-sm leading-relaxed text-neutral-500">
              Start a practical code clash to populate your match history.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recentMatches.map((match) => {
              const myUid = auth.currentUser?.uid;
              const isPlayer1 = match?.player1?.uid === myUid;
              const opponent = isPlayer1 ? (match?.player2?.name || "Waiting") : (match?.player1?.name || "Unknown");
              const myScore = isPlayer1 ? (match?.scores?.[match?.player1?.uid] || 0) : (match?.scores?.[match?.player2?.uid] || 0);
              const opScore = isPlayer1 ? (match?.scores?.[match?.player2?.uid] || 0) : (match?.scores?.[match?.player1?.uid] || 0);
              const result = myScore === opScore ? "DRAW" : myScore > opScore ? "WIN" : "LOSS";

              return (
                <div key={match.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">vs {opponent}</p>
                    <p className="text-xs text-neutral-500">Room {match.id} • {match?.config?.stack || "GENERAL"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{myScore} - {opScore}</p>
                    <p className={`text-xs ${result === "WIN" ? "text-emerald-400" : result === "LOSS" ? "text-rose-400" : "text-amber-400"}`}>{result}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Motion.div>
    </div>
  );
}