// src/components/MainLayout.jsx
import { Outlet } from "react-router-dom";
import PublicNavbar from "./PublicNavbar";
import Noise from "./Noise";
import BackgroundGlow from "./BackgroundGlow";

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] font-sans relative selection:bg-emerald-500/30 selection:text-white">
      <Noise />
      <BackgroundGlow />
      <PublicNavbar />
      
      <div className="pt-16">
        <Outlet />
      </div>
    </div>
  );
}