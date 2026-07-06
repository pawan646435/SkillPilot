// src/pages/dashboard/AssessmentDetail.jsx
import { motion } from "framer-motion";
import { ArrowLeft, Edit, Trash2, Clock, Users, Code2, Send, Loader2, Calendar, BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";

const difficultyColors = {
  EASY: "text-emerald-400 bg-emerald-400/10",
  MEDIUM: "text-amber-400 bg-amber-400/10",
  HARD: "text-rose-400 bg-rose-400/10",
};

export default function AssessmentDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [assessment, setAssessment] = useState(null);
  const[loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const docRef = doc(db, "assessments", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAssessment({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssessment();
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this assessment? All invites will be removed.")) return;
    try {
      await deleteDoc(doc(db, "assessments", id));
      navigate("/dashboard/assessments");
    } catch {
      alert("Failed to delete");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;
  if (!assessment) return <div className="py-20 font-mono text-center text-neutral-500">Assessment not found.</div>;

  return (
    <div className="flex flex-col w-full max-w-4xl gap-8 mx-auto">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <Link to="/dashboard/assessments" className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white font-display">{assessment.title}</h1>
            {assessment.description && <p className="mt-2 text-sm text-neutral-400">{assessment.description}</p>}
            
            <div className="flex flex-wrap items-center gap-4 mt-4 font-mono text-xs text-neutral-500">
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-emerald-400" /> {assessment.duration} minutes</span>
              <span className="flex items-center gap-1.5"><Code2 className="w-4 h-4 text-blue-400" /> {assessment.problems?.length || 0} problems</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-amber-400" /> {assessment.createdAt?.toDate().toLocaleDateString() || 'Recently'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          
          {/* THE MISSING RESULTS BUTTON! */}
          <Link to={`/dashboard/assessments/${id}/results`} className="px-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-white hover:bg-white/[0.08] text-sm font-medium flex items-center gap-2 transition-all">
            <BarChart3 className="w-4 h-4 text-purple-400" /> Results
          </Link>

          <Link to={`/dashboard/assessments/${id}/edit`} className="px-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-white hover:bg-white/[0.08] text-sm font-medium flex items-center gap-2 transition-all">
            <Edit className="w-4 h-4 text-blue-400" /> Edit
          </Link>
          
          <Link to={`/dashboard/assessments/${id}/invite`} className="px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500/20 text-sm font-bold tracking-wider uppercase flex items-center gap-2 transition-all">
            <Send className="w-4 h-4" /> Invite
          </Link>
          
          <button onClick={handleDelete} className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-all">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Problems Attached */}
      <div className="p-8 border shadow-xl rounded-2xl bg-surface border-white/5">
        <h2 className="flex items-center gap-2 mb-6 text-sm font-bold tracking-widest uppercase text-neutral-500">
          <Code2 className="w-4 h-4" /> Attached Problems
        </h2>

        <div className="flex flex-col gap-4">
          {assessment.problems?.length > 0 ? (
            assessment.problems.map((ap, idx) => (
              <motion.div key={ap.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="flex items-center justify-between p-5 rounded-xl bg-[#0a0a0a] border border-white/10 shadow-lg">
                <div className="flex items-center gap-4">
                  <span className="w-6 font-mono text-xs font-bold text-neutral-600">#{ap.order || idx + 1}</span>
                  <Code2 className="w-5 h-5 text-neutral-500" />
                  <div>
                    <Link to={`/dashboard/problems/${ap.id}`} className="text-base font-semibold tracking-wide text-white transition-colors hover:text-emerald-400 font-display">
                      {ap.title}
                    </Link>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                      <span className={`px-2 py-0.5 rounded font-bold ${difficultyColors[ap.difficulty] || ""}`}>
                        {ap.difficulty}
                      </span>
                      <span>{ap.marks || 10} pts</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-neutral-500 text-sm py-10 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02] font-mono">
              No problems attached yet. Click edit to add some.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
