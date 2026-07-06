// src/pages/dashboard/Problems.jsx
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Code2, Search, Filter, Trash2, Edit, Eye, ChevronDown, Tag, Clock, HardDrive, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

const difficultyColors = {
  EASY: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  MEDIUM: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  HARD: "bg-rose-400/10 text-rose-400 border-rose-400/20",
};

export default function Problems() {
  const[problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const[search, setSearch] = useState("");
  const [diffFilter, setDiffFilter] = useState("");
  const[showFilter, setShowFilter] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchProblems = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "problems"));
      let data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Client-side filtering
      if (search) {
        data = data.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
      }
      if (diffFilter) {
        data = data.filter(p => p.difficulty === diffFilter);
      }
      
      setProblems(data);
    } catch (err) {
      console.error("Failed to fetch problems", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProblems(); }, [search, diffFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this problem? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, "problems", id));
      setProblems((prev) => prev.filter((p) => p.id !== id));
    } catch (_err) {
      alert("Failed to delete problem");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-5xl gap-8 mx-auto">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-white font-display">Problems</h1>
          <p className="text-sm text-neutral-400">Create and manage coding problems with test cases.</p>
        </div>

        <Link to="/dashboard/problems/create" className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg hover:scale-105 transition-transform duration-300 shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center gap-2 text-sm w-fit">
          <Plus className="w-4 h-4" /> New Problem
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 group">
          <Search className="absolute w-4 h-4 transition-colors -translate-y-1/2 left-4 top-1/2 text-neutral-500 group-focus-within:text-white" />
          <input type="text" placeholder="Search problems..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm focus:border-white/30 focus:bg-white/[0.05] focus:outline-none transition-all" />
        </div>

        <div className="relative">
          <button onClick={() => setShowFilter(!showFilter)} className="px-5 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-neutral-400 text-sm flex items-center gap-2 hover:bg-white/[0.05] hover:text-white transition-all">
            <Filter className="w-4 h-4" />
            {diffFilter || "Difficulty"}
            <ChevronDown className="w-3 h-3" />
          </button>

          <AnimatePresence>
            {showFilter && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute top-14 right-0 z-50 bg-[#121212] border border-white/10 rounded-xl overflow-hidden shadow-2xl min-w-[140px]">
                {["", "EASY", "MEDIUM", "HARD"].map((d) => (
                  <button key={d} onClick={() => { setDiffFilter(d); setShowFilter(false); }} className="block w-full px-4 py-3 text-sm font-medium text-left transition-colors text-neutral-400 hover:text-white hover:bg-white/5">
                    {d || "All"}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Problem Cards */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-12 font-mono text-sm text-center text-neutral-400 animate-pulse">Loading problems...</div>
        ) : problems.length === 0 ? (
          <div className="text-neutral-500 text-sm py-16 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
            No problems found. Create your first coding problem.
          </div>
        ) : (
          problems.map((problem, i) => (
            <motion.div key={problem.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }} className="p-5 transition-all duration-300 border shadow-lg group rounded-2xl bg-surface border-white/5 hover:border-white/20 shadow-black/50">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="flex items-start flex-1 min-w-0 gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-500/10 group-hover:text-blue-400 group-hover:border-blue-500/20 transition-colors">
                    <Code2 className="w-5 h-5 transition-colors text-neutral-400 group-hover:text-blue-400" />
                  </div>

                  <div className="min-w-0">
                    <Link to={`/dashboard/problems/${problem.id}`} className="text-lg font-semibold tracking-wide text-white transition-colors font-display hover:text-blue-400">
                      {problem.title}
                    </Link>

                    <div className="flex flex-wrap items-center gap-4 mt-2 font-mono text-xs text-neutral-500">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold border ${difficultyColors[problem.difficulty] || difficultyColors.MEDIUM}`}>
                        {problem.difficulty}
                      </span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{problem.timeLimit}s</span>
                      <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" />{problem.memoryLimit}MB</span>
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{problem.testCases?.length || 0} tests</span>
                    </div>

                    {problem.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {problem.tags.map((tag) => (
                          <span key={tag} className="px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold bg-white/5 text-neutral-400 rounded-md border border-white/10">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Link to={`/dashboard/problems/${problem.id}`} className="p-2.5 text-neutral-500 hover:text-white hover:bg-white/10 rounded-xl transition-colors" title="View">
                    <Eye className="w-4 h-4" />
                  </Link>
                  <Link to={`/dashboard/problems/${problem.id}/edit`} className="p-2.5 text-neutral-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-colors" title="Edit">
                    <Edit className="w-4 h-4" />
                  </Link>
                  <button onClick={() => handleDelete(problem.id)} disabled={deleting === problem.id} className="p-2.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-colors disabled:opacity-30" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}