import { CalendarPlus, ChevronLeft, ChevronRight, Globe, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarFilters } from "./CalendarFilters";
import type { CalendarFilterKey } from "../useProviderCalendar";

export type CalendarView = "week" | "day" | "month";

/**
 * Calendar header: view switcher, range navigation, timezone indicator,
 * filters and the primary "block time" action.
 */
export function CalendarToolbar({
  view,
  onViewChange,
  rangeLabel,
  timezone,
  onPrev,
  onNext,
  onToday,
  filters,
  onToggleFilter,
  onResetFilters,
  onBlockTime,
  onOpenSettings,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  rangeLabel: string;
  timezone: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  filters: CalendarFilterKey[];
  onToggleFilter: (key: CalendarFilterKey) => void;
  onResetFilters: () => void;
  onBlockTime: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={onPrev}
            aria-label="Forrige periode"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={onNext}
            aria-label="Næste periode"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <Button variant="outline" className="min-h-[44px]" onClick={onToday}>
          I dag
        </Button>
        <div className="min-w-0">
          <p
            className="truncate font-display text-base text-foreground sm:text-lg"
            aria-live="polite"
            data-testid="calendar-range-label"
          >
            {rangeLabel}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" aria-hidden="true" />
            {timezone}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => onViewChange(v as CalendarView)}>
          <TabsList aria-label="Kalendervisning">
            <TabsTrigger value="week" className="min-h-[40px] px-3">
              Uge
            </TabsTrigger>
            <TabsTrigger value="day" className="min-h-[40px] px-3">
              Dag
            </TabsTrigger>
            <TabsTrigger value="month" className="min-h-[40px] px-3">
              Måned
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <CalendarFilters active={filters} onToggle={onToggleFilter} onReset={onResetFilters} />
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={onOpenSettings}
          aria-label="Kalenderindstillinger"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button className="min-h-[44px]" onClick={onBlockTime}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Bloker tid
        </Button>
      </div>
    </div>
  );
}

export default CalendarToolbar;
