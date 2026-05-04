import { useRef, useState, ReactNode, MouseEvent, CSSProperties } from "react";

interface TiltProps {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees */
  max?: number;
  /** Scale on hover */
  scale?: number;
  /** Glare effect */
  glare?: boolean;
  style?: CSSProperties;
}

/**
 * Lightweight 3D tilt wrapper. Disabled on touch / coarse pointer devices.
 */
export function Tilt({
  children,
  className = "",
  max = 10,
  scale = 1.02,
  glare = true,
  style,
}: TiltProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<string>("");
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    // Skip on touch devices
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotX = (0.5 - y) * max * 2;
    const rotY = (x - 0.5) * max * 2;
    setTransform(
      `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`
    );
    setGlarePos({ x: x * 100, y: y * 100, opacity: 0.18 });
  };

  const handleLeave = () => {
    setTransform("perspective(1000px) rotateX(0) rotateY(0) scale(1)");
    setGlarePos((g) => ({ ...g, opacity: 0 }));
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`relative will-change-transform transition-transform duration-200 ease-out [transform-style:preserve-3d] ${className}`}
      style={{ transform, ...style }}
    >
      {children}
      {glare && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden transition-opacity duration-300"
          style={{ opacity: glarePos.opacity }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 45%)`,
              mixBlendMode: "overlay",
            }}
          />
        </div>
      )}
    </div>
  );
}

export default Tilt;
