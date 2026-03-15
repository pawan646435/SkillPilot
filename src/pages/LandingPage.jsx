// src/pages/LandingPage.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import gsap from "gsap";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

/* ── tiny helpers ── */
function TypeWriter({ text, speed = 40, delay = 0, className = "" }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  useEffect(() => {
    if (!started) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, speed);
    return () => clearInterval(iv);
  },[started, text, speed]);
  return <span className={className}>{displayed}<span className="animate-pulse">▊</span></span>;
}

function AsciiDivider() {
  return (
    <div className="text-[#00ff41]/30 text-[10px] leading-none select-none overflow-hidden whitespace-nowrap my-12">
      {"═".repeat(200)}
    </div>
  );
}

/* ── scanline overlay ── */
function Scanlines() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" style={{
      background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px)",
    }} />
  );
}

/* ── features ── */
const features =[
  { cmd: "clash --init", title: "Real-time 1v1 Battles", desc: "Challenge your friends or random opponents. First to solve the problem wins." },
  { cmd: "judge0 --exec", title: "Blazing-fast Execution", desc: "40+ languages supported. Zero latency compilation in the browser." },
  { cmd: "elo --calc", title: "Global Ranking System", desc: "Climb the leaderboard. Earn Elo points for every victory." },
  { cmd: "ai --analyze", title: "Post-match AI Review", desc: "Get instant feedback on your code's time and space complexity after the match." },
];

/* pre-compute random rain data outside render */
const rainColumns = Array.from({ length: 20 }, () => ({
  dur: 8 + Math.random() * 12,
  del: Math.random() * 5,
  bits: Array.from({ length: 80 }, () => Math.round(Math.random())).join("\n"),
}));

/* ── Catmull-Rom spline for buttery smooth curves ── */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleSpline(pts, t) {
  const n = pts.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const lt = t * n - i;
  return catmullRom(pts[Math.max(i - 1, 0)], pts[i], pts[Math.min(i + 1, n)], pts[Math.min(i + 2, n)], lt);
}

/* ── Sound synthesis (single AudioContext, reused) ── */
let _exitAudioCtx = null;
function getExitAudioCtx() {
  if (!_exitAudioCtx) { try { _exitAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
  return _exitAudioCtx;
}

function playExitBeep() {
  const ctx = getExitAudioCtx(); if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine"; osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.05, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.15);
}

function playExitWhoosh() {
  const ctx = getExitAudioCtx(); if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(500, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.6);
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(1800, ctx.currentTime);
  filt.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
  osc.connect(filt).connect(gain).connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.7);
}

function playExitBoom() {
  const ctx = getExitAudioCtx(); if (!ctx) return;
  const bufSize = ctx.sampleRate * 0.35;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.12));
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.1, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 350;
  src.connect(f).connect(g).connect(ctx.destination); src.start();
  const sub = ctx.createOscillator(); sub.type = "sine";
  sub.frequency.setValueAtTime(50, ctx.currentTime);
  sub.frequency.exponentialRampToValueAtTime(15, ctx.currentTime + 0.6);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.18, ctx.currentTime);
  sg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  sub.connect(sg).connect(ctx.destination); sub.start(); sub.stop(ctx.currentTime + 0.6);
}

export default function LandingPage() {
  const[bootDone, setBoot] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();
  const exitBtnRef = useRef(null);
  const[exitOrigin, setExitOrigin] = useState({ x: 0, y: 0 });

  useEffect(() => { const t = setTimeout(() => setBoot(true), 1800); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsub();
  }, []);

  const [exitCountNum, setExitCountNum] = useState(null);

  const handleExit = useCallback(() => {
    if (exiting) return;
    if (exitBtnRef.current) {
      const r = exitBtnRef.current.getBoundingClientRect();
      setExitOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    // Countdown 3→2→1 with beep sounds
    setExitCountNum(3); playExitBeep();
    setTimeout(() => { setExitCountNum(2); playExitBeep(); }, 400);
    setTimeout(() => { setExitCountNum(1); playExitBeep(); }, 800);
    // Launch sphere
    setTimeout(() => { setExitCountNum(null); setExiting(true); playExitWhoosh(); }, 1200);
    // Navigate after detonation + fill
    setTimeout(() => navigate(currentUser ? "/" : "/login"), 3800);
  }, [exiting, navigate, currentUser]);

  return (
    <div className="font-mono relative min-h-screen text-[#00ff41] selection:bg-[#00ff41] selection:text-black"
      style={{ background: "#050505" }}>
      <Scanlines />

      {/* ─── HERO ─── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-24 pb-12">
        {/* floating binary rain — purely decorative */}
        <div className="absolute inset-0 overflow-hidden opacity-[0.04] select-none pointer-events-none">
          {rainColumns.map((col, i) => (
            <motion.div key={i}
              className="absolute text-[10px] leading-tight whitespace-pre"
              style={{ left: `${i * 5}%`, top: "-100%" }}
              animate={{ y:["0vh", "200vh"] }}
              transition={{ duration: col.dur, repeat: Infinity, delay: col.del, ease: "linear" }}
            >
              {col.bits}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full max-w-4xl"
        >
          {/* terminal chrome */}
          <div className="rounded-xl border border-[#00ff41]/20 overflow-hidden shadow-[0_0_80px_rgba(0,255,65,0.08)]">
            {/* title bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#00ff41]/5 border-b border-[#00ff41]/10">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-4 text-[11px] text-[#00ff41]/40 tracking-widest uppercase">skillpilot@main ~ zsh</span>
            </div>

            {/* terminal body */}
            <div className="px-6 py-8 space-y-4 text-sm md:px-10 md:py-12 md:text-base">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <span className="text-[#00ff41]/50">guest@skillpilot:~$</span>{" "}
                <TypeWriter text="cat welcome.txt" speed={60} delay={400} />
              </motion.div>

              {bootDone && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 space-y-6">
                  <pre className="text-[#00ff41] text-xs sm:text-sm md:text-base leading-tight whitespace-pre select-none" style={{ textShadow: "0 0 10px rgba(0,255,65,0.4)" }}>{`
  ███████╗██╗  ██╗██╗██╗     ██╗     
  ██╔════╝██║ ██╔╝██║██║     ██║     
  ███████╗█████╔╝ ██║██║     ██║     
  ╚════██║██╔═██╗ ██║██║     ██║     
  ███████║██║  ██╗██║███████╗███████╗
  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝
        ██████╗ ██╗██╗      ██████╗ ████████╗
        ██╔══██╗██║██║     ██╔═══██╗╚══██╔══╝
        ██████╔╝██║██║     ██║   ██║   ██║   
        ██╔═══╝ ██║██║     ██║   ██║   ██║   
        ██║     ██║███████╗╚██████╔╝   ██║   
        ╚═╝     ╚═╝╚══════╝ ╚═════╝    ╚═╝   `}</pre>

                  <p className="text-[#00ff41]/70 max-w-2xl leading-relaxed text-sm md:text-base">
                    {">"} Real-time competitive coding arena.<br/>
                    {">"} Challenge opponents, climb the global leaderboard.<br/>
                    {">"} Prove your skills. May the best coder win.
                  </p>

                  <div className="pt-4">
                    <span className="text-[#00ff41]/50">guest@skillpilot:~$</span>{" "}
                    <TypeWriter text="./start_clash --mode=ranked" speed={50} delay={2400} />
                  </div>

                  <Link to={currentUser ? "/" : "/login"}>
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 4.5 }}
                      className="mt-6 px-6 py-3 border border-[#00ff41]/40 text-[#00ff41] rounded-lg font-bold tracking-wider text-sm hover:bg-[#00ff41] hover:text-black transition-all duration-300 shadow-[0_0_20px_rgba(0,255,65,0.15)]"
                      style={{ textShadow: "0 0 10px rgba(0,255,65,0.5)" }}
                    >
                      {currentUser ? "[ RETURN HOME ]" : "[ INITIALIZE SESSION ]"}
                    </motion.button>
                  </Link>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </section>

      <AsciiDivider />

      {/* ─── FEATURES ─── */}
      <section className="relative z-10 max-w-5xl px-6 pb-24 mx-auto">
        <motion.h2
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-2xl font-bold tracking-tight md:text-4xl"
          style={{ textShadow: "0 0 20px rgba(0,255,65,0.3)" }}
        >
          $ ls ./capabilities/
        </motion.h2>

        <div className="grid gap-6 md:grid-cols-2">
          {features.map((f, i) => (
            <motion.div
              key={f.cmd}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
              className="group rounded-xl border border-[#00ff41]/10 p-6 hover:border-[#00ff41]/30 transition-colors duration-300"
              style={{ background: "rgba(0,255,65,0.02)" }}
            >
              <div className="text-xs text-[#00ff41]/40 mb-3 tracking-widest">
                guest@skillpilot:~$ <span className="text-[#00ff41]/70">{f.cmd}</span>
              </div>
              <h3 className="text-lg font-bold mb-2 group-hover:text-shadow-[0_0_10px_rgba(0,255,65,0.5)] transition-all">
                {f.title}
              </h3>
              <p className="text-[#00ff41]/50 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <AsciiDivider />

      {/* ─── CTA ─── */}
      <section className="relative z-10 max-w-4xl px-6 py-24 mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="rounded-xl border border-[#00ff41]/20 p-10 md:p-16" style={{ background: "rgba(0,255,65,0.015)" }}>
            <h2 className="mb-6 text-3xl font-extrabold tracking-tighter md:text-5xl" style={{ textShadow: "0 0 30px rgba(0,255,65,0.3)" }}>
              sudo clash --start
            </h2>
            <p className="text-[#00ff41]/60 text-sm md:text-base max-w-xl mx-auto mb-10 leading-relaxed">
              Enter the arena and test your limits. Compete against developers worldwide and prove you have what it takes.
            </p>
            <Link to="/clash" className="inline-block px-8 py-4 bg-[#00ff41] text-black rounded-lg font-extrabold tracking-wider text-sm hover:shadow-[0_0_40px_rgba(0,255,65,0.5)] transition-shadow duration-300">
              ENTER ARENA →
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="relative z-10 border-t border-[#00ff41]/10 py-8 px-6 text-center text-[11px] text-[#00ff41]/25 tracking-widest">
        © 2026 SKILLPILOT — CODE CLASH — BUILT BY PAWAN KUMAR
      </footer>

      {/* ─── EXIT CODE CLASH ─── */}
      <motion.button
        ref={exitBtnRef}
        onClick={handleExit}
        disabled={exitCountNum !== null || exiting}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#00ff41]/20 bg-[#050505]/90 backdrop-blur-xl text-xs font-bold tracking-wider text-[#00ff41]/70 hover:text-[#00ff41] hover:border-[#00ff41]/40 transition-all duration-300"
      >
        <AnimatePresence mode="wait" initial={false}>
          {exitCountNum !== null ? (
            <motion.span key={`ec-${exitCountNum}`}
              initial={{ opacity: 0, scale: 2.2 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-[#00ff41] font-black text-base min-w-[16px] text-center"
            >{exitCountNum}</motion.span>
          ) : (
            <motion.span key="ea" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease:[0.22, 1, 0.36, 1] }}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          {exitCountNum !== null ? (
            <motion.span key="ecl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease:[0.22, 1, 0.36, 1] }} className="text-[#00ff41]/70 tracking-wider">{currentUser ? "RETURNING HOME..." : "ACCESSING LOGIN..."}</motion.span>
          ) : (
            <motion.span key="etxt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>{currentUser ? "GO TO HOME" : "LOGIN / REGISTER"}</motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ─── Sphere exit animation ─── */}
      <AnimatePresence>
        {exiting && (
          <ExitSphere origin={exitOrigin} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Exit Sphere — GSAP-driven smooth spline path
   with motion-blur afterimages, trail particles,
   screen shake, CRT scanline, and dark circle fill.
   ────────────────────────────────────────────────── */

const SPHERE_TRAIL_COUNT = 50;
const sphereTrailSeeds = Array.from({ length: SPHERE_TRAIL_COUNT }, () => ({
  ox: (Math.random() - 0.5) * 16,
  oy: (Math.random() - 0.5) * 16,
  size: 2 + Math.random() * 4,
  dur: 0.4 + Math.random() * 0.35,
  shade: Math.floor(170 + Math.random() * 80),
}));

function ExitSphere({ origin }) {
  const W = typeof window !== "undefined" ? window.innerWidth : 1440;
  const H = typeof window !== "undefined" ? window.innerHeight : 900;
  const sx = origin.x;
  const sy = origin.y;

  /* Spline control points – reverse S-curve */
  const pathX = useMemo(() =>[sx, sx - W * 0.16, W * 0.14, W * 0.36, W * 0.76, W * 0.5], [sx, W]);
  const pathY = useMemo(() =>[sy, sy - H * 0.32, H * 0.1, H * 0.05, H * 0.22, H * 0.42], [sy, H]);
  const pathScale = useMemo(() =>[0.3, 1.2, 1.5, 1.4, 1.0, 2.5],[]);
  const pathRotate = useMemo(() =>[0, 40, 90, 180, 270, 360],[]);

  const sphereRef = useRef(null);
  const ghost1Ref = useRef(null);
  const ghost2Ref = useRef(null);
  const ghost3Ref = useRef(null);
  const circleRef = useRef(null);
  const glowRef = useRef(null);
  const scanRef = useRef(null);
  const textRef = useRef(null);

  const [trail, setTrail] = useState([]);
  const idRef = useRef(0);
  const[detonated, setDetonated] = useState(false);

  const flightDur = 1.5;

  /* GSAP master timeline for flight */
  useEffect(() => {
    const ghosts =[ghost1Ref, ghost2Ref, ghost3Ref];
    const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });

    const progress = { t: 0 };
    tl.to(progress, {
      t: 1,
      duration: flightDur,
      ease: "power2.inOut",
      onUpdate: () => {
        const t = progress.t;
        const x = sampleSpline(pathX, t);
        const y = sampleSpline(pathY, t);
        const sc = sampleSpline(pathScale, t);
        const rot = sampleSpline(pathRotate, t);
        const opacity = t > 0.92 ? Math.max(0, 1 - (t - 0.92) / 0.08) : 1;

        if (sphereRef.current) {
          gsap.set(sphereRef.current, { x, y, scale: sc, rotation: rot, opacity });
        }
        ghosts.forEach((ref, gi) => {
          const dt = (gi + 1) * 0.04;
          const gt = Math.max(0, t - dt);
          const gx = sampleSpline(pathX, gt);
          const gy = sampleSpline(pathY, gt);
          const gs = sampleSpline(pathScale, gt) * (0.68 - gi * 0.12);
          const gr = sampleSpline(pathRotate, gt);
          const go = Math.max(0, (0.28 - gi * 0.07) * (t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1));
          if (ref.current) gsap.set(ref.current, { x: gx, y: gy, scale: gs, rotation: gr, opacity: go });
        });
      },
      onComplete: () => setDetonated(true),
    }, 0);

    // Spawn trail particles
    const total = 1500;
    const steps = SPHERE_TRAIL_COUNT;
    const dtMs = total / steps;
    const timers =[];
    for (let s = 0; s < steps; s++) {
      timers.push(setTimeout(() => {
        const t = s / steps;
        const px = sampleSpline(pathX, t);
        const py = sampleSpline(pathY, t);
        const seed = sphereTrailSeeds[s];
        setTrail(prev =>[...prev, { id: idRef.current++, x: px + seed.ox, y: py + seed.oy, size: seed.size, shade: seed.shade, dur: seed.dur }]);
      }, s * dtMs));
    }

    return () => { tl.kill(); timers.forEach(clearTimeout); };
  },[pathX, pathY, pathScale, pathRotate, flightDur]);

  /* Detonation: screen shake + dark circle + scanline */
  useEffect(() => {
    if (!detonated) return;
    playExitBoom();
    // Screen shake via GSAP
    gsap.fromTo(document.documentElement,
      { x: 0, y: 0 },
      { x: "random(-4, 4)", y: "random(-3, 3)", duration: 0.05, repeat: 5, yoyo: true, ease: "power1.inOut",
        onComplete: () => gsap.set(document.documentElement, { clearProps: "transform" }) }
    );
    if (circleRef.current) gsap.fromTo(circleRef.current, { scale: 0, opacity: 0 }, { scale: 50, opacity: 1, duration: 1.0, ease: "power3.out" });
    if (glowRef.current) gsap.fromTo(glowRef.current, { scale: 0, opacity: 0 }, { scale: 15, opacity: 0, duration: 1.2, ease: "power2.out", keyframes: { opacity: [0, 0.7, 0], scale: [0, 4, 15] } });
    if (scanRef.current) gsap.fromTo(scanRef.current, { top: "-2%", opacity: 0 }, { top: "105%", opacity: 1, duration: 0.8, ease: "power1.inOut", keyframes: { opacity:[0, 1, 0.5, 0.2] } });
    if (textRef.current) gsap.fromTo(textRef.current, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.5, ease: "power2.out" });

    return () => {
      gsap.set(document.documentElement, { clearProps: "transform" });
    };
  }, [detonated]);

  return (
    <motion.div className="fixed inset-0 z-[999] pointer-events-none"
      style={{ willChange: "opacity" }}
      initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>

      {/* Trail dots — grayscale */}
      {trail.map(p => (
        <motion.div key={p.id} className="absolute rounded-full"
          style={{
            left: p.x, top: p.y, width: p.size, height: p.size,
            background: `rgb(${p.shade},${p.shade},${p.shade})`,
            boxShadow: `0 0 ${p.size * 3}px rgba(${p.shade},${p.shade},${p.shade},0.6)`,
            willChange: "transform, opacity",
          }}
          initial={{ opacity: 0.85, scale: 1 }}
          animate={{ opacity: 0, scale: 0 }}
          transition={{ duration: p.dur, ease:[0.22, 1, 0.36, 1] }}
        />
      ))}

      {/* Smoky trail (every 3rd) */}
      {trail.filter((_, i) => i % 3 === 0).map(p => (
        <motion.div key={`sm-${p.id}`} className="absolute rounded-full"
          style={{
            left: p.x - 10, top: p.y - 10, width: 22, height: 22,
            background: "radial-gradient(circle, rgba(200,200,200,0.12), transparent 70%)",
            willChange: "transform, opacity",
          }}
          initial={{ opacity: 0.4, scale: 0.3 }}
          animate={{ opacity: 0, scale: 2.5 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}

      {/* Afterimage ghost spheres (GSAP-driven) */}
      {[ghost1Ref, ghost2Ref, ghost3Ref].map((ref, i) => (
        <div key={`sghost-${i}`} ref={ref}
          className="absolute"
          style={{ left: 0, top: 0, opacity: 0, willChange: "transform, opacity" }}
        >
          <div className="w-10 h-10 rounded-full" style={{
            background: "radial-gradient(circle at 35% 35%, #ffffff, #888 50%, #333)",
            filter: `blur(${2 + i * 2.5}px)`,
            boxShadow: `0 0 ${10 + i * 6}px rgba(255,255,255,0.25)`,
          }} />
        </div>
      ))}

      {/* The Sphere (GSAP-driven) */}
      <div ref={sphereRef} className="absolute"
        style={{
          left: 0, top: 0, willChange: "transform, opacity",
          transform: `translate3d(${sx}px, ${sy}px, 0) scale(0.3)`,
        }}
      >
        <div className="relative w-10 h-10 rounded-full" style={{
          background: "radial-gradient(circle at 35% 35%, #ffffff, #c0c0c0 30%, #555555 70%, #1a1a1a)",
          boxShadow: "0 0 20px rgba(255,255,255,0.5), 0 0 50px rgba(200,200,200,0.3), inset 0 0 10px rgba(255,255,255,0.3)",
        }}>
          <div className="absolute top-1 left-2 w-3 h-2 rounded-full bg-white/60 blur-[1px]" />
        </div>
      </div>

      {/* Solid dark circle fill (GSAP-driven) */}
      <div ref={circleRef} className="absolute rounded-full"
        style={{
          left: W * 0.5 - 40, top: H * 0.42 - 40, width: 80, height: 80,
          background: "#0a0a0a",
          boxShadow: "0 0 60px rgba(200,200,200,0.15), 0 0 120px rgba(100,100,100,0.08)",
          opacity: 0, transform: "scale(0)", willChange: "transform, opacity",
        }}
      />

      {/* White glow pulse (GSAP-driven) */}
      <div ref={glowRef} className="absolute rounded-full"
        style={{
          left: W * 0.5 - 25, top: H * 0.42 - 25, width: 50, height: 50,
          background: "radial-gradient(circle, rgba(255,255,255,0.35), rgba(180,180,180,0.08) 60%, transparent 80%)",
          opacity: 0, transform: "scale(0)", willChange: "transform, opacity",
        }}
      />

      {/* CRT scanline sweep (GSAP-driven) */}
      <div ref={scanRef} className="absolute left-0 right-0 z-20 pointer-events-none"
        style={{
          height: 4, top: "-2%", opacity: 0,
          background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.3), rgba(255,255,255,0.5), rgba(255,255,255,0.3), transparent)",
          boxShadow: "0 0 20px rgba(255,255,255,0.25), 0 0 40px rgba(200,200,200,0.15)",
          willChange: "transform, opacity",
        }}
      />

      {/* Text */}
      <div ref={textRef} className="absolute inset-0 z-10 flex items-center justify-center"
        style={{ opacity: 0, willChange: "opacity" }}
      >
        <span className="text-white/60 text-sm tracking-[0.3em] font-mono animate-pulse">
          SYSTEM OVERRIDE...
        </span>
      </div>
    </motion.div>
  );
}