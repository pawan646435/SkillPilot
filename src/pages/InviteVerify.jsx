// src/pages/InviteVerify.jsx
import { motion } from "framer-motion";
import { Clock, Code2, AlertCircle, Loader2, ArrowRight, Shield } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db, auth } from "../lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function InviteVerify() {
  const navigate = useNavigate();
  const { token } = useParams();
  
  const[status, setStatus] = useState("loading"); // loading, valid, expired, error
  const[assessment, setAssessment] = useState(null);
  const [invite, setInvite] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const verifyInviteToken = useCallback(async () => {
    try {
      // 2. Look up the invite by its unique token
      const q = query(collection(db, "invites"), where("token", "==", token));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setStatus("error");
        setErrorMsg("Invalid invite link. It may have been deleted.");
        return;
      }

      const inviteDoc = querySnapshot.docs[0];
      const inviteData = { id: inviteDoc.id, ...inviteDoc.data() };
      setInvite(inviteData);

      // 3. Check expiration
      if (inviteData.status === "EXPIRED") {
        setStatus("expired");
        setErrorMsg("This invite has expired.");
        return;
      }

      // 4. Fetch the Assessment details
      const assessRef = doc(db, "assessments", inviteData.assessmentId);
      const assessSnap = await getDoc(assessRef);

      if (!assessSnap.exists()) {
        setStatus("error");
        setErrorMsg("The assessment for this invite no longer exists.");
        return;
      }

      setAssessment({ id: assessSnap.id, ...assessSnap.data() });
      setStatus("valid");

    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }, [token]);

  useEffect(() => {
    // 1. Ensure the user is logged in before they can view the invite
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Redirect to login, but remember where to send them back!
        navigate(`/login?redirect=${encodeURIComponent(`/assessment/invite/${token}`)}`);
        return;
      }
      verifyInviteToken();
    });

    return () => unsubscribe();
  }, [token, navigate, verifyInviteToken]);

  const handleStart = async () => {
    // Mark the invite as ACCEPTED if they are starting the test
    if (invite.status === "PENDING") {
      await updateDoc(doc(db, "invites", invite.id), {
        status: "ACCEPTED"
      });
    }
    // Navigate into the actual coding environment
    navigate(`/assessment/take/${assessment.id}?invite=${token}`);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="font-mono text-sm tracking-widest uppercase text-neutral-400">Verifying Secure Link...</p>
        </motion.div>
      </div>
    );
  }

  if (status === "expired" || status === "error") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center p-8 border border-white/10 rounded-3xl bg-white/[0.02]">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 border rounded-2xl bg-rose-500/10 border-rose-500/20">
            <AlertCircle className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white font-display">
            {status === "expired" ? "Invite Expired" : "Invalid Invite"}
          </h1>
          <p className="mb-8 text-sm text-neutral-400">{errorMsg}</p>
          <Link to="/dashboard" className="inline-block px-6 py-3 text-sm font-medium text-white transition-all border bg-white/10 border-white/10 rounded-xl hover:bg-white/20">
            Return to Dashboard
          </Link>
        </motion.div>
      </div>
    );
  }

  // Valid invite — show assessment details
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-lg">
        
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
            <Shield className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-white font-display">Technical Assessment</h1>
          <p className="text-sm text-neutral-400">You have been securely invited to complete the following test.</p>
        </div>

        {/* Assessment Card */}
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 mb-6 shadow-xl">
          <h2 className="mb-2 text-xl font-semibold text-white font-display">{assessment.title}</h2>
          {assessment.description && <p className="mb-6 text-sm leading-relaxed text-neutral-400">{assessment.description}</p>}

          <div className="flex flex-wrap gap-4 mb-6 font-mono text-xs font-bold tracking-wider text-neutral-500">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <Clock className="w-4 h-4 text-emerald-400" /> {assessment.duration} minutes
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <Code2 className="w-4 h-4 text-blue-400" /> {assessment.problems?.length || 0} problems
            </span>
          </div>

          {/* Problem List Preview */}
          {assessment.problems?.length > 0 && (
            <div className="pt-5 mt-2 border-t border-white/10">
              <h3 className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-3">Included Challenges</h3>
              <div className="flex flex-col gap-2">
                {assessment.problems.map((ap, idx) => (
                  <div key={ap.id || idx} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0a0a0a] border border-white/5">
                    <span className="font-mono text-xs font-bold text-neutral-600">#{idx + 1}</span>
                    <span className="text-sm font-medium text-neutral-300">{ap.title || "Problem " + (idx + 1)}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ml-auto ${ap.difficulty === "EASY" ? "text-emerald-400" : ap.difficulty === "HARD" ? "text-rose-400" : "text-amber-400"}`}>
                      {ap.difficulty || "MEDIUM"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rules */}
        <div className="p-5 mb-6 text-sm border rounded-2xl bg-amber-400/5 border-amber-400/20">
          <p className="flex items-center gap-2 mb-3 font-bold text-amber-400">
            <AlertCircle className="w-4 h-4" /> Before you start:
          </p>
          <ul className="space-y-2 text-xs font-medium list-disc list-inside text-amber-400/80">
            <li>The timer starts immediately after clicking "Start Assessment".</li>
            <li>You can switch between problems freely using the top navigator.</li>
            <li>Make sure to hit "Submit" on each solution before time runs out.</li>
            <li>Do not refresh the page during execution.</li>
          </ul>
        </div>

        {/* Start Button */}
        <button onClick={handleStart} className="group w-full py-4 bg-white text-black font-bold rounded-xl hover:scale-[1.02] transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
          Start Assessment <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </button>
      </motion.div>
    </div>
  );
}
