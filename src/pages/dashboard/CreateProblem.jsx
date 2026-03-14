// src/pages/dashboard/CreateProblem.jsx
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Eye, EyeOff, Save, Loader2, Tag, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function CreateProblem() {
  const navigate = useNavigate();
  const[saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const[title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const[difficulty, setDifficulty] = useState("MEDIUM");
  const [tags, setTags] = useState([]);
  const[tagInput, setTagInput] = useState("");
  const [timeLimit, setTimeLimit] = useState(10);
  const [memoryLimit, setMemoryLimit] = useState(256);
  const[testCases, setTestCases] = useState([{ input: "", expected: "", isHidden: false }]);

  const addTag = () => {
    const t = tagInput.trim().toUpperCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (tag) => setTags(tags.filter((t) => t !== tag));

  const addTestCase = () => setTestCases([...testCases, { input: "", expected: "", isHidden: true }]);
  const removeTestCase = (idx) => {
    if (testCases.length > 1) setTestCases(testCases.filter((_, i) => i !== idx));
  };
  const updateTestCase = (idx, field, value) => {
    setTestCases(testCases.map((tc, i) => (i === idx ? { ...tc, [field]: value } : tc)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const problemData = {
        title,
        description,
        difficulty,
        tags,
        timeLimit: Number(timeLimit),
        memoryLimit: Number(memoryLimit),
        testCases: testCases.filter((tc) => tc.input || tc.expected),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "problems"), problemData);
      navigate("/dashboard/problems");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-3xl gap-8 mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/dashboard/problems" className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-display">Create Problem</h1>
          <p className="mt-1 text-sm text-neutral-400">Define a coding problem with test cases.</p>
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="px-5 py-4 text-sm font-medium border rounded-xl bg-rose-500/10 border-rose-500/20 text-rose-400">
          {error}
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        
        {/* Core Info */}
        <div className="p-6 space-y-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <div>
            <label className="block mb-2 text-sm font-semibold text-neutral-300">Problem Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two Sum" required className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none transition-all" />
          </div>

          <div>
            <label className="block mb-2 text-sm font-semibold text-neutral-300">Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the problem, constraints, and examples..." required rows={8} className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none transition-all resize-none font-mono text-sm leading-relaxed" />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block mb-2 text-sm font-semibold text-neutral-300">Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all appearance-none cursor-pointer font-bold">
                <option value="EASY" className="bg-[#1a1a1a] text-emerald-400">Easy</option>
                <option value="MEDIUM" className="bg-[#1a1a1a] text-amber-400">Medium</option>
                <option value="HARD" className="bg-[#1a1a1a] text-rose-400">Hard</option>
              </select>
            </div>
            <div>
              <label className="block mb-2 text-sm font-semibold text-neutral-300">Time Limit (s)</label>
              <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} min={1} max={60} className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="block mb-2 text-sm font-semibold text-neutral-300">Memory Limit (MB)</label>
              <input type="number" value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} min={16} max={1024} className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:border-white/30 focus:outline-none transition-all" />
            </div>
          </div>
        </div>

        {/* Tags Section */}
        <div className="p-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <label className="block mb-3 text-sm font-semibold text-neutral-300">Tags</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold tracking-wider bg-white/10 text-white rounded-lg border border-white/20">
                <Tag className="w-3 h-3" /> {tag}
                <button type="button" onClick={() => removeTag(tag)} className="ml-1 transition-colors hover:text-rose-400"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-3">
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Add tag..." className="flex-1 px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm placeholder:text-neutral-600 focus:border-white/30 focus:outline-none transition-all uppercase" />
            <button type="button" onClick={addTag} className="px-6 py-3 bg-white/[0.05] border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-all">Add Tag</button>
          </div>
        </div>

        {/* Test Cases */}
        <div className="p-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <div className="flex items-center justify-between mb-6">
            <label className="text-sm font-semibold text-neutral-300">Test Cases</label>
            <button type="button" onClick={addTestCase} className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider bg-white/[0.05] border border-white/10 rounded-lg text-white hover:bg-white/10 transition-all uppercase">
              <Plus className="w-3.5 h-3.5" /> Add Case
            </button>
          </div>

          <div className="flex flex-col gap-5">
            <AnimatePresence>
              {testCases.map((tc, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="p-5 rounded-xl bg-[#0a0a0a] border border-white/10 relative group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold tracking-widest uppercase text-neutral-500">Test Case #{idx + 1}</span>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => updateTestCase(idx, "isHidden", !tc.isHidden)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${tc.isHidden ? "text-amber-400 bg-amber-400/10" : "text-emerald-400 bg-emerald-400/10"}`}>
                        {tc.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {tc.isHidden ? "HIDDEN" : "VISIBLE"}
                      </button>
                      {testCases.length > 1 && (
                        <button type="button" onClick={() => removeTestCase(idx)} className="p-2 transition-colors rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mb-2 block">Input</label>
                      <textarea value={tc.input} onChange={(e) => updateTestCase(idx, "input", e.target.value)} placeholder='e.g. [2,7,11,15]\n9' rows={3} className="w-full px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-emerald-300 text-sm font-mono placeholder:text-neutral-700 focus:border-emerald-500/30 focus:outline-none transition-all resize-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mb-2 block">Expected Output</label>
                      <textarea value={tc.expected} onChange={(e) => updateTestCase(idx, "expected", e.target.value)} placeholder="e.g.[0,1]" rows={3} className="w-full px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-emerald-300 text-sm font-mono placeholder:text-neutral-700 focus:border-emerald-500/30 focus:outline-none transition-all resize-none" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4 pt-4 pb-12">
          <Link to="/dashboard/problems" className="px-6 py-3 text-sm font-bold transition-colors text-neutral-400 hover:text-white">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center gap-2 text-sm disabled:opacity-50 disabled:hover:scale-100">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "SAVING..." : "CREATE PROBLEM"}
          </button>
        </div>
      </form>
    </div>
  );
}
