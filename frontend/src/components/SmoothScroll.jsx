// src/components/SmoothScroll.jsx
import { ReactLenis } from "lenis/react";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";

export default function SmoothScroll({ children }) {
  const location = useLocation();
  const pathname = location.pathname;
  
  // Disable smooth scroll on full-screen apps like the Arena, Interviews, or Assessments
  const disableLenis = 
    pathname?.startsWith("/assessment") || 
    pathname?.startsWith("/interview") || 
    pathname?.startsWith("/clash");

  useEffect(() => {
    if (disableLenis) {
      // Forcefully remove orphaned lenis classes from html node that break 100vh layouts
      document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-scrolling", "lenis-stopped");
      document.body.classList.remove("lenis", "lenis-smooth", "lenis-scrolling", "lenis-stopped");
    }
  }, [disableLenis]);

  if (disableLenis) {
    return <>{children}</>;
  }

  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.5, smoothTouch: true }}>
      {children}
    </ReactLenis>
  );
}