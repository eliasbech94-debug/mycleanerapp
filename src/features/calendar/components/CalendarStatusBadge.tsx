import { cn } from "@/lib/utils";
import { CALENDAR_STATUS, statusSurface, type CalendarStatusKey } from "../status";

/**
 * Status chip used across every calendar surface.
 * Always renders icon + text so status is never colour-only.
 */
export function CalendarStatusBadge({
  status,
  size = "md",
  className,
  short,
}: {
  status: CalendarStatusKey;
  size?: "sm" | "md";
  className?: string;
  short?: boolean;
}) {
  const meta = CALENDAR_STATUS[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={statusSurface(status, 0.16)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{short ? meta.short : meta.label}</span>
    </span>
  );
}

export default CalendarStatusBadge;
