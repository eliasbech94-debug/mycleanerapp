import { Sparkles } from "lucide-react";
import { EARLY_ACCESS_COPY, EARLY_ACCESS_MODE } from "@/config/launch";

/**
 * Professional Early Access banner. Rendered on the homepage and on
 * signup / onboarding / dashboard surfaces. Purely presentational.
 */
export function EarlyAccessBanner({ className = "" }: { className?: string }) {
  if (!EARLY_ACCESS_MODE) return null;

  return (
    <aside
      role="status"
      aria-label={EARLY_ACCESS_COPY.bannerTitle}
      data-testid="early-access-banner"
      className={`w-full border-b-2 ${className}`}
      style={{ background: "#0a3d3a", borderColor: "#ff6b35", color: "#f5f0e0" }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-6">
        <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: "#ff6b35" }}>
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {EARLY_ACCESS_COPY.bannerTitle}
        </span>
        <p className="text-xs leading-snug sm:text-sm">{EARLY_ACCESS_COPY.bannerBody}</p>
      </div>
    </aside>
  );
}

export default EarlyAccessBanner;
