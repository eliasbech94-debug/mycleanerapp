import { AlertTriangle, Clock, Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/i18n/money";
import { CALENDAR_STATUS, statusAccent, statusSurface } from "../status";
import type { CalendarEvent } from "../useProviderCalendar";
import { fmtDeadline, fmtDuration, fmtTime } from "../time";
import { CalendarStatusBadge } from "./CalendarStatusBadge";

/**
 * Event card used by the day view, mobile agenda and the pending-request rail.
 * Compact variant is used inside the week grid where height is constrained.
 */
export function CalendarEventCard({
  event,
  onSelect,
  selected,
  compact,
  className,
}: {
  event: CalendarEvent;
  onSelect?: (event: CalendarEvent) => void;
  selected?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const meta = CALENDAR_STATUS[event.status];
  const Icon = meta.icon;
  const booking = event.booking;
  const durationMin = Math.round((event.end.getTime() - event.start.getTime()) / 60000);
  const isPending = event.status === "pending";
  const deadline = booking?.assignment_deadline_at
    ? new Date(booking.assignment_deadline_at)
    : null;

  const label = event.kind === "booking" ? event.title : event.title || meta.label;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(event)}
        aria-label={`${meta.label}: ${label}, ${fmtTime(event.start)}–${fmtTime(event.end)}`}
        className={cn(
          "h-full w-full overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          selected && "ring-2 ring-ring ring-offset-1",
          event.kind === "block" && "cal-hatch",
          className,
        )}
        style={statusSurface(event.status, 0.18)}
      >
        <span className="flex items-center gap-1 font-semibold">
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{fmtTime(event.start)}</span>
        </span>
        <span className="block truncate">{label}</span>
        <span className="sr-only">{meta.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      className={cn(
        "group flex w-full min-h-[44px] gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition",
        "hover:border-ring/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected && "ring-2 ring-ring ring-offset-2",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 w-1.5 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: statusAccent(event.status) }}
      />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold tabular-nums text-foreground">
            {event.allDay ? "Hele dagen" : `${fmtTime(event.start)}–${fmtTime(event.end)}`}
          </span>
          <CalendarStatusBadge status={event.status} size="sm" />
        </span>
        <span className="block truncate font-medium text-foreground">{label}</span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {fmtDuration(durationMin)}
          </span>
          {booking?.address && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{approxLocation(booking.address, event.status)}</span>
            </span>
          )}
          {booking && (
            <span className="font-medium text-foreground">
              {formatMoney(booking.provider_gets, booking.currency)}
            </span>
          )}
          {event.kind === "block" && !event.editable && (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Skrivebeskyttet
            </span>
          )}
        </span>

        {isPending && deadline && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {fmtDeadline(deadline)}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Privacy rule: the exact address is only meaningful once the job is under way.
 * Before acceptance the card shows an approximate location only.
 */
export function approxLocation(address: string, status: string): string {
  const revealed = ["accepted", "travelling", "arrived", "work_started", "paused", "resumed"];
  if (revealed.includes(status)) return address;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "Område oplyses ved accept";
}

export default CalendarEventCard;
