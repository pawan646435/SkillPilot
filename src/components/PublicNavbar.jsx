// src/components/PublicNavbar.jsx
import { Link } from "react-router-dom";
import { Terminal, ArrowRight, LayoutDashboard } from "lucide-react";
import { useState, useEffect } from "react";

export default function PublicNavbar() {
  const [user, setUser] = useState(null);

  // Load Firebase auth lazily so public pages don't pull the full Firebase bundle immediately.
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
        // Keep navbar functional even if auth listener fails.
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
    <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-[#0a0a0a]/70 backdrop-blur-xl">
      <div className="flex items-center justify-between h-16 px-6 mx-auto max-w-7xl">
        
        {/* LOGO - Now clicks to Dashboard if logged in! */}
        <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neutral-800 to-black border border-white/10 flex items-center justify-center group-hover:border-white/30 transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)]">
            <Terminal className="w-4 h-4 text-white/90" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white transition-opacity font-display group-hover:opacity-80">
            SkillPilot
          </span>
        </Link>

        {/* Center Links */}
        <div className="items-center hidden gap-8 text-sm font-medium md:flex text-neutral-400">
          <Link to="/" className="transition-colors hover:text-white">Home</Link>
          <Link to="/news" className="transition-colors hover:text-white">News</Link>
          <Link to="/interview" className="transition-colors hover:text-white">AI Interviewer</Link>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          {user ? (
            // User is LOGGED IN -> Show Dashboard Button
            <Link to="/dashboard" className="group flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-bold rounded-lg hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)]">
              <LayoutDashboard className="w-4 h-4" />
              Go to Dashboard
            </Link>
          ) : (
            // User is LOGGED OUT -> Show Sign In / Get Started
            <>
              <Link to="/login" className="hidden text-sm font-medium transition-colors text-neutral-300 hover:text-white sm:block">
                Sign In
              </Link>
              <Link to="/register" className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-black transition-all bg-white rounded-lg group hover:bg-neutral-200">
                Get Started
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
