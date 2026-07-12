// src/pages/ClashMobileBlock.jsx
import { Link } from "react-router-dom";
import { Terminal, Monitor, ArrowLeft } from "lucide-react";

// Rendered INSTEAD of Clash (never alongside it) when useIsMobileDevice()
// says so -- see the ClashGate wrapper in App.jsx, which decides which of
// the two to render before either one's module code runs, so this component
// intentionally has zero heavy dependencies (no Firestore, no Monaco).
export default function ClashMobileBlock() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] flex flex-col items-center justify-center px-6 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-white/[0.04] border border-white/10">
        <Monitor className="w-8 h-8 text-neutral-400" />
      </div>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white font-display">
        Code Clash needs a bigger screen
      </h1>
      <p className="max-w-sm mb-8 text-sm leading-relaxed text-neutral-400">
        Battles need a real keyboard and enough screen space for a live code editor
        side by side with your opponent's. Open SkillPilot on a laptop or desktop to battle.
      </p>
      <Link
        to="/"
        className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.04] border border-white/10 text-neutral-300 font-medium rounded-xl text-sm hover:bg-white/[0.07] hover:text-white transition-all duration-200"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>
      <div className="flex items-center gap-2 mt-10 text-xs text-neutral-700 font-mono">
        <Terminal className="w-3.5 h-3.5" />
        SkillPilot
      </div>
    </div>
  );
}
