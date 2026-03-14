// src/pages/Clash.jsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Users, Play, Copy, CheckCircle2, Code2, AlertTriangle, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const TerminalText = ({ text, delay = 0 }) => {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    setTimeout(() => {
      const interval = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length) clearInterval(interval);
      }, 30);
      return () => clearInterval(interval);
    }, delay);
  }, [text, delay]);
  return <span>{displayed}</span>;
};

export default function Clash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomFromUrl = searchParams.get("room");

  const [view, setView] = useState("BOOT"); 
  const [roomId, setRoomId] = useState(roomFromUrl || "");
  const [roomData, setRoomData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [myCode, setMyCode] = useState("// Awaiting input...\n");
  const [opponentCode, setOpponentCode] = useState("// Intercepting opponent uplink...\n");
  const [playerRole, setPlayerRole] = useState(null);

  // ─── 1. BOOT SEQUENCE & AUTH CHECK ───
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is logged in, proceed with boot sequence
        setTimeout(() => {
          if (roomFromUrl) {
            handleJoinRoom(roomFromUrl, user);
          } else {
            setView("LOBBY");
          }
        }, 3500);
      } else {
        // User not logged in, redirect to login but save the destination!
        if (roomFromUrl) {
          navigate(`/login?redirect=${encodeURIComponent('/clash?room=' + roomFromUrl)}`);
        } else {
          navigate("/login");
        }
      }
    });

    return () => unsubscribe();
  }, [navigate, roomFromUrl]);

  // ─── 2. CREATE A BATTLE ROOM ───
  const handleCreateRoom = async () => {
    const user = auth.currentUser;
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const roomRef = doc(db, "battles", newRoomId);
    
    await setDoc(roomRef, {
      status: "WAITING",
      player1: { uid: user.uid, name: user.displayName || "Hacker 1", code: "// Ready\n" },
      player2: null,
    });

    setRoomId(newRoomId);
    setPlayerRole("player1");
    setView("WAITING");
    listenToRoom(newRoomId, "player1");
  };

  // ─── 3. JOIN A BATTLE ROOM ───
  const handleJoinRoom = async (idToJoin, user) => {
    const roomRef = doc(db, "battles", idToJoin);
    const roomSnap = await getDoc(roomRef);

    if (roomSnap.exists()) {
      const data = roomSnap.data();
      if (data.status === "WAITING" && data.player1.uid !== user.uid) {
        await updateDoc(roomRef, {
          status: "BATTLE",
          player2: { uid: user.uid, name: user.displayName || "Hacker 2", code: "// Ready\n" }
        });
        setRoomId(idToJoin);
        setPlayerRole("player2");
        setView("BATTLE");
        listenToRoom(idToJoin, "player2");
      } else if (data.player1.uid === user.uid) {
        setRoomId(idToJoin);
        setPlayerRole("player1");
        setView(data.status === "BATTLE" ? "BATTLE" : "WAITING");
        listenToRoom(idToJoin, "player1");
      }
    } else {
      alert("Room not found or expired.");
      setView("LOBBY");
    }
  };

  // ─── 4. REAL-TIME SYNC ───
  const listenToRoom = (id, role) => {
    const roomRef = doc(db, "battles", id);
    onSnapshot(roomRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      setRoomData(data);
      
      if (data.status === "BATTLE" && view !== "BATTLE") {
        setView("BATTLE");
      }

      if (role === "player1" && data.player2) {
        setOpponentCode(data.player2.code);
      } else if (role === "player2" && data.player1) {
        setOpponentCode(data.player1.code);
      }
    });
  };

  const handleCodeChange = async (newCode) => {
    setMyCode(newCode);
    if (roomId && playerRole) {
      const roomRef = doc(db, "battles", roomId);
      await updateDoc(roomRef, { [`${playerRole}.code`]: newCode });
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/clash?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff41] font-mono selection:bg-[#00ff41] selection:text-black relative overflow-hidden">
      <div className="fixed inset-0 z-50 opacity-50 pointer-events-none mix-blend-overlay" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.1) 2px, rgba(0,255,65,0.1) 4px)" }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#050505] to-[#050505] pointer-events-none" />

      <AnimatePresence mode="wait">
        
        {/* BOOT SEQUENCE */}
        {view === "BOOT" && (
          <motion.div key="boot" exit={{ opacity: 0, scale: 1.1 }} className="relative z-10 flex flex-col justify-end h-screen p-12 text-sm md:text-lg">
            <div className="max-w-2xl space-y-2 text-[#00ff41]/80 shadow-[0_0_10px_rgba(0,255,65,0.5)]">
              <p><TerminalText text="> INITIATING PROTOCOL: CLASH_ARENA.EXE" delay={0} /></p>
              <p><TerminalText text="> BYPASSING MAINFRAME SECURITY... [OK]" delay={800} /></p>
              <p><TerminalText text="> ESTABLISHING P2P NEURAL LINK...[OK]" delay={1600} /></p>
              <p><TerminalText text="> DECRYPTING ARENA PROTOCOLS...   [OK]" delay={2200} /></p>
              <p className="text-[#00ff41] font-bold mt-4 animate-pulse"><TerminalText text="> ACCESS GRANTED. ENTERING ARENA..." delay={2800} /></p>
            </div>
          </motion.div>
        )}

        {/* LOBBY */}
        {view === "LOBBY" && (
          <motion.div key="lobby" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex items-center justify-center h-screen">
            <div className="w-full max-w-md p-8 border border-[#00ff41]/30 rounded-xl bg-black/50 backdrop-blur-md shadow-[0_0_40px_rgba(0,255,65,0.1)]">
              <div className="flex justify-center mb-6">
                <Code2 className="w-12 h-12 animate-pulse drop-shadow-[0_0_15px_rgba(0,255,65,0.8)]" />
              </div>
              <h2 className="text-3xl font-bold text-center mb-8 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(0,255,65,0.8)]">Arena Terminal</h2>
              <div className="space-y-6">
                <button onClick={handleCreateRoom} className="w-full py-4 border border-[#00ff41] bg-[#00ff41]/10 hover:bg-[#00ff41] hover:text-black transition-all font-bold tracking-widest flex items-center justify-center gap-3 group shadow-[0_0_15px_rgba(0,255,65,0.2)]">
                  <Terminal className="w-5 h-5" />
                  [ GENERATE NEW BATTLE ]
                </button>
                <div className="flex items-center gap-4 opacity-50">
                  <div className="flex-1 h-px bg-[#00ff41]/50" />
                  <span className="text-xs tracking-widest uppercase">or</span>
                  <div className="flex-1 h-px bg-[#00ff41]/50" />
                </div>
                <div className="flex gap-2">
                  <input type="text" value={roomId} onChange={(e) => setRoomId(e.target.value.toUpperCase())} placeholder="ENTER ROOM ID" className="flex-1 bg-black border border-[#00ff41]/30 px-4 py-3 text-[#00ff41] placeholder:text-[#00ff41]/30 focus:outline-none focus:border-[#00ff41] focus:shadow-[0_0_15px_rgba(0,255,65,0.3)] transition-all uppercase tracking-widest" />
                  <button onClick={() => handleJoinRoom(roomId, auth.currentUser)} disabled={!roomId} className="px-6 border border-[#00ff41]/30 hover:bg-[#00ff41]/20 disabled:opacity-50 transition-all font-bold tracking-widest">JOIN</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* WAITING ROOM */}
        {view === "WAITING" && (
          <motion.div key="waiting" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 flex items-center justify-center h-screen">
            <div className="w-full max-w-lg text-center">
              <Users className="w-16 h-16 mx-auto mb-6 opacity-80 animate-pulse" />
              <h2 className="mb-4 text-2xl font-bold tracking-widest uppercase">Awaiting Opponent Uplink...</h2>
              <p className="text-[#00ff41]/60 mb-8">Transmit this frequency to your challenger:</p>
              <div className="flex items-center gap-0 border border-[#00ff41]/40 bg-black/50 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(0,255,65,0.15)] mb-8">
                <div className="flex-1 px-4 py-4 text-xl tracking-[0.3em] font-bold border-r border-[#00ff41]/40 bg-[#00ff41]/5">{roomId}</div>
                <button onClick={copyInviteLink} className="px-6 py-4 hover:bg-[#00ff41]/20 transition-all flex items-center justify-center min-w-[120px]">
                  {copied ? <CheckCircle2 className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
                </button>
              </div>
              <div className="flex items-center justify-center gap-3 text-sm opacity-70">
                <Loader2 className="w-4 h-4 animate-spin" /> Listening on port 8080...
              </div>
            </div>
          </motion.div>
        )}

        {/* BATTLE ARENA (SPLIT SCREEN) */}
        {view === "BATTLE" && (
          <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col h-screen">
            <header className="h-14 border-b border-[#00ff41]/20 bg-black/80 flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
                <span className="font-bold tracking-widest uppercase text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]">Live Clash</span>
              </div>
              <div className="text-2xl font-black tracking-widest drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]">ROOM: {roomId}</div>
              <button onClick={() => navigate("/dashboard")} className="text-xs border border-[#00ff41]/30 px-3 py-1 hover:bg-[#00ff41]/20 uppercase tracking-widest">Abort</button>
            </header>

            <div className="flex flex-1 overflow-hidden">
              {/* My Editor */}
              <div className="flex-1 flex flex-col border-r border-[#00ff41]/20 relative">
                <div className="h-10 bg-black/80 border-b border-[#00ff41]/20 flex items-center px-4 justify-between">
                  <span className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase"><div className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse" /> Local Terminal</span>
                  <span className="text-xs text-[#00ff41]/50">{auth.currentUser?.displayName || "Player 1"}</span>
                </div>
                <div className="flex-1 relative bg-[#050505]">
                  <Editor height="100%" language="javascript" theme="vs-dark" value={myCode} onChange={handleCodeChange} options={{ minimap: { enabled: false }, fontFamily: 'JetBrains Mono', fontSize: 15, padding: { top: 16 } }} />
                </div>
              </div>

              {/* Opponent Editor */}
              <div className="relative flex flex-col flex-1 pointer-events-none opacity-80">
                <div className="absolute inset-0 z-10 bg-rose-900/5 mix-blend-overlay" />
                <div className="h-10 bg-black/80 border-b border-[#00ff41]/20 flex items-center px-4 justify-between">
                  <span className="text-xs font-bold tracking-widest uppercase text-rose-500 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]"><div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Network Intercept</span>
                  <span className="text-xs text-rose-500/50">Opponent</span>
                </div>
                <div className="flex-1 relative bg-[#050505]">
                  <Editor height="100%" language="javascript" theme="vs-dark" value={opponentCode} options={{ minimap: { enabled: false }, fontFamily: 'JetBrains Mono', fontSize: 15, padding: { top: 16 }, readOnly: true }} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
