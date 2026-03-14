// src/pages/Home.jsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Terminal, Cpu, Crosshair, Trophy, Code2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function Home() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let unsubscribe = () => {};
    let isMounted = true;

    const initAuthListener = async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([
          import("../lib/firebase"),
          import("firebase/auth"),
        ]);

        if (!isMounted) return;

        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser);
        });
      } catch {
        setUser(null);
      }
    };

    initAuthListener();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <main className="w-full min-h-screen overflow-hidden">
      
      {/* ─── ANIMATED HERO ─── */}
      <section className="relative flex flex-col items-center px-6 pt-32 pb-20 mx-auto text-center md:pt-48 md:pb-32 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-emerald-400 mb-8"
        >
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-emerald-400"></span>
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500"></span>
          </span>
          SkillPilot v2.0 is now live
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-4xl mb-6 text-5xl font-bold tracking-tighter text-transparent md:text-7xl lg:text-8xl font-display bg-clip-text bg-gradient-to-b from-white to-neutral-500"
        >
          Master Algorithms.<br />Dominate the Arena.
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-2xl mb-10 text-lg leading-relaxed md:text-xl text-neutral-400"
        >
          The ultimate platform to ace AI-driven technical interviews, climb the global ranking system, and crush your friends in real-time coding battles.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col items-center gap-4 sm:flex-row"
        >
          {user ? (
            <Link to="/dashboard" className="group flex items-center justify-center gap-2 px-8 py-4 bg-white text-black rounded-xl font-semibold hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              Go to Dashboard
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          ) : (
            <Link to="/register" className="group flex items-center justify-center gap-2 px-8 py-4 bg-white text-black rounded-xl font-semibold hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              Start Coding Free
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          )}
          <Link to="/terminal" className="flex items-center justify-center gap-2 px-8 py-4 font-semibold text-white transition-all border bg-white/5 border-white/10 rounded-xl hover:bg-white/10">
            <Terminal className="w-4 h-4" /> Code-clash
          </Link>
        </motion.div>
      </section>

      {/* ─── BENTO FEATURES ─── */}
      <section id="features" className="px-6 py-24 mx-auto max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
          
          {/* Feature 1 (Large) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="md:col-span-2 p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 blur-[100px] rounded-full group-hover:bg-emerald-500/20 transition-colors" />
            <Cpu className="w-10 h-10 mb-6 text-emerald-400" />
            <h3 className="mb-3 text-3xl font-bold text-white font-display">AI Technical Interviewer</h3>
            <p className="max-w-md text-lg text-neutral-400">Practice with our advanced AI that talks, listens, and evaluates your code just like a FAANG engineer.</p>
          </motion.div>

          {/* Feature 2 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors relative overflow-hidden"
          >
            <Crosshair className="w-10 h-10 mb-6 text-rose-400" />
            <h3 className="mb-3 text-2xl font-bold text-white font-display">1v1 Code Clash</h3>
            <p className="text-neutral-400">Battle friends or random opponents in real-time. First to compile passing tests wins.</p>
          </motion.div>

          {/* Feature 3 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors relative overflow-hidden"
          >
            <Trophy className="w-10 h-10 mb-6 text-amber-400" />
            <h3 className="mb-3 text-2xl font-bold text-white font-display">Global Elo System</h3>
            <p className="text-neutral-400">Climb the ranks from Bronze to Grandmaster by dominating the Arena.</p>
          </motion.div>

          {/* Feature 4 (Large) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}
            className="md:col-span-2 p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors relative overflow-hidden group"
          >
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full group-hover:bg-blue-500/20 transition-colors" />
            <Code2 className="w-10 h-10 mb-6 text-blue-400" />
            <h3 className="mb-3 text-3xl font-bold text-white font-display">40+ Languages Supported</h3>
            <p className="max-w-md text-lg text-neutral-400">Blazing fast, zero-latency execution directly in your browser. Python, Rust, C++, JS, and more.</p>
          </motion.div>

        </div>
      </section>

      {/* ─── CTA FOOTER ─── */}
      <section className="relative px-6 py-32 border-t border-white/5">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-emerald-950/20" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="mb-8 text-4xl font-bold text-white md:text-6xl font-display">Ready to prove your skills?</h2>
          <p className="max-w-2xl mx-auto mb-10 text-xl text-neutral-400">
            Join thousands of developers worldwide. Start practicing, start competing, start winning.
          </p>
          {user ? (
            <Link to="/dashboard" className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-emerald-500 text-black rounded-xl font-bold text-lg hover:scale-105 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-all">
              <Terminal className="w-5 h-5" />
              Go to Dashboard
            </Link>
          ) : (
            <Link to="/register" className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-emerald-500 text-black rounded-xl font-bold text-lg hover:scale-105 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-all">
              <Terminal className="w-5 h-5" />
              Create Free Account
            </Link>
          )}
        </div>
      </section>
      
    </main>
  );
}
