// src/pages/dashboard/Settings.jsx
import { motion } from "framer-motion";
import { User, Mail, Shield, LogOut, Sparkles, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";

export default function Settings() {
  const navigate = useNavigate();
  const[user, setUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        setUser({ ...currentUser, ...userDoc.data() });
      }
    };
    fetchUser();
  },[]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const isOAuth = user?.providerData?.some((p) => p.providerId === "google.com" || p.providerId === "github.com");

  return (
    <div className="flex flex-col w-full max-w-2xl gap-8 mx-auto">
      <div>
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white font-display">Settings</h1>
        <p className="text-sm text-neutral-400">Manage system preferences and authentications.</p>
      </div>

      {/* AI Configuration */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 rounded-2xl bg-surface border border-white/[0.05] shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 opacity-50 bg-gradient-to-r from-emerald-500 to-blue-500" />
        <h2 className="flex items-center gap-2 mb-4 text-sm font-bold tracking-widest uppercase text-neutral-400">
          <Sparkles className="w-4 h-4 text-emerald-400" /> AI Interviewer Engine
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-neutral-300">
          The AI interviewer uses Google Gemini to conduct technical interviews. Currently, it runs on the platform's global API key. No configuration is required.
        </p>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 transition-all">
          Manage API Keys <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </motion.div>

      {/* Security */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-8 rounded-2xl bg-surface border border-white/[0.05] shadow-xl">
        <h2 className="flex items-center gap-2 mb-6 text-sm font-bold tracking-widest uppercase text-neutral-400">
          <Shield className="w-4 h-4 text-blue-400" /> Security & Access
        </h2>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-[#0a0a0a] border border-white/5">
            <div>
              <p className="mb-1 text-sm font-bold text-white">Authentication Method</p>
              <p className="font-mono text-xs text-neutral-500">
                {isOAuth ? "Logged in via External Provider (Google/GitHub)" : "Standard Email & Password"}
              </p>
            </div>
            <div className="flex items-center justify-center w-8 h-8 border rounded-full bg-emerald-500/10 border-emerald-500/20">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-[#0a0a0a] border border-white/5">
            <div>
              <p className="mb-1 text-sm font-bold text-white">Active Session</p>
              <p className="font-mono text-xs text-neutral-500">Managed securely by Firebase Auth</p>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider uppercase transition-all border rounded-lg bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20">
              <LogOut className="w-3.5 h-3.5" /> Terminate Session
            </button>
          </div>
        </div>
      </motion.div>

      <div className="text-center text-[10px] font-mono text-neutral-600 uppercase tracking-widest pb-12">
        Account UID: {user?.uid}
      </div>
    </div>
  );
}
