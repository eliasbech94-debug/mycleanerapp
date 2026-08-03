import { Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_FILTERS, type CalendarFilterKey } from "../useProviderCalendar";

/**
 * Calendar filters. Purely client-side presentation — filters never mutate
 * server state and never change what the server considers available.
 */
export function CalendarFilters({
  active,
  onToggle,
  onReset,
}: {
  active: CalendarFilterKey[];
  onToggle: (key: CalendarFilterKey) => void;
  onReset: () => void;
}) {
  const allOn = active.length === ALL_FILTERS.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-h-[44px]" aria-label="Filtrér kalenderen">
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Filtre</span>
          {!allOn && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {active.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Vis i kalenderen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_FILTERS.map((f) => (
          <DropdownMenuCheckboxItem
            key={f.key}
            checked={active.includes(f.key)}
            onCheckedChange={() => onToggle(f.key)}
          >
            {f.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <button
          type="button"
          onClick={onReset}
          className="flex w-full min-h-[44px] items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent/10"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Nulstil filtre
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default CalendarFilters;
