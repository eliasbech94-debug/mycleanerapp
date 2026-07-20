/**
 * <StagingBanner /> — visible ONLY when VITE_APP_ENV === "staging".
 *
 * Purpose: make it impossible for a tester to confuse the staging deploy with
 * production. Renders nothing in every other environment (prod, dev, test).
 *
 * The gate is a strict `===` check against the compile-time Vite constant, so
 * production bundles never ship the banner markup.
 */
export function StagingBanner() {
  const env = (import.meta as any).env?.VITE_APP_ENV;
  if (env !== "staging") return null;

  return (
    <div
      role="status"
      aria-label="Staging environment banner"
      data-testid="staging-banner"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        background: "repeating-linear-gradient(45deg,#ff9800,#ff9800 10px,#000 10px,#000 20px)",
        color: "#fff",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "4px 8px",
        pointerEvents: "none",
        textShadow: "0 1px 2px rgba(0,0,0,0.9)",
      }}
    >
      STAGING — test data only — do not use real personal, payment or identity information
    </div>
  );
}

export default StagingBanner;
