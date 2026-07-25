import { useEffect, useRef } from "react";

/**
 * EuropeBackdrop
 * Ambient, low-opacity constellation of European cities used behind the hero.
 * — Thin glowing network lines
 * — Softly pulsing nodes
 * — Gentle mouse parallax
 * Never competes with foreground content.
 */

// Approximate positions on a 1200x680 viewBox (roughly Europe layout).
const NODES: { id: string; x: number; y: number; hub?: boolean }[] = [
  { id: "lon", x: 340, y: 260, hub: true },
  { id: "par", x: 430, y: 340 },
  { id: "ams", x: 470, y: 260 },
  { id: "bru", x: 445, y: 295 },
  { id: "cph", x: 560, y: 210, hub: true },
  { id: "sto", x: 620, y: 150, hub: true },
  { id: "osl", x: 555, y: 130 },
  { id: "hel", x: 720, y: 120 },
  { id: "ber", x: 585, y: 265, hub: true },
  { id: "war", x: 700, y: 265 },
  { id: "pra", x: 605, y: 305 },
  { id: "vie", x: 620, y: 340 },
  { id: "mun", x: 555, y: 335 },
  { id: "zur", x: 505, y: 355 },
  { id: "mil", x: 530, y: 400 },
  { id: "rom", x: 585, y: 450 },
  { id: "mad", x: 320, y: 470, hub: true },
  { id: "bar", x: 400, y: 445 },
  { id: "lis", x: 240, y: 470 },
  { id: "por", x: 245, y: 435 },
  { id: "dub", x: 275, y: 245 },
  { id: "ath", x: 730, y: 490 },
  { id: "bud", x: 675, y: 345 },
  { id: "buc", x: 750, y: 375 },
];

const byId = (id: string) => NODES.find((n) => n.id === id)!;

// Curated links so the network reads like flight paths, not spaghetti.
const LINKS: [string, string][] = [
  ["lon", "par"], ["lon", "dub"], ["lon", "ams"], ["lon", "cph"], ["lon", "mad"],
  ["par", "ams"], ["par", "bru"], ["par", "mad"], ["par", "mil"], ["par", "ber"],
  ["ams", "ber"], ["ams", "cph"], ["ber", "cph"], ["ber", "war"], ["ber", "pra"],
  ["cph", "sto"], ["sto", "osl"], ["sto", "hel"], ["cph", "osl"],
  ["ber", "vie"], ["vie", "bud"], ["bud", "buc"], ["vie", "pra"], ["mun", "zur"],
  ["mun", "mil"], ["mil", "rom"], ["rom", "ath"], ["mad", "bar"], ["bar", "par"],
  ["mad", "lis"], ["lis", "por"], ["war", "buc"], ["mun", "ber"],
];

export default function EuropeBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  // Gentle mouse parallax — only translate a few px, respects reduced motion.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      tx = (e.clientX / w - 0.5) * 12;
      ty = (e.clientY / h - 0.5) * 8;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Soft radial vignette so the map fades into the hero */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,rgba(22,138,122,0.18),transparent_60%),radial-gradient(ellipse_at_85%_90%,rgba(255,107,53,0.08),transparent_55%)]" />

      <div
        ref={ref}
        className="absolute inset-0 will-change-transform"
        style={{ transform: "translate3d(0,0,0)" }}
      >
        <svg
          viewBox="0 0 1200 680"
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full opacity-[0.32]"
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4fd1c5" stopOpacity="0" />
              <stop offset="50%" stopColor="#4fd1c5" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4fd1c5" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7ff0e0" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#168a7a" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#168a7a" stopOpacity="0" />
            </radialGradient>
            <filter id="nodeBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>

          {/* Network */}
          <g stroke="url(#lineGrad)" strokeWidth="0.6" fill="none">
            {LINKS.map(([a, b], i) => {
              const A = byId(a);
              const B = byId(b);
              return (
                <line
                  key={i}
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  opacity={0.55}
                />
              );
            })}
          </g>

          {/* Node glows */}
          <g>
            {NODES.map((n) => (
              <circle
                key={`g-${n.id}`}
                cx={n.x}
                cy={n.y}
                r={n.hub ? 14 : 8}
                fill="url(#nodeGlow)"
                filter="url(#nodeBlur)"
              />
            ))}
          </g>

          {/* Nodes */}
          <g>
            {NODES.map((n, i) => (
              <g key={n.id}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.hub ? 2.6 : 1.6}
                  fill={n.hub ? "#ff9b6a" : "#a7f3e6"}
                  opacity={n.hub ? 0.95 : 0.75}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.hub ? 2.6 : 1.6}
                  fill="none"
                  stroke={n.hub ? "#ff6b35" : "#4fd1c5"}
                  strokeOpacity="0.55"
                  strokeWidth="0.6"
                >
                  <animate
                    attributeName="r"
                    values={`${n.hub ? 2.6 : 1.6};${n.hub ? 10 : 6};${n.hub ? 2.6 : 1.6}`}
                    dur={`${3.2 + (i % 5) * 0.6}s`}
                    repeatCount="indefinite"
                    begin={`${(i % 7) * 0.4}s`}
                  />
                  <animate
                    attributeName="stroke-opacity"
                    values="0.55;0;0.55"
                    dur={`${3.2 + (i % 5) * 0.6}s`}
                    repeatCount="indefinite"
                    begin={`${(i % 7) * 0.4}s`}
                  />
                </circle>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Fade edges so the map never fights the content */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,22,21,0.55),rgba(6,22,21,0.15)_35%,rgba(6,22,21,0.55))]" />
      <div className="absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(to_right,rgba(6,22,21,0.85),transparent)]" />
    </div>
  );
}
