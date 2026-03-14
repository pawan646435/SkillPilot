// src/pages/Login.jsx
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Terminal, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { auth, googleProvider } from "../lib/firebase";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/dashboard"; // Grab the intent!

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(redirectUrl); 
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    try {
      await signInWithPopup(auth, provider);
      navigate(redirectUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#0a0a0a]">
      <div className="absolute top-[10%] left-[20%] w-96 h-96 bg-white/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[20%] w-96 h-96 bg-neutral-600/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="z-10 w-full max-w-md p-8 md:p-12">
        <div className="flex flex-col items-center mb-10 text-center">
          <Link to="/" className="mb-8">
            <div className="relative w-14 h-14 mb-4 flex items-center justify-center rounded-2xl bg-gradient-to-br from-neutral-800 to-black border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
              <Terminal className="z-10 w-7 h-7 text-white/90" strokeWidth={2.5} />
            </div>
          </Link>
          <h1 className="mb-2 text-3xl font-semibold text-white">Welcome back</h1>
          <p className="text-sm text-neutral-400">Enter your credentials to access your dashboard.</p>
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
            <Mail className="absolute w-5 h-5 transition-colors -translate-y-1/2 left-4 top-1/2 text-neutral-500 group-focus-within:text-white" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="w-full py-4 pl-12 pr-4 text-white transition-all border bg-white/5 border-white/10 rounded-xl focus:outline-none focus:border-white/30" />
          </div>
          <div className="relative group">
            <Lock className="absolute w-5 h-5 transition-colors -translate-y-1/2 left-4 top-1/2 text-neutral-500 group-focus-within:text-white" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full py-4 pl-12 pr-4 text-white transition-all border bg-white/5 border-white/10 rounded-xl focus:outline-none focus:border-white/30" />
          </div>

          <button type="submit" disabled={loading} className="flex items-center justify-center w-full gap-2 py-4 mt-2 font-semibold text-black transition-all bg-white rounded-xl hover:bg-neutral-200 disabled:opacity-70">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <p className="mt-8 text-sm text-center text-neutral-500">
          Don't have an account? <Link to={`/register?redirect=${encodeURIComponent(redirectUrl)}`} className="text-white hover:underline">Sign up</Link>
        </p>
      </motion.div>
    </div>
  );
}