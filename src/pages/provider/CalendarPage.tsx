import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { useIsMobile } from "@/hooks/use-mobile";
import ProviderAvailabilityEditor from "@/components/provider/ProviderAvailabilityEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addDays,
  fmtRangeLabel,
  MONTHS,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/features/calendar/time";
import {
  ALL_FILTERS,
  filterKeyFor,
  useProviderCalendar,
  type CalendarEvent,
  type CalendarFilterKey,
} from "@/features/calendar/useProviderCalendar";
import { CalendarToolbar, type CalendarView } from "@/features/calendar/components/CalendarToolbar";
import { WeekView } from "@/features/calendar/components/WeekView";
import { DayView } from "@/features/calendar/components/DayView";
import { MonthView } from "@/features/calendar/components/MonthView";
import { MobileAgenda } from "@/features/calendar/components/MobileAgenda";
import { EventDetailPanel } from "@/features/calendar/components/EventDetailPanel";
import { BlockTimeDialog } from "@/features/calendar/components/BlockTimeDialog";
import { ICalConnectionsCard } from "@/features/calendar/components/ICalConnectionsCard";
import {
  CalendarErrorState,
  CalendarSkeleton,
} from "@/features/calendar/components/CalendarStates";

/**
 * Provider calendar route (`/provider/calendar`).
 *
 * Desktop: week grid with a right-hand detail panel.
 * Tablet: day view. Mobile: agenda + bottom sheet.
 *
 * All data comes from `useProviderCalendar`; every mutation goes through
 * server-authoritative RPCs / Edge Functions.
 */
export default function CalendarPage() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [filters, setFilters] = useState<CalendarFilterKey[]>([]);
  const [blockOpen, setBlockOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.title = "Kalender og tilgængelighed | MyCleaner";
  }, []);

  const effectiveView: CalendarView = isMobile ? "day" : view;

  const { from, to } = useMemo(() => {
    if (isMobile) return { from: addDays(anchor, -7), to: addDays(anchor, 28) };
    if (effectiveView === "month") {
      const first = startOfMonth(anchor);
      return { from: addDays(startOfWeek(first), 0), to: addDays(first, 42) };
    }
    if (effectiveView === "day") return { from: startOfDay(anchor), to: startOfDay(anchor) };
    const ws = startOfWeek(anchor);
    return { from: ws, to: addDays(ws, 6) };
  }, [anchor, effectiveView, isMobile]);

  const { events, workingWindows, timezone, loading, error, refresh } = useProviderCalendar(
    from,
    to,
  );

  const visible = useMemo(
    () => (filters.length === 0 ? events : events.filter((e) => filters.includes(filterKeyFor(e.status)))),
    [events, filters],
  );

  const rangeLabel = useMemo(() => {
    if (isMobile) return `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
    if (effectiveView === "month") return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (effectiveView === "day") return fmtRangeLabel(anchor, anchor);
    const ws = startOfWeek(anchor);
    return fmtRangeLabel(ws, addDays(ws, 6));
  }, [anchor, effectiveView, isMobile, selectedDate]);

  const step = effectiveView === "month" ? 0 : effectiveView === "day" ? 1 : 7;
  const shift = (dir: 1 | -1) =>
    setAnchor((prev) =>
      step === 0
        ? new Date(prev.getFullYear(), prev.getMonth() + dir, 1)
        : addDays(prev, dir * step),
    );

  function toggleFilter(key: CalendarFilterKey) {
    setFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const pendingCount = events.filter((e) => e.status === "pending").length;

  return (
    <DashboardLayout role="provider" title="Kalender" showBack backTo="/provider-dashboard">
      <AppErrorBoundary>
        <div className="space-y-4">
          <CalendarToolbar
            view={effectiveView}
            onViewChange={setView}
            rangeLabel={rangeLabel}
            timezone={timezone}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            onToday={() => {
              const today = startOfDay(new Date());
              setAnchor(today);
              setSelectedDate(today);
            }}
            filters={filters}
            onToggleFilter={toggleFilter}
            onResetFilters={() => setFilters([])}
            onBlockTime={() => setBlockOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {pendingCount > 0 && (
            <p
              className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground"
              aria-live="polite"
            >
              Du har {pendingCount} booking{pendingCount === 1 ? "" : "er"} der afventer svar.
            </p>
          )}

          {loading ? (
            <CalendarSkeleton variant={isMobile ? "agenda" : "grid"} />
          ) : error ? (
            <CalendarErrorState message={error} onRetry={() => void refresh()} />
          ) : isMobile ? (
            <MobileAgenda
              anchor={anchor}
              selectedDate={selectedDate}
              events={visible}
              onSelectDate={setSelectedDate}
              onSelectEvent={setSelected}
              onAddWorkingHours={() => setSettingsOpen(true)}
              hasWorkingHours={workingWindows.length > 0}
            />
          ) : effectiveView === "week" ? (
            <WeekView
              weekStart={startOfWeek(anchor)}
              events={visible}
              workingWindows={workingWindows}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              onSelectDay={(d) => {
                setAnchor(d);
                setSelectedDate(d);
                setView("day");
              }}
            />
          ) : effectiveView === "day" ? (
            <DayView
              date={anchor}
              events={visible}
              workingWindows={workingWindows}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              onAddWorkingHours={() => setSettingsOpen(true)}
            />
          ) : (
            <MonthView
              month={anchor}
              events={visible}
              selectedDate={selectedDate}
              onSelectDay={(d) => {
                setAnchor(d);
                setSelectedDate(d);
                setView("day");
              }}
            />
          )}

          <p className="text-xs text-muted-foreground">
            Kundeadresser vises kun som cirka-område indtil du er på vej.
            Aktive filtre: {filters.length === 0 ? "alle" : filters
              .map((f) => ALL_FILTERS.find((x) => x.key === f)?.label)
              .join(", ")}
            .
          </p>
        </div>

        <EventDetailPanel
          event={selected}
          onOpenChange={(open) => !open && setSelected(null)}
          onChanged={() => void refresh()}
        />

        <BlockTimeDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          onSaved={() => void refresh()}
          defaultDate={isMobile ? selectedDate : anchor}
        />

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Kalenderindstillinger</DialogTitle>
              <DialogDescription>
                Arbejdstider, tidszone, blokeret tid og eksterne kalendere.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <ProviderAvailabilityEditor />
              <ICalConnectionsCard />
            </div>
          </DialogContent>
        </Dialog>
      </AppErrorBoundary>
    </DashboardLayout>
  );
}
