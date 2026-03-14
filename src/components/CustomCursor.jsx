// src/components/CustomCursor.jsx
import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false);

  // useMotionValue allows extremely fast updates without triggering React re-renders
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  // useSpring gives that buttery smooth "lag" trailing effect
  const springConfig = { damping: 25, stiffness: 300, mass: 0.5 };
  const x = useSpring(cursorX, springConfig);
  const y = useSpring(cursorY, springConfig);

  useEffect(() => {
    const moveCursor = (e) => {
      // Offset by 10px so the 20x20px ball is perfectly centered on the mouse
      cursorX.set(e.clientX - 10);
      cursorY.set(e.clientY - 10);
    };

    const handleMouseOver = (e) => {
      const target = e.target;
      // Check if hovering over interactive elements OR text elements
      if (
        target.closest('a') || 
        target.closest('button') || 
        target.closest('input') || 
        target.closest('textarea') ||
        target.closest('p, h1, h2, h3, h4, h5, h6, span, strong, code')
      ) {
        setIsHovering(true);
      } else {
        setIsHovering(false);
      }
    };

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mouseover", handleMouseOver);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mouseover", handleMouseOver);
    };
  }, [cursorX, cursorY]);

  // Hide on touch devices
  if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
    return null;
  }

  return (
    <motion.div
      className="fixed top-0 left-0 w-5 h-5 rounded-full bg-white pointer-events-none z-[9999] mix-blend-difference hidden md:block"
      style={{ x, y }}
      animate={{
        scale: isHovering ? 2.5 : 1, // Zooms in when hovering over text/links
        opacity: isHovering ? 0.9 : 1,
      }}
      transition={{ type: "tween", duration: 0.15, ease: "easeOut" }}
    />
  );
}
