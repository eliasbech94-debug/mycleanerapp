/**
 * PullIndicator — presentational spinner for pull-to-refresh.
 * No haptics on its own; the parent page opts into a tiny `navigator.vibrate`
 * confirmation only where supported.
 */
import { Loader2, ArrowDown } from "lucide-react";

export type PullIndicatorProps = {
  pullY: number;
  refreshing: boolean;
  thresholdReached: boolean;
  label?: string;
  releaseLabel?: string;
  refreshingLabel?: string;
};

export function PullIndicator({
  pullY,
  refreshing,
  thresholdReached,
  label = "Træk for at opdatere",
  releaseLabel = "Slip for at opdatere",
  refreshingLabel = "Opdaterer…",
}: PullIndicatorProps) {
  const visible = refreshing || pullY > 4;
  const height = refreshing ? 56 : Math.min(72, pullY);
  const text = refreshing ? refreshingLabel : thresholdReached ? releaseLabel : label;

  return (
    <div
      aria-hidden={!visible}
      role="status"
      aria-live="polite"
      style={{ height, transition: refreshing ? "height 160ms ease" : undefined }}
      className="pointer-events-none flex items-end justify-center overflow-hidden text-[hsl(var(--mkt-ink-muted))] motion-reduce:transition-none"
    >
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium">
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <ArrowDown
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
              thresholdReached ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        )}
        <span>{text}</span>
      </div>
    </div>
  );
}

export default PullIndicator;
