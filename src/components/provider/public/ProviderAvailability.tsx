/** Availability — real bookable slots only (bookings, blocks, vacation, iCal respected). */
import { BellRing, CalendarPlus, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Slot } from "./types";

type Props = {
  slots: Slot[] | null;
  nextSlot: Slot | null;
  providerName: string;
  onPick: (date: string, slot: string) => void;
  onRequestOther: () => void;
  onNotify: () => void;
  notifyRequested: boolean;
  onSeeAlternatives: () => void;
};

export function ProviderAvailability({
  slots, nextSlot, providerName, onPick, onRequestOther, onNotify, notifyRequested, onSeeAlternatives,
}: Props) {
  const byDay = new Map<string, number[]>();
  (slots ?? []).forEach((s) => {
    const arr = byDay.get(s.slot_date) ?? [];
    arr.push(s.slot_hour);
    byDay.set(s.slot_date, arr);
  });
  const days = Array.from(byDay.entries());

  return (
    <section data-testid="provider-availability" className="space-y-3">
      <h2 className="text-xl font-bold text-[hsl(224_72%_18%)]">Tilgængelighed</h2>

      {slots === null && (
        <p className="inline-flex items-center gap-2 text-sm text-[hsl(224_20%_45%)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Henter ledige tider…
        </p>
      )}

      {slots !== null && days.length > 0 && (
        <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
          {days.slice(0, 10).map(([day, hours]) => (
            <div
              key={day}
              className="min-w-[9.5rem] shrink-0 snap-start rounded-2xl bg-white p-3 ring-1 ring-[hsl(222_60%_92%)]"
            >
              <div className="text-xs capitalize text-[hsl(224_20%_45%)]">
                {new Date(day).toLocaleDateString("da-DK", { weekday: "long" })}
              </div>
              <div className="text-base font-semibold text-[hsl(224_72%_18%)]">
                {new Date(day).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {hours.slice(0, 4).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onPick(day, `${String(h).padStart(2, "0")}:00`)}
                    className="rounded-lg border border-[hsl(222_60%_90%)] px-2 py-1 text-xs font-medium text-[hsl(222_88%_42%)] transition hover:bg-[hsl(222_88%_42%)] hover:text-white"
                  >
                    {String(h).padStart(2, "0")}:00
                  </button>
                ))}
                {hours.length > 4 && (
                  <span className="inline-flex items-center gap-0.5 self-center text-xs text-[hsl(224_20%_45%)]">
                    +{hours.length - 4}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {slots !== null && days.length === 0 && (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)]" data-testid="no-slot-fallback">
          <p className="text-sm text-[hsl(224_20%_45%)]">
            {providerName} har ingen ledige tider de næste 14 dage.
          </p>
          {nextSlot && (
            <div className="rounded-xl bg-[hsl(210_60%_97%)] p-3">
              <div className="text-xs uppercase tracking-wide text-[hsl(224_20%_45%)]">Næste ledige tid</div>
              <div className="mt-1 text-base font-semibold text-[hsl(224_72%_18%)]">
                {new Date(nextSlot.slot_date).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" })}
                {" kl. "}
                {String(nextSlot.slot_hour).padStart(2, "0")}:00
              </div>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => onPick(nextSlot.slot_date, `${String(nextSlot.slot_hour).padStart(2, "0")}:00`)}
              >
                Book denne tid
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRequestOther}>
              <CalendarPlus className="mr-2 h-4 w-4" />Anmod om en anden tid
            </Button>
            <Button variant="outline" size="sm" onClick={onNotify} disabled={notifyRequested}>
              <BellRing className="mr-2 h-4 w-4" />
              {notifyRequested ? "Vi giver besked" : "Giv besked ved ny tid"}
            </Button>
          </div>
          <button
            type="button"
            onClick={onSeeAlternatives}
            className="text-xs text-[hsl(224_20%_45%)] underline underline-offset-2 hover:text-[hsl(224_72%_18%)]"
          >
            <Search className="mr-1 inline h-3 w-3" />
            Se andre cleaners i stedet
          </button>
        </div>
      )}
    </section>
  );
}

export default ProviderAvailability;
