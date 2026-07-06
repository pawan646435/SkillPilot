// src/pages/dashboard/CreateAssessment.jsx
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Save, Loader2, Plus, Trash2, Clock, Search, CheckCircle2, Code2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

const difficultyColors = {
  EASY: "text-emerald-400",
  MEDIUM: "text-amber-400",
  HARD: "text-rose-400",
};

export default function CreateAssessment() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [allProblems, setAllProblems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const[problemSearch, setProblemSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [loadingProblems, setLoadingProblems] = useState(false);

  // Fetch available problems from Firebase
  useEffect(() => {
    const fetchProblems = async () => {
      setLoadingProblems(true);
      try {
        const querySnapshot = await getDocs(collection(db, "problems"));
        let data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (problemSearch) {
          data = data.filter(p => p.title.toLowerCase().includes(problemSearch.toLowerCase()));
        }
        setAllProblems(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProblems(false);
      }
    };
    fetchProblems();
  },[problemSearch]);

  const toggleProblem = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]);
  };

  const selectedProblems = allProblems.filter((p) => selectedIds.includes(p.id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      // Format problems to store inside the assessment doc
      const problemsToStore = selectedProblems.map((p, idx) => ({
        id: p.id,
        title: p.title,
        difficulty: p.difficulty,
        order: idx + 1,
        marks: 10
      }));

      const assessmentData = {
        title,
        description: description || null,
        duration: Number(duration),
        startTime: startTime || null,
        endTime: endTime || null,
        status: "ACTIVE",
        problems: problemsToStore,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "assessments"), assessmentData);
      navigate(`/dashboard/assessments/${docRef.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-3xl gap-8 mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/dashboard/assessments" className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-display">Create Assessment</h1>
          <p className="mt-1 text-sm text-neutral-400">Set up a timed coding test and attach problems.</p>
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="px-5 py-4 text-sm font-medium border rounded-xl bg-rose-500/10 border-rose-500/20 text-rose-400">
          {error}
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        
        <div className="p-6 space-y-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <div>
            <label className="block mb-2 text-sm font-semibold text-neutral-300">Assessment Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend Developer Test — Round 1" required className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none transition-all" />
          </div>

          <div>
            <label className="block mb-2 text-sm font-semibold text-neutral-300">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description for candidates..." rows={3} className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none transition-all resize-none text-sm" />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block mb-2 text-sm font-semibold text-neutral-300"><Clock className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />Duration (min) *</label>
              <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={5} max={480} required className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="block mb-2 text-sm font-semibold text-neutral-300">Start Time</label>
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all text-sm scheme-dark" />
            </div>
            <div>
              <label className="block mb-2 text-sm font-semibold text-neutral-300">End Time</label>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all text-sm scheme-dark" />
            </div>
          </div>
        </div>

        {/* Problem Picker Section */}
        <div className="p-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <div className="flex items-center justify-between mb-6">
            <label className="text-sm font-semibold text-neutral-300">Problems ({selectedIds.length} selected)</label>
            <button type="button" onClick={() => setShowPicker(!showPicker)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider bg-white/[0.05] border border-white/10 rounded-lg text-white hover:bg-white/10 transition-all uppercase">
              <Plus className="w-3.5 h-3.5" /> {showPicker ? "Close Picker" : "Add Problems"}
            </button>
          </div>

          {selectedProblems.length > 0 && (
            <div className="flex flex-col gap-3 mb-6">
              {selectedProblems.map((p, idx) => (
                <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between p-4 rounded-xl bg-[#0a0a0a] border border-white/10">
                  <div className="flex items-center gap-4">
                    <span className="w-6 font-mono text-xs font-bold text-neutral-600">#{idx + 1}</span>
                    <Code2 className="w-5 h-5 text-neutral-500" />
                    <span className="text-sm font-semibold tracking-wide text-white font-display">{p.title}</span>
                    <span className={`text-xs font-bold ${difficultyColors[p.difficulty] || "text-neutral-400"}`}>{p.difficulty}</span>
                  </div>
                  <button type="button" onClick={() => toggleProblem(p.id)} className="p-2 transition-colors rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          <AnimatePresence>
            {showPicker && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="p-5 rounded-xl bg-[#0a0a0a] border border-white/10 shadow-inner">
                  <div className="relative mb-4">
                    <Search className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
                    <input type="text" value={problemSearch} onChange={(e) => setProblemSearch(e.target.value)} placeholder="Search problems..." className="w-full pl-12 pr-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl text-white text-sm focus:border-white/20 focus:outline-none transition-all" />
                  </div>
                  <div className="flex flex-col gap-1 pr-2 overflow-y-auto max-h-64 custom-scrollbar">
                    {loadingProblems ? (
                      <div className="py-4 font-mono text-xs text-center text-neutral-500 animate-pulse">Loading...</div>
                    ) : allProblems.length === 0 ? (
                      <div className="py-4 font-mono text-xs text-center text-neutral-500">No problems found. Create some first.</div>
                    ) : (
                      allProblems.map((p) => {
                        const isSelected = selectedIds.includes(p.id);
                        return (
                          <button key={p.id} type="button" onClick={() => toggleProblem(p.id)} className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl text-sm transition-all font-medium ${isSelected ? "bg-emerald-500/10 border border-emerald-500/20" : "hover:bg-white/5 border border-transparent"}`}>
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${isSelected ? "text-emerald-400" : "text-neutral-700"}`} />
                            <span className={isSelected ? "text-white" : "text-neutral-400"}>{p.title}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ml-auto ${difficultyColors[p.difficulty] || "text-neutral-500"}`}>{p.difficulty}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 pb-12">
          <Link to="/dashboard/assessments" className="px-6 py-3 text-sm font-bold transition-colors text-neutral-400 hover:text-white">Cancel</Link>
          <button type="submit" disabled={saving} className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center gap-2 text-sm disabled:opacity-50 disabled:hover:scale-100">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "CREATING..." : "CREATE ASSESSMENT"}
          </button>
        </div>
      </form>
    </div>
  );
}
