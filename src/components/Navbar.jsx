// src/components/Navbar.jsx
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Terminal, Code2, Users, Settings, LogOut, FileCode2 } from "lucide-react";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const navLinks =[
    { name: "Assessments", path: "/dashboard", icon: <FileCode2 className="w-4 h-4" /> },
    { name: "Problems", path: "/dashboard/problems", icon: <Code2 className="w-4 h-4" /> },
    { name: "Candidates", path: "/dashboard/candidates", icon: <Users className="w-4 h-4" /> },
    { name: "Settings", path: "/dashboard/settings", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-16 max-w-6xl px-6 mx-auto">
        
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-3 group">
          <div className="flex items-center justify-center w-8 h-8 transition-colors border rounded-lg bg-white/5 border-white/10 group-hover:bg-white/10">
            <Terminal className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-wide text-white">SkillPilot</span>
        </Link>

        {/* Navigation Links */}
        <div className="items-center hidden gap-1 md:flex">
          {navLinks.map((link) => {
            // Check if current path matches the link
            const isActive = location.pathname === link.path || 
              (link.path !== "/dashboard" && location.pathname.startsWith(link.path));
            
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? "bg-white/10 text-white" 
                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.icon}
                {link.name}
              </Link>
            );
          })}
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-400/10"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>

      </div>
    </nav>
  );
}