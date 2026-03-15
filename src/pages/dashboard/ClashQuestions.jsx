import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { Plus, Trash2, Loader2 } from "lucide-react";

const DEFAULT_TEST_CASE = { input: "", expected: "", isHidden: false };

export default function ClashQuestions() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stack, setStack] = useState("DSA");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [tags, setTags] = useState("");
  const [testCases, setTestCases] = useState([DEFAULT_TEST_CASE]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "clashQuestions"), limit(100)));
      const rows = snap.docs
        .map((row) => ({ id: row.id, ...row.data() }))
        .sort((a, b) => (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0));
      setQuestions(rows);
    } catch (err) {
      setError(err.message || "Could not load clash questions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const updateCase = (index, key, value) => {
    setTestCases((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const addCase = () => {
    setTestCases((prev) => [...prev, { ...DEFAULT_TEST_CASE, isHidden: true }]);
  };

  const removeCase = (index) => {
    setTestCases((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const cleanCases = testCases
        .map((item) => ({
          input: item.input,
          expected: item.expected,
          isHidden: Boolean(item.isHidden),
        }))
        .filter((item) => item.input.trim() || item.expected.trim());

      if (!cleanCases.length) {
        throw new Error("Add at least one test case.");
      }

      const cleanTags = tags
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);

      await addDoc(collection(db, "clashQuestions"), {
        title,
        description,
        stack,
        difficulty,
        tags: cleanTags,
        testCases: cleanCases,
        createdAt: serverTimestamp(),
      });

      setTitle("");
      setDescription("");
      setStack("DSA");
      setDifficulty("MEDIUM");
      setTags("");
      setTestCases([DEFAULT_TEST_CASE]);
      await loadQuestions();
    } catch (err) {
      setError(err.message || "Failed to create clash question");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (questionId) => {
    setError("");
    try {
      await deleteDoc(doc(db, "clashQuestions", questionId));
      setQuestions((prev) => prev.filter((item) => item.id !== questionId));
    } catch (err) {
      setError(err.message || "Failed to delete question");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white font-display">Clash Questions</h1>
        <p className="text-sm text-neutral-400">Create and manage practical battle question bank for Code Clash.</p>
      </div>

      {error && (
        <div className="px-4 py-3 text-sm border rounded-xl bg-rose-500/10 border-rose-500/30 text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="border border-white/10 rounded-2xl bg-white/[0.02] p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Question title"
            className="px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white placeholder:text-neutral-500"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white placeholder:text-neutral-500"
          />
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={6}
          placeholder="Problem statement"
          className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white placeholder:text-neutral-500"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select value={stack} onChange={(e) => setStack(e.target.value)} className="px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white">
            <option value="DSA">DSA</option>
            <option value="JAVASCRIPT">JAVASCRIPT</option>
            <option value="PYTHON">PYTHON</option>
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white">
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-300">Test Cases</p>
            <button type="button" onClick={addCase} className="px-3 py-1.5 text-xs border border-white/15 rounded-lg text-neutral-300 hover:text-white hover:border-white/30">
              Add Case
            </button>
          </div>

          {testCases.map((item, idx) => (
            <div key={`case-${idx}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-start p-3 border border-white/10 rounded-xl bg-black/30">
              <textarea
                value={item.input}
                onChange={(e) => updateCase(idx, "input", e.target.value)}
                rows={2}
                placeholder="Input"
                className="px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white text-sm"
              />
              <textarea
                value={item.expected}
                onChange={(e) => updateCase(idx, "expected", e.target.value)}
                rows={2}
                placeholder="Expected output"
                className="px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white text-sm"
              />
              <div className="flex md:flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateCase(idx, "isHidden", !item.isHidden)}
                  className={`px-2 py-1 text-[10px] border rounded ${item.isHidden ? "border-amber-400/40 text-amber-300" : "border-emerald-400/40 text-emerald-300"}`}
                >
                  {item.isHidden ? "HIDDEN" : "VISIBLE"}
                </button>
                <button
                  type="button"
                  onClick={() => removeCase(idx)}
                  className="p-1.5 border border-rose-400/40 text-rose-300 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-lg font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {saving ? "Creating..." : "Create Clash Question"}
        </button>
      </form>

      <div className="border border-white/10 rounded-2xl bg-white/[0.02] overflow-hidden">
        <div className="p-4 border-b border-white/10 text-sm text-neutral-300">Question Bank ({questions.length})</div>
        {loading ? (
          <div className="p-4 text-neutral-400">Loading...</div>
        ) : questions.length === 0 ? (
          <div className="p-4 text-neutral-400">No clash questions available.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {questions.map((item) => (
              <div key={item.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-white font-medium">{item.title}</p>
                  <p className="text-xs text-neutral-500 mt-1">{item.stack} • {item.difficulty} • {(item.tags || []).join(", ") || "NO TAGS"}</p>
                  <p className="text-xs text-neutral-400 mt-2 line-clamp-2">{item.description}</p>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 border border-rose-400/30 text-rose-300 rounded-lg hover:bg-rose-400/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
