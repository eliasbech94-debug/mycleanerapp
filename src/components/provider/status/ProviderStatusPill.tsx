import { cn } from "@/lib/utils";
import { STATUS_META, type ProviderLiveStatus } from "@/lib/providerStatus";

/**
 * The single visual representation of provider live status.
 * Never colour-only: every state carries an icon/emoji and text.
 *
 * `showPresence` adds the optional supporting app-activity line ("Online nu").
 * Presence is supporting information only — the pill itself always shows the
 * authoritative live status.
 */
export function ProviderStatusPill({
  status,
  size = "md",
  showMessage = false,
  showPresence = false,
  useLongLabel = false,
  className,
}: {
  status: ProviderLiveStatus | null;
  size?: "sm" | "md";
  showMessage?: boolean;
  showPresence?: boolean;
  /** Use the descriptive label ("På vej til kunde") when space allows. */
  useLongLabel?: boolean;
  className?: string;
}) {
  if (!status) return null;
  const meta = STATUS_META[status.status];
  const label = useLongLabel && meta.longLabel ? meta.longLabel : meta.label;
  const presenceText = showPresence ? status.presence.text : null;
  return (
    <span className={cn("inline-flex min-w-0 max-w-full flex-col gap-0.5", className)}>
      <span
        data-testid={`provider-status-${status.status}`}
        className={cn(
          "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full ring-1 font-medium",
          meta.pill,
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        )}
      >
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
        <span className="truncate">{label}</span>
      </span>
      {showMessage && status.message && (
        <span className="truncate text-[11px] text-muted-foreground">{status.message}</span>
      )}
      {presenceText && (
        <span
          data-testid={`provider-presence-${status.presence.state}`}
          className="inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground"
        >
          {status.presence.online && (
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          )}
          {presenceText}
        </span>
      )}
    </span>
  );
}

export default ProviderStatusPill;
