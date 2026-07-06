// src/pages/Register.jsx
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Terminal, Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { auth, db, googleProvider } from "../lib/firebase";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/dashboard";

  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const[error, setError] = useState(null);

  const handleChange = (e) => setFormData({ ...formData,[e.target.name]: e.target.value });

  const saveUserToDB = async (user, name) => {
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: name || user.displayName || "User",
      email: user.email,
      role: "USER",
      createdAt: serverTimestamp()
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      await saveUserToDB(userCredential.user, formData.name);
      navigate(redirectUrl); 
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    try {
      const result = await signInWithPopup(auth, provider);
      await saveUserToDB(result.user, result.user.displayName);
      navigate(redirectUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#0a0a0a]">
      <div className="absolute top-[10%] right-[20%] w-96 h-96 bg-white/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] left-[20%] w-96 h-96 bg-neutral-600/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="z-10 w-full max-w-md p-8 md:p-12">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="relative w-14 h-14 mb-4 flex items-center justify-center rounded-2xl bg-gradient-to-br from-neutral-800 to-black border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
            <Terminal className="w-7 h-7 text-white/90" strokeWidth={2.5} />
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-white">Create an account</h1>
          <p className="text-sm text-neutral-400">Start automating your technical interviews.</p>
        </div>

        {error && <div className="p-4 mb-6 text-sm text-center text-red-500 border bg-red-500/10 border-red-500/50 rounded-xl">{error}</div>}

        <div className="flex flex-col gap-3 mb-6">
          <button onClick={() => handleOAuth(googleProvider)} className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-xl py-3.5 text-white hover:bg-white/10 transition-all font-medium text-sm">
            Continue with Google
          </button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs tracking-widest uppercase text-neutral-500">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="relative group">
            <User className="absolute w-5 h-5 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
            <input type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="Full Name" className="w-full py-4 pl-12 pr-4 text-white transition-all border bg-white/5 border-white/10 rounded-xl focus:outline-none focus:border-white/30" />
          </div>
          <div className="relative group">
            <Mail className="absolute w-5 h-5 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
            <input type="email" name="email" required value={formData.email} onChange={handleChange} placeholder="Email" className="w-full py-4 pl-12 pr-4 text-white transition-all border bg-white/5 border-white/10 rounded-xl focus:outline-none focus:border-white/30" />
          </div>
          <div className="relative group">
            <Lock className="absolute w-5 h-5 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
            <input type="password" name="password" required value={formData.password} onChange={handleChange} placeholder="Password (Min 6 chars)" className="w-full py-4 pl-12 pr-4 text-white transition-all border bg-white/5 border-white/10 rounded-xl focus:outline-none focus:border-white/30" />
          </div>

          <button type="submit" disabled={loading} className="flex items-center justify-center w-full gap-2 py-4 mt-4 font-semibold text-black transition-all bg-white rounded-xl hover:bg-neutral-200 disabled:opacity-70">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Get Started</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <p className="mt-8 text-sm text-center text-neutral-500">
          Already have an account? <Link to={`/login?redirect=${encodeURIComponent(redirectUrl)}`} className="text-white hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
