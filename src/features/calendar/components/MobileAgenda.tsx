import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { statusAccent } from "../status";
import type { CalendarEvent } from "../useProviderCalendar";
import { addDays, fmtDateLong, isoDate, sameDay, WEEKDAY_LABELS } from "../time";
import { CalendarEventCard } from "./CalendarEventCard";
import { CalendarEmptyState } from "./CalendarStates";

/**
 * Mobile-first agenda. A horizontal date strip plus a chronological, full-width
 * card list — never a shrunken seven-column grid.
 */
export function MobileAgenda({
  anchor,
  selectedDate,
  events,
  onSelectDate,
  onSelectEvent,
  onAddWorkingHours,
  hasWorkingHours,
}: {
  anchor: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalendarEvent) => void;
  onAddWorkingHours?: () => void;
  hasWorkingHours: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const days = useMemo(
    () => Array.from({ length: 21 }, (_, i) => addDays(anchor, i - 3)),
    [anchor],
  );
  const dayEvents = useMemo(
    () => events.filter((e) => sameDay(e.start, selectedDate)).sort((a, b) => +a.start - +b.start),
    [events, selectedDate],
  );
  const bookings = dayEvents.filter((e) => e.kind === "booking");
  const pending = bookings.filter((e) => e.status === "pending");
  const now = new Date();

  return (
    // overflow-x-clip contains the date strip's negative bleed so the page
    // itself never scrolls sideways on narrow phones.
    <div className="min-w-0 space-y-4 overflow-x-clip">

      <div
        ref={stripRef}
        role="group"
        aria-label="Vælg dato"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 momentum-scroll"
        data-testid="agenda-date-strip"
      >
        {days.map((d) => {
          const active = sameDay(d, selectedDate);
          const count = events.filter((e) => sameDay(e.start, d) && e.kind === "booking").length;
          return (
            <button
              key={isoDate(d)}
              type="button"
              onClick={() => onSelectDate(d)}
              aria-pressed={active}
              aria-label={fmtDateLong(d)}
              className={cn(
                "flex min-h-[64px] w-[52px] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {WEEKDAY_LABELS[d.getDay()]}
              </span>
              <span className="text-base font-bold leading-none">{d.getDate()}</span>
              <span className="mt-1 flex h-1.5 items-center gap-0.5" aria-hidden="true">
                {count > 0 && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: active ? "currentColor" : statusAccent("accepted") }}
                  />
                )}
                {sameDay(d, now) && !active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        <h2 className="font-display text-lg text-foreground">{fmtDateLong(selectedDate)}</h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {bookings.length} booking{bookings.length === 1 ? "" : "er"}
          {pending.length > 0 ? ` · ${pending.length} afventer svar` : ""}
        </p>
      </div>

      {dayEvents.length === 0 ? (
        <CalendarEmptyState
          title="Ingen bookinger denne dag"
          description={
            hasWorkingHours
              ? "Dine ledige timer er stadig åbne for kunder."
              : "Tilføj arbejdstider, så kunder kan anmode om tider."
          }
          actionLabel={hasWorkingHours ? undefined : "Tilføj arbejdstider"}
          onAction={hasWorkingHours ? undefined : onAddWorkingHours}
        />
      ) : (
        <ol className="space-y-3" data-testid="agenda-list">
          {dayEvents.map((e) => (
            <li key={e.id}>
              <CalendarEventCard event={e} onSelect={onSelectEvent} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default MobileAgenda;
