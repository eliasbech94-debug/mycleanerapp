import { useEffect, useRef } from "react";

export type CelebrationConfettiProps = {
  /** Total run time in ms (kept short and discreet). */
  durationMs?: number;
  className?: string;
};

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vr: number;
  color: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Discreet, silent, self-terminating confetti burst rendered on a canvas.
 * Purely decorative (aria-hidden) and disabled under prefers-reduced-motion.
 */
export function CelebrationConfetti({ durationMs = 2500, className }: CelebrationConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext("2d") ?? null;
    } catch {
      return; // environments without canvas support (e.g. jsdom)
    }
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.scale(dpr, dpr);

    const styles = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => {
      const raw = styles.getPropertyValue(name).trim();
      return raw ? `hsl(${raw})` : fallback;
    };
    const palette = [
      token("--primary", "hsl(174 70% 32%)"),
      token("--accent", "hsl(20 90% 60%)"),
      token("--secondary", "hsl(180 25% 90%)"),
      token("--ring", "hsl(174 70% 32%)"),
    ];

    const pieces: Piece[] = Array.from({ length: 70 }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.5,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 1.1 + Math.random() * 1.6,
      size: 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.15,
      color: palette[Math.floor(Math.random() * palette.length)],
    }));

    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      const elapsed = now - start;
      const fade = Math.max(0, 1 - Math.max(0, elapsed - durationMs * 0.6) / (durationMs * 0.4));
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (elapsed < durationMs) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? "pointer-events-none absolute inset-0 z-20 h-full w-full"}
    />
  );
}

export default CelebrationConfetti;
