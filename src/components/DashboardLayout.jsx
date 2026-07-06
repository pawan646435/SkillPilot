// src/components/DashboardLayout.jsx
import { useState, useEffect, useMemo, Suspense } from "react";
import { useLocation, Link, useNavigate, Outlet } from "react-router-dom";
import {
  Terminal, LayoutDashboard, FileCode2, Users,
  Settings, LogOut, Code2, UserCircle, BrainCircuit, Newspaper, Swords, Loader2
} from "lucide-react";
import { auth, db } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/authContextStore";
import { prefetchRoute } from "../routePrefetch";
import Noise from "./Noise";
import BackgroundGlow from "./BackgroundGlow";

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, authReady } = useAuth();
  const [profile, setProfile] = useState(null);

  // Redirect logged-out visitors — this one legitimately depends on the
  // current path (to redirect back here after login), so it re-runs on nav.
  useEffect(() => {
    if (!authReady || authUser) return;
    navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
  }, [authReady, authUser, navigate, location.pathname]);

  // Fetch the user's Firestore profile doc once per signed-in user — this
  // has no reason to depend on the current path, so it must NOT re-run on
  // every nav (it previously did, via a stray `location.pathname` dependency,
  // firing a redundant Firestore round-trip on every dashboard nav click).
  useEffect(() => {
    if (!authReady || !authUser) return;

    let isMounted = true;
    getDoc(doc(db, "users", authUser.uid)).then((userDoc) => {
      if (!isMounted) return;
      setProfile(userDoc.exists() ? userDoc.data() : null);
    });

    return () => {
      isMounted = false;
    };
  }, [authUser, authReady]);

  const user = useMemo(
    () => (authUser ? { ...authUser, ...profile } : null),
    [authUser, profile]
  );
  const outletContext = useMemo(
    () => ({ dashboardUser: user, dashboardAuthReady: authReady }),
    [user, authReady]
  );

  const getAvatarUrl = () => {
    if (!user?.photoURL) return null;
    return user.photoURL;
  };

  const getDisplayName = () => {
    return user?.name || user?.displayName || user?.email?.split("@")[0] || "User";
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const navLinks = [
    { name: "Overview",    href: "/dashboard",            icon: LayoutDashboard },
    { name: "Clash History", href: "/dashboard/clash-history", icon: Newspaper },
    { name: "Clash Questions", href: "/dashboard/clash-questions", icon: Swords },
    { name: "Assessments", href: "/dashboard/assessments", icon: FileCode2 },
    { name: "Problems",    href: "/dashboard/problems",    icon: Code2 },
    { name: "Candidates",  href: "/dashboard/candidates",  icon: Users },
    { name: "AI Interview",href: "/interview",             icon: BrainCircuit, external: true },
    { name: "Account",     href: "/dashboard/account",     icon: UserCircle },
    { name: "Settings",    href: "/dashboard/settings",    icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-[#ededed] relative selection:bg-emerald-500/30 selection:text-white">
      <Noise />
      <BackgroundGlow />

      {/* Sidebar Navigation */}
      <aside className="fixed top-0 left-0 h-screen w-64 border-r border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl max-md:hidden flex flex-col justify-between z-20">

        {/* Top Logo */}
        <div className="p-6">
          <Link to="/" onMouseEnter={() => prefetchRoute("/")} onFocus={() => prefetchRoute("/")} className="flex items-center gap-3 mb-10 group">
            <div className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-neutral-800 to-black border border-white/10 group-hover:border-white/30 transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)] overflow-hidden">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-white/5 to-transparent" />
              <Terminal className="z-10 w-4 h-4 text-white/90" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white transition-opacity font-display group-hover:opacity-80">
              SkillPilot
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = link.href === "/dashboard"
                ? location.pathname === "/dashboard"
                : location.pathname.startsWith(link.href);

              const Icon = link.icon;

              // "AI Interview" is a full-screen route outside dashboard
              if (link.external) {
                return (
                  <Link
                    key={link.name}
                    to={link.href}
                    onMouseEnter={() => prefetchRoute(link.href)}
                    onFocus={() => prefetchRoute(link.href)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-white/10 text-white font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                        : "text-neutral-500 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-emerald-400" : "text-neutral-500"}`} />
                    <span>{link.name}</span>
                    <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                      AI
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={link.name}
                  to={link.href}
                  onMouseEnter={() => prefetchRoute(link.href)}
                  onFocus={() => prefetchRoute(link.href)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-white/10 text-white font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                      : "text-neutral-500 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-emerald-400" : "text-neutral-500"}`} />
                  {link.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Profile / Logout */}
        <div className="p-6 border-t border-white/5">
          {user && (
            <Link
              to="/dashboard/account"
              onMouseEnter={() => prefetchRoute("/dashboard/account")}
              onFocus={() => prefetchRoute("/dashboard/account")}
              className="flex items-center gap-3 px-4 py-3 mb-2 transition-colors rounded-xl hover:bg-white/5 group"
            >
              <div className="flex items-center justify-center w-8 h-8 overflow-hidden border rounded-lg border-white/10 bg-neutral-800 shrink-0">
                {getAvatarUrl() ? (
                  <img src={getAvatarUrl()} alt={getDisplayName()} className="object-cover w-full h-full" />
                ) : (
                  <span className="text-sm font-bold text-neutral-400">
                    {getDisplayName().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{getDisplayName()}</p>
                <p className="text-xs truncate text-neutral-500">{user.email}</p>
              </div>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center w-full gap-3 px-4 py-3 transition-colors duration-200 rounded-xl text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10"
          >
            <LogOut className="w-5 h-5" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 flex-1 md:ml-64">
        <div className="p-8 mx-auto md:p-12 max-w-7xl">
          {/* Local Suspense boundary: a not-yet-cached nested page's lazy chunk
              only suspends this content area, not the whole sidebar/layout
              (which would otherwise unmount/remount via the app-level boundary
              in App.jsx, since DashboardLayout itself is also React.lazy()). */}
          <Suspense fallback={<DashboardOutletFallback />}>
            <Outlet context={outletContext} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function DashboardOutletFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
    </div>
  );
}
