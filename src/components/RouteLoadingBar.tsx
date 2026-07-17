import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function RouteLoadingBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf: number;
    let hideTimer: number;
    setVisible(true);
    setProgress(15);

    const step = (target: number, delay: number) => {
      hideTimer = window.setTimeout(() => setProgress(target), delay);
    };
    step(45, 60);
    step(75, 180);
    step(95, 340);

    const done = window.setTimeout(() => {
      setProgress(100);
      window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    }, 480);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(done);
      cancelAnimationFrame(raf);
    };
  }, [location.pathname]);

  return (
    <div
      aria-hidden={!visible}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease-out",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, #ff6b35, #168a7a)",
          boxShadow: "0 0 8px rgba(255,107,53,0.6)",
          transition: "width 220ms ease-out",
        }}
      />
    </div>
  );
}
