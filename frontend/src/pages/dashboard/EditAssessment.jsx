// src/pages/dashboard/EditAssessment.jsx
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Save, Loader2, Plus, Trash2, Clock, Search, CheckCircle2, Code2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";

export default function EditAssessment() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);

  const [existingProblems, setExistingProblems] = useState([]);
  const [allProblems, setAllProblems] = useState([]);
  const [problemSearch, setProblemSearch] = useState("");
  const[showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, "assessments", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const a = docSnap.data();
          setTitle(a.title || "");
          setDescription(a.description || "");
          setDuration(a.duration || 60);
          setExistingProblems(a.problems ||[]);
        }

        const probSnap = await getDocs(collection(db, "problems"));
        setAllProblems(probSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const existingProblemIds = existingProblems.map((p) => p.id);
  const filteredProblems = allProblems.filter(p => p.title.toLowerCase().includes(problemSearch.toLowerCase()));

  const handleAddProblem = (problem) => {
    setExistingProblems(prev =>[...prev, { id: problem.id, title: problem.title, difficulty: problem.difficulty, order: prev.length + 1, marks: 10 }]);
  };

  const handleRemoveProblem = (problemId) => {
    setExistingProblems(prev => prev.filter(p => p.id !== problemId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, "assessments", id), {
        title, description, duration: Number(duration), problems: existingProblems
      });
      navigate(`/dashboard/assessments/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  return (
    <div className="flex flex-col w-full max-w-3xl gap-8 mx-auto">
      <div className="flex items-center gap-4">
        <Link to={`/dashboard/assessments/${id}`} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white font-display">Edit Assessment</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* Core Info */}
        <div className="p-6 space-y-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <div>
            <label className="block mb-2 text-sm font-semibold text-neutral-300">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all" />
          </div>
          <div>
            <label className="block mb-2 text-sm font-semibold text-neutral-300">Duration (min) *</label>
            <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} required className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all" />
          </div>
        </div>

        {/* Manage Problems */}
        <div className="p-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <div className="flex items-center justify-between mb-6">
            <label className="text-sm font-semibold text-neutral-300">Attached Problems ({existingProblems.length})</label>
            <button type="button" onClick={() => setShowPicker(!showPicker)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider bg-white/[0.05] border border-white/10 rounded-lg text-white hover:bg-white/10 transition-all uppercase">
              <Plus className="w-3.5 h-3.5" /> {showPicker ? "Close Picker" : "Add Problems"}
            </button>
          </div>

          <div className="flex flex-col gap-3 mb-6">
            {existingProblems.map((p, idx) => (
              <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-[#0a0a0a] border border-white/10">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs font-bold text-neutral-600">#{idx + 1}</span>
                  <span className="text-sm text-white font-display">{p.title}</span>
                </div>
                <button type="button" onClick={() => handleRemoveProblem(p.id)} className="p-2 rounded-lg text-neutral-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {/* Problem Picker UI */}
          <AnimatePresence>
            {showPicker && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="p-5 rounded-xl bg-[#0a0a0a] border border-white/10 shadow-inner">
                  <input type="text" value={problemSearch} onChange={(e) => setProblemSearch(e.target.value)} placeholder="Search..." className="w-full mb-4 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl text-white text-sm focus:outline-none" />
                  <div className="flex flex-col gap-1 overflow-y-auto max-h-64 custom-scrollbar">
                    {filteredProblems.map((p) => {
                      const isAttached = existingProblemIds.includes(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => !isAttached && handleAddProblem(p)} disabled={isAttached} className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl text-sm transition-all font-medium ${isAttached ? "bg-emerald-500/10 opacity-50" : "hover:bg-white/5"}`}>
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${isAttached ? "text-emerald-400" : "text-neutral-700"}`} />
                          <span className="text-white">{p.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 pb-12">
          <Link to={`/dashboard/assessments/${id}`} className="px-6 py-3 text-sm font-bold text-neutral-400 hover:text-white">Cancel</Link>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-8 py-3 text-sm font-bold text-black bg-white rounded-xl disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} SAVE
          </button>
        </div>
      </form>
    </div>
  );
}
