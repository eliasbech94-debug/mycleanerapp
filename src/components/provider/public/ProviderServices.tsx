/** Services & prices — one card per actively offered service, straight from the DB. */
import { Sparkles } from "lucide-react";
import type { PublicProviderProfile, Slot } from "./types";
import { serviceLabel } from "./format";
import {
  activeServices,
  minDurationLabel,
  priceLabel,
  startPriceLabel,
  surchargeLabel,
} from "./servicePricing";

function nextSlotLabel(slot: Slot | null | undefined): string | null {
  if (!slot) return null;
  const d = new Date(slot.slot_date);
  if (Number.isNaN(d.getTime())) return null;
  return `Næste ledige: ${d.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" })} kl. ${String(slot.slot_hour).padStart(2, "0")}:00`;
}

export function ProviderServices({
  profile,
  nextSlot,
}: {
  profile: PublicProviderProfile;
  nextSlot?: Slot | null;
}) {
  const services = activeServices(profile.services);
  if (services.length === 0) return null;
  const nextLabel = nextSlotLabel(nextSlot);

  return (
    <section data-testid="provider-services" className="space-y-3">
      <h2 className="text-xl font-bold text-[hsl(224_72%_18%)]">Ydelser og priser</h2>
      {/* Mobile: horizontal snap carousel (matches the app reference).
          >=640px: responsive grid. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:gap-4 2xl:grid-cols-4">
        {services.map((s) => {
          const minDuration = minDurationLabel(s);
          const startPrice = startPriceLabel(s);
          return (
            <article
              key={s.service_code}
              className="flex w-[15.5rem] shrink-0 snap-start flex-col gap-1.5 rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)] sm:w-auto sm:min-w-0 sm:shrink"
            >
              <Sparkles className="h-5 w-5 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <h3 className="break-words text-base font-semibold text-[hsl(224_72%_18%)]">
                {serviceLabel(s.service_code)}
              </h3>
              <p className="break-words text-lg font-bold text-[hsl(222_88%_42%)]">{priceLabel(s)}</p>
              {minDuration && <p className="text-xs text-[hsl(224_20%_45%)]">{minDuration}</p>}
              {startPrice && (
                <p className="text-sm font-semibold text-[hsl(224_72%_18%)]">{startPrice}</p>
              )}
              {s.description && (
                <p className="break-words text-xs leading-relaxed text-[hsl(224_20%_45%)]">
                  {s.description}
                </p>
              )}
              {s.surcharges.length > 0 && (
                <ul className="mt-0.5 space-y-0.5 text-xs text-[hsl(224_20%_45%)]">
                  {s.surcharges.map((sc, i) => (
                    <li key={`${sc.label}-${i}`} className="break-words">
                      {surchargeLabel(sc, s.currency)}
                    </li>
                  ))}
                </ul>
              )}
              {nextLabel && (
                <p className="mt-auto pt-1.5 text-xs font-medium text-emerald-600">{nextLabel}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default ProviderServices;
