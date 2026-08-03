import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CALENDAR_STATUS, statusSurface } from "../status";
import type { CalendarEvent, WorkingWindow } from "../useProviderCalendar";
import { addDays, fmtTime, isoDate, sameDay, WEEKDAY_LABELS } from "../time";

const HOUR_PX = 52;

type Positioned = { event: CalendarEvent; top: number; height: number; left: number; width: number };

/** Simple lane packing so overlapping events stay readable. */
function layout(events: CalendarEvent[], dayStartMin: number, dayEndMin: number): Positioned[] {
  const lanes: CalendarEvent[][] = [];
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const laneOf = new Map<string, number>();
  for (const e of sorted) {
    let placed = false;
    for (let i = 0; i < lanes.length; i += 1) {
      const last = lanes[i][lanes[i].length - 1];
      if (last.end <= e.start) {
        lanes[i].push(e);
        laneOf.set(e.id, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([e]);
      laneOf.set(e.id, lanes.length - 1);
    }
  }
  const count = Math.max(1, lanes.length);
  const span = dayEndMin - dayStartMin || 1;
  return sorted.map((e) => {
    const startMin = Math.max(dayStartMin, e.start.getHours() * 60 + e.start.getMinutes());
    const endMin = Math.min(dayEndMin, e.end.getHours() * 60 + e.end.getMinutes() || dayEndMin);
    const lane = laneOf.get(e.id) ?? 0;
    return {
      event: e,
      top: ((startMin - dayStartMin) / span) * (span / 60) * HOUR_PX,
      height: Math.max(26, ((endMin - startMin) / 60) * HOUR_PX),
      left: (lane / count) * 100,
      width: 100 / count,
    };
  });
}

/**
 * Desktop week view. Hour grid, muted non-working hours, current-time marker,
 * overlap-aware event placement. All data comes from the authoritative
 * calendar sources — nothing is computed as "available" in the browser.
 */
export function WeekView({
  weekStart,
  events,
  workingWindows,
  selectedId,
  onSelect,
  onSelectDay,
}: {
  weekStart: Date;
  events: CalendarEvent[];
  workingWindows: WorkingWindow[];
  selectedId?: string | null;
  onSelect: (event: CalendarEvent) => void;
  onSelectDay: (date: Date) => void;
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const bounds = useMemo(() => {
    const starts = workingWindows.map((w) => Number(w.start.slice(0, 2)));
    const ends = workingWindows.map((w) => Math.ceil(Number(w.end.slice(0, 2))) + 1);
    const from = starts.length ? Math.max(0, Math.min(...starts) - 1) : 6;
    const to = ends.length ? Math.min(24, Math.max(...ends)) : 22;
    return { from, to: Math.max(from + 6, to) };
  }, [workingWindows]);

  const hours = useMemo(
    () => Array.from({ length: bounds.to - bounds.from }, (_, i) => bounds.from + i),
    [bounds],
  );
  const now = new Date();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border">
        <div />
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <button
              key={isoDate(d)}
              type="button"
              onClick={() => onSelectDay(d)}
              className={cn(
                "min-h-[56px] border-l border-border px-2 py-2 text-center transition hover:bg-accent/5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              )}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {WEEKDAY_LABELS[d.getDay()]}
              </span>
              <span
                className={cn(
                  "mx-auto mt-1 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold",
                  today ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative grid max-h-[68vh] grid-cols-[56px_repeat(7,minmax(0,1fr))] overflow-y-auto">
        <div className="sticky left-0 bg-card">
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_PX }}
              className="pr-2 text-right text-[11px] tabular-nums text-muted-foreground"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {days.map((d) => {
          const dayEvents = events.filter((e) => sameDay(e.start, d) && !e.allDay);
          const allDay = events.filter((e) => sameDay(e.start, d) && e.allDay);
          const windows = workingWindows.filter((w) => w.weekday === d.getDay());
          const positioned = layout(dayEvents, bounds.from * 60, bounds.to * 60);
          const isToday = sameDay(d, now);
          return (
            <div key={isoDate(d)} className="relative border-l border-border">
              {/* non-working shading */}
              <div className="absolute inset-0 bg-muted/40" aria-hidden="true" />
              {windows.map((w, i) => {
                const s = Number(w.start.slice(0, 2)) * 60 + Number(w.start.slice(3, 5));
                const e = Number(w.end.slice(0, 2)) * 60 + Number(w.end.slice(3, 5));
                return (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="absolute inset-x-0 bg-card"
                    style={{
                      top: ((s - bounds.from * 60) / 60) * HOUR_PX,
                      height: ((e - s) / 60) * HOUR_PX,
                    }}
                  />
                );
              })}
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ height: HOUR_PX }}
                  className="border-b border-border/60"
                  aria-hidden="true"
                />
              ))}

              {allDay.map((e) => (
                <div key={e.id} className="absolute inset-x-1 top-1 z-10">
                  <button
                    type="button"
                    onClick={() => onSelect(e)}
                    className="cal-hatch w-full truncate rounded-md border px-1.5 py-1 text-[11px] font-medium"
                    style={statusSurface(e.status, 0.18)}
                  >
                    {CALENDAR_STATUS[e.status].label}
                  </button>
                </div>
              ))}

              {positioned.map(({ event, top, height, left, width }) => (
                <div
                  key={event.id}
                  className="absolute z-10 px-0.5"
                  style={{ top, height, left: `${left}%`, width: `${width}%` }}
                >
                  <CompactEvent
                    event={event}
                    selected={selectedId === event.id}
                    onSelect={onSelect}
                  />
                </div>
              ))}

              {isToday && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
                  style={{
                    top:
                      ((now.getHours() * 60 + now.getMinutes() - bounds.from * 60) / 60) * HOUR_PX,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompactEvent({
  event,
  selected,
  onSelect,
}: {
  event: CalendarEvent;
  selected: boolean;
  onSelect: (e: CalendarEvent) => void;
}) {
  const meta = CALENDAR_STATUS[event.status];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      aria-label={`${meta.label}: ${event.title || meta.label}, ${fmtTime(event.start)} til ${fmtTime(event.end)}`}
      className={cn(
        "h-full w-full overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        event.kind === "block" && "cal-hatch",
        selected && "ring-2 ring-ring",
      )}
      style={statusSurface(event.status, 0.2)}
    >
      <span className="flex items-center gap-1 font-semibold tabular-nums">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        {fmtTime(event.start)}
      </span>
      <span className="block truncate">{event.title || meta.label}</span>
      <span className="sr-only">{meta.label}</span>
    </button>
  );
}

export default WeekView;
