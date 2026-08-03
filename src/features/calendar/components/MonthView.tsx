import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { statusAccent } from "../status";
import type { CalendarEvent } from "../useProviderCalendar";
import { addDays, isoDate, MONTHS, sameDay, startOfMonth, startOfWeek, WEEKDAY_LABELS } from "../time";

/**
 * Month overview — orientation only. Cells show counts and small status
 * markers; tapping a day opens that day in the day/agenda view.
 */
export function MonthView({
  month,
  events,
  selectedDate,
  onSelectDay,
}: {
  month: Date;
  events: CalendarEvent[];
  selectedDate: Date;
  onSelectDay: (d: Date) => void;
}) {
  const gridStart = useMemo(() => startOfWeek(startOfMonth(month)), [month]);
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart],
  );
  const now = new Date();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
          <div
            key={wd}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {WEEKDAY_LABELS[wd]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" data-testid="month-grid">
        {cells.map((d) => {
          const dayEvents = events.filter((e) => sameDay(e.start, d));
          const bookings = dayEvents.filter((e) => e.kind === "booking");
          const pending = bookings.filter((e) => e.status === "pending").length;
          const outside = d.getMonth() !== month.getMonth();
          const selected = sameDay(d, selectedDate);
          const markers = Array.from(new Set(dayEvents.map((e) => e.status))).slice(0, 4);
          return (
            <button
              key={isoDate(d)}
              type="button"
              onClick={() => onSelectDay(d)}
              aria-label={`${d.getDate()}. ${MONTHS[d.getMonth()]}: ${bookings.length} bookinger${pending ? `, ${pending} anmodninger` : ""}`}
              aria-current={selected ? "date" : undefined}
              className={cn(
                "min-h-[92px] border-b border-l border-border p-2 text-left transition hover:bg-accent/5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                outside && "bg-muted/30 text-muted-foreground",
                selected && "ring-2 ring-inset ring-ring",
              )}
            >
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full text-sm font-semibold",
                    sameDay(d, now) && "bg-primary text-primary-foreground",
                  )}
                >
                  {d.getDate()}
                </span>
                {bookings.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground">
                    {bookings.length}
                  </span>
                )}
              </span>
              {pending > 0 && (
                <span className="mt-1 block truncate text-[11px] font-medium text-foreground">
                  {pending} anmodning{pending > 1 ? "er" : ""}
                </span>
              )}
              <span className="mt-1 flex flex-wrap gap-1" aria-hidden="true">
                {markers.map((s) => (
                  <span
                    key={s}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: statusAccent(s) }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MonthView;
