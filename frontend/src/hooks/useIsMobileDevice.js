// src/hooks/useIsMobileDevice.js
import { useEffect, useState } from "react";

// Combines viewport width with a pointer-type signal, matching CustomCursor.jsx's
// existing `matchMedia("(pointer: coarse)")` convention for touch detection --
// AND, not OR: width alone would false-positive on a desktop user who's just
// resized their browser window narrow (mouse pointer, not actually a phone).
// Requiring coarse-pointer too means a narrow desktop window is never blocked,
// while a real phone (narrow width AND touch-primary) reliably is. 767px
// mirrors Tailwind's own `md` breakpoint cutoff (max-md: is `max-width: 767px`
// under the default 768px `md` breakpoint), the same "desktop starts here"
// line already used throughout the app (e.g. DashboardLayout's sidebar).
const QUERY = "(max-width: 767px) and (pointer: coarse)";

export function useIsMobileDevice() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handleChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
