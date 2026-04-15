// src/pages/dashboard/Candidates.jsx
import { motion } from "framer-motion";
import { User, Search, Filter, Play, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function Candidates() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Filter out admins if you want, or just show everyone
        setCandidates(data);
      } catch (err) {
        console.error("Could not load candidates:", err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  },[]);

  const filteredCandidates = candidates.filter(c => 
    (c.name || "").toLowerCase().includes(search.toLowerCase()) || 
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col w-full max-w-5xl gap-8 mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-white font-display">Candidates</h1>
          <p className="text-sm text-neutral-400">Review interview performances and profiles.</p>
        </div>
        
        <div className="flex gap-3">
          <div className="relative group">
            <Search className="absolute w-4 h-4 transition-colors -translate-y-1/2 text-neutral-500 left-4 top-1/2 group-focus-within:text-white" />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidates..." 
              className="pl-11 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.05] transition-all w-64"
            />
          </div>
          <button className="px-4 py-3 bg-white/[0.03] border border-white/10 text-neutral-400 rounded-xl hover:bg-white/[0.05] hover:text-white transition-all flex items-center gap-2 text-sm font-medium">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
           <div className="py-12 font-mono text-sm text-center text-neutral-400 animate-pulse">Loading candidates...</div>
        ) : filteredCandidates.length === 0 ? (
           <div className="text-neutral-500 text-sm py-16 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
             No candidates found matching your search.
           </div>
        ) : (
          filteredCandidates.map((candidate, i) => (
            <motion.div
              key={candidate.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="flex flex-col justify-between gap-4 p-5 transition-all border shadow-lg cursor-pointer group rounded-2xl bg-surface border-white/5 hover:border-white/20 md:flex-row md:items-center shadow-black/50"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 text-white transition-all border rounded-xl bg-white/5 border-white/10 shrink-0 group-hover:bg-blue-500/10 group-hover:text-blue-400 group-hover:border-blue-500/20">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white transition-colors font-display group-hover:text-blue-400">
                    {candidate.name || "Unknown User"}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-500 mt-1.5">
                    <span className="text-neutral-300">{candidate.email}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {candidate.submissions || 0} Submissions</span>
                    <span>Joined {candidate.createdAt?.toDate ? candidate.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase mb-1">Invites</span>
                  <span className="text-xl font-bold text-white">
                    {candidate.invites || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-white/[0.03] px-4 py-2.5 rounded-xl border border-white/10 min-w-30 justify-center group-hover:bg-white/10 transition-colors">
                  <span className="text-sm font-medium text-white">View Profile</span>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
