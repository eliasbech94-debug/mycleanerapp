import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent, WorkingWindow } from "../useProviderCalendar";
import { fmtTime, sameDay } from "../time";
import { CalendarEventCard } from "./CalendarEventCard";
import { CalendarEmptyState } from "./CalendarStates";

/**
 * Day view — chronological timeline with working hours, free periods and the
 * current-time marker. Optimised for tablet and narrow desktop.
 */
export function DayView({
  date,
  events,
  workingWindows,
  selectedId,
  onSelect,
  onAddWorkingHours,
}: {
  date: Date;
  events: CalendarEvent[];
  workingWindows: WorkingWindow[];
  selectedId?: string | null;
  onSelect: (event: CalendarEvent) => void;
  onAddWorkingHours?: () => void;
}) {
  const dayEvents = useMemo(
    () => events.filter((e) => sameDay(e.start, date)).sort((a, b) => +a.start - +b.start),
    [events, date],
  );
  const windows = workingWindows.filter((w) => w.weekday === date.getDay());
  const now = new Date();
  const isToday = sameDay(date, now);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Arbejdstider</p>
          {isToday && (
            <p className="text-xs tabular-nums text-muted-foreground">Nu {fmtTime(now)}</p>
          )}
        </div>
        {windows.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {windows.map((w, i) => (
              <li
                key={i}
                className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tabular-nums text-foreground"
              >
                {w.start}–{w.end}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Ingen arbejdstid denne dag — kunder kan ikke booke.
          </p>
        )}
      </div>

      {dayEvents.length === 0 ? (
        <CalendarEmptyState
          title="Ingen bookinger denne dag"
          description={
            windows.length
              ? "Dine ledige timer er stadig åbne for kunder."
              : "Tilføj arbejdstider, så kunder kan anmode om tider."
          }
          actionLabel={windows.length ? undefined : "Tilføj arbejdstider"}
          onAction={windows.length ? undefined : onAddWorkingHours}
        />
      ) : (
        <ol className={cn("space-y-3")} data-testid="day-view-list">
          {dayEvents.map((e) => (
            <li key={e.id}>
              <CalendarEventCard event={e} onSelect={onSelect} selected={selectedId === e.id} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default DayView;
