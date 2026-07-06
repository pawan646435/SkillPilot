// src/pages/dashboard/Assessments.jsx
import { motion } from "framer-motion";
import { Plus, FileCode2, MoreVertical, Users, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState([]);
  const[loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        // Fetch from Firebase instead of REST API
        const q = query(collection(db, "assessments"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAssessments(data);
      } catch (err) {
        console.error("Failed to fetch assessments", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssessments();
  },[]);

  return (
    <div className="flex flex-col w-full max-w-5xl gap-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white">Assessments</h1>
          <p className="text-sm text-neutral-400">Manage your technical tests and interview templates.</p>
        </div>
        
        <Link
          to="/dashboard/assessments/create"
          className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg hover:scale-105 transition-transform duration-300 shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Assessment
        </Link>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-8 text-sm text-center text-neutral-400 animate-pulse">Loading assessments...</div>
        ) : assessments.length === 0 ? (
          <div className="py-8 text-sm text-center border border-dashed text-neutral-500 border-white/10 rounded-xl bg-white/5">
            No assessments found. Create your first one.
          </div>
        ) : (
          assessments.map((assessment, i) => (
            <motion.div
              key={assessment.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              onClick={() => navigate("/dashboard/assessments/" + assessment.id)}
              className="flex flex-col justify-between gap-4 p-5 transition-colors border cursor-pointer group rounded-2xl bg-white/5 border-white/10 hover:border-white/20 md:flex-row md:items-center"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 text-white rounded-xl bg-white/5 shrink-0">
                  <FileCode2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white transition-colors group-hover:text-emerald-400">{assessment.title}</h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {assessment.duration || 60} mins
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {assessment.submissions || 0} Submissions
                    </span>
                    <span>Created {assessment.createdAt?.toDate ? assessment.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 text-xs rounded-full font-medium ${assessment.status !== 'DRAFT' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-neutral-500/10 text-neutral-400'}`}>
                  {assessment.status || 'Active'}
                </span>
                <button className="p-2 transition-colors rounded-lg text-neutral-400 hover:text-white hover:bg-white/10">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}