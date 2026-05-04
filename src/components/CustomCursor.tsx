import { useEffect, useRef, useState } from "react";

/**
 * 2026-style custom cursor: a small dot + a soft trailing ring.
 * Auto-disabled on touch/coarse pointer devices. Hides native cursor globally.
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    setEnabled(true);
    document.documentElement.classList.add("cursor-none-root");

    let dotX = window.innerWidth / 2;
    let dotY = window.innerHeight / 2;
    let ringX = dotX;
    let ringY = dotY;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      dotX = e.clientX;
      dotY = e.clientY;
      const t = e.target as HTMLElement | null;
      const interactive =
        !!t &&
        !!t.closest(
          'a, button, [role="button"], input, textarea, select, [data-cursor="hover"]'
        );
      setHover(interactive);
    };

    const tick = () => {
      ringX += (dotX - ringX) * 0.18;
      ringY += (dotY - ringY) * 0.18;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("cursor-none-root");
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        className={`pointer-events-none fixed left-0 top-0 z-[9999] rounded-full border transition-[width,height,background-color,border-color,opacity] duration-200 ease-out mix-blend-difference ${
          hover
            ? "w-12 h-12 border-white/60 bg-white/10"
            : "w-9 h-9 border-white/40 bg-transparent"
        }`}
        style={{ willChange: "transform" }}
      />
      <div
        ref={dotRef}
        aria-hidden
        className={`pointer-events-none fixed left-0 top-0 z-[9999] rounded-full bg-white mix-blend-difference transition-[width,height,opacity] duration-150 ${
          hover ? "w-1 h-1 opacity-0" : "w-1.5 h-1.5 opacity-100"
        }`}
        style={{ willChange: "transform" }}
      />
    </>
  );
}

export default CustomCursor;
