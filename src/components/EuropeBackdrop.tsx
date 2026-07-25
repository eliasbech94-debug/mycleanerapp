import { useEffect, useMemo, useRef } from "react";
import geoData from "@/data/europe-map.json";

/**
 * EuropeBackdrop
 * Ambient Europe map behind the hero. Only active markets glow; the rest
 * remain silhouette. Selected market gets a warm accent highlight.
 * Never competes with foreground content.
 */

type GeoCountry = { name: string; d: string };
type GeoData = { viewBox: [number, number, number, number]; countries: GeoCountry[] };
const GEO = geoData as GeoData;

// Country NAME (as in geojson) → ISO2 code used by MARKETS[].code
const NAME_TO_CODE: Record<string, string> = {
  Denmark: "DK",
  Sweden: "SE",
  Germany: "DE",
  "United Kingdom": "GB",
  Spain: "ES",
  Netherlands: "NL",
  France: "FR",
  Italy: "IT",
  Norway: "NO",
  Belgium: "BE",
  Poland: "PL",
  Portugal: "PT",
};

// Capital coords (lon, lat) per active market — used for node positions.
const CAPITALS: Record<string, [number, number]> = {
  DK: [12.57, 55.68],
  SE: [18.07, 59.33],
  DE: [13.4, 52.52],
  GB: [-0.13, 51.51],
  ES: [-3.7, 40.42],
  NL: [4.9, 52.37],
  FR: [2.35, 48.86],
  IT: [9.19, 45.46],
  NO: [10.75, 59.91],
  BE: [4.35, 50.85],
  PL: [21.02, 52.23],
  PT: [-9.14, 38.72],
};

// Preferred network topology between active markets (curated for readability).
const LINKS: [string, string][] = [
  ["GB", "NL"], ["GB", "FR"], ["GB", "DK"], ["GB", "PT"], ["GB", "ES"],
  ["FR", "BE"], ["FR", "ES"], ["FR", "IT"], ["FR", "DE"], ["FR", "NL"],
  ["NL", "DE"], ["NL", "BE"], ["DE", "DK"], ["DE", "PL"], ["DE", "IT"],
  ["DK", "SE"], ["DK", "NO"], ["SE", "NO"], ["SE", "PL"],
  ["ES", "PT"], ["ES", "IT"], ["IT", "DE"], ["PL", "DE"],
];

function mercator(lon: number, lat: number): [number, number] {
  const y = -(180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
  return [lon, y];
}

export default function EuropeBackdrop({
  activeCodes,
  selectedCode,
}: {
  activeCodes: string[];
  selectedCode?: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const activeSet = useMemo(() => new Set(activeCodes), [activeCodes]);

  // Gentle mouse parallax
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 14;
      ty = (e.clientY / window.innerHeight - 0.5) * 10;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else raf = 0;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Project capitals into the same viewBox as country paths.
  const nodePositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    for (const code of Object.keys(CAPITALS)) {
      const [lon, lat] = CAPITALS[code];
      const [x, y] = mercator(lon, lat);
      map[code] = { x, y };
    }
    return map;
  }, []);

  const [vbX, vbY, vbW, vbH] = GEO.viewBox;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* soft radial wash so the map fades into the hero */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,rgba(22,138,122,0.18),transparent_60%),radial-gradient(ellipse_at_85%_90%,rgba(255,107,53,0.08),transparent_55%)]" />

      <div
        ref={layerRef}
        className="absolute inset-0 will-change-transform"
        style={{ transform: "translate3d(0,0,0)" }}
      >
        <svg
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
        >
          <defs>
            <linearGradient id="linkGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4fd1c5" stopOpacity="0" />
              <stop offset="50%" stopColor="#7ff0e0" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4fd1c5" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="activeFill" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#1fb5a0" stopOpacity="0.55" />
              <stop offset="70%" stopColor="#0f5d55" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0a3d3a" stopOpacity="0.15" />
            </radialGradient>
            <radialGradient id="selectedFill" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#ff9b6a" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#ff6b35" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#ff6b35" stopOpacity="0.08" />
            </radialGradient>
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7ff0e0" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#168a7a" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#168a7a" stopOpacity="0" />
            </radialGradient>
            <filter id="softBlur" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="0.35" />
            </filter>
            <filter id="nodeBlur" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="0.9" />
            </filter>
          </defs>

          {/* All countries as dark silhouette — inactive stays subtle */}
          <g>
            {GEO.countries.map((c) => {
              const code = NAME_TO_CODE[c.name];
              const isActive = code && activeSet.has(code);
              const isSelected = code && code === selectedCode;
              return (
                <path
                  key={c.name}
                  d={c.d}
                  fill={isSelected ? "url(#selectedFill)" : isActive ? "url(#activeFill)" : "#0a1f1e"}
                  fillOpacity={isSelected ? 1 : isActive ? 1 : 0.55}
                  stroke={isSelected ? "#ff6b35" : isActive ? "#1fb5a0" : "#123231"}
                  strokeOpacity={isSelected ? 0.75 : isActive ? 0.45 : 0.55}
                  strokeWidth={isSelected ? 0.22 : 0.14}
                  filter="url(#softBlur)"
                  style={{ transition: "fill-opacity 500ms ease, stroke-opacity 500ms ease" }}
                />
              );
            })}
          </g>

          {/* Network connections between active markets */}
          <g stroke="url(#linkGrad)" strokeWidth={0.16} fill="none" opacity={0.55}>
            {LINKS.filter(([a, b]) => activeSet.has(a) && activeSet.has(b)).map(([a, b], i) => {
              const A = nodePositions[a], B = nodePositions[b];
              if (!A || !B) return null;
              return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} />;
            })}
          </g>

          {/* Active market nodes — glow + animated pulse */}
          <g>
            {Object.entries(nodePositions).map(([code, p], i) => {
              if (!activeSet.has(code)) return null;
              const selected = code === selectedCode;
              const core = selected ? "#ff9b6a" : "#a7f3e6";
              const ring = selected ? "#ff6b35" : "#4fd1c5";
              const baseR = selected ? 0.75 : 0.55;
              const pulseR = selected ? 3.2 : 2.4;
              const dur = 3 + (i % 5) * 0.5;
              const delay = (i % 6) * 0.35;
              return (
                <g key={code} style={{ transition: "opacity 400ms ease" }}>
                  <circle cx={p.x} cy={p.y} r={selected ? 3.4 : 2.4} fill="url(#nodeGlow)" filter="url(#nodeBlur)" />
                  <circle cx={p.x} cy={p.y} r={baseR} fill={core} opacity={0.95} />
                  <circle cx={p.x} cy={p.y} r={baseR} fill="none" stroke={ring} strokeOpacity={0.55} strokeWidth={0.18}>
                    <animate
                      attributeName="r"
                      values={`${baseR};${pulseR};${baseR}`}
                      dur={`${dur}s`}
                      repeatCount="indefinite"
                      begin={`${delay}s`}
                    />
                    <animate
                      attributeName="stroke-opacity"
                      values="0.55;0;0.55"
                      dur={`${dur}s`}
                      repeatCount="indefinite"
                      begin={`${delay}s`}
                    />
                  </circle>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Edge fades so the map never fights the search / stats */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,22,21,0.55),rgba(6,22,21,0.1)_35%,rgba(6,22,21,0.6))]" />
      <div className="absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(to_right,rgba(6,22,21,0.85),transparent)]" />
      <div className="absolute inset-y-0 right-0 w-1/4 bg-[linear-gradient(to_left,rgba(6,22,21,0.35),transparent)]" />
    </div>
  );
}
