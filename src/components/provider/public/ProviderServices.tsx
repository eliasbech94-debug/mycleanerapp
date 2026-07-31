/** Services & prices — one card per actively offered service, straight from the DB. */
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, Sparkles, Wallet } from "lucide-react";
import type { PublicProviderProfile, Slot } from "./types";
import { serviceLabel } from "./format";
import SectionHeading from "./SectionHeading";
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
  onSelect,
}: {
  profile: PublicProviderProfile;
  nextSlot?: Slot | null;
  /** Optional primary action on a service card. Reuses the page's booking entry point. */
  onSelect?: () => void;
}) {
  const { t } = useTranslation("common");
  const services = activeServices(profile.services);
  if (services.length === 0) return null;
  const nextLabel = nextSlotLabel(nextSlot);
  const few = services.length <= 2;

  return (
    <section data-testid="provider-services" className="space-y-4">
      <SectionHeading
        icon={Wallet}
        title={t("ui.servicesAndPrices")}
        tone="emerald"
        subtitle={`${services.length} ${services.length === 1 ? "ydelse" : "ydelser"}`}
      />
      {/* Horizontal snap rail on every breakpoint: ~4–5 cards visible on desktop,
          the rest scroll. Very few services fall back to a simple grid. */}
      <div
        className={
          few
            ? "grid gap-4 sm:grid-cols-2"
            : "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
        }
      >
        {services.map((s) => {
          const minDuration = minDurationLabel(s);
          const startPrice = startPriceLabel(s);
          return (
            <article
              key={s.service_code}
              className={
                "group flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-18px_hsl(224_72%_18%/0.45)] hover:ring-[hsl(222_88%_42%/0.35)] motion-reduce:transform-none motion-reduce:transition-none xl:p-5 " +
                (few
                  ? "min-w-0"
                  : "w-[15.5rem] shrink-0 snap-start sm:w-[16.5rem] xl:w-[17.5rem]")
              }
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(222_88%_42%/0.10)]">
                <Sparkles className="h-[18px] w-[18px] text-[hsl(222_88%_42%)]" aria-hidden="true" />
              </span>
              <h3 className="break-words text-lg font-bold leading-snug tracking-tight text-[hsl(224_72%_18%)]">
                {serviceLabel(s.service_code)}
              </h3>
              <p className="break-words text-2xl font-extrabold leading-tight text-[hsl(222_88%_42%)]">
                {priceLabel(s)}
              </p>
              {minDuration && (
                <p className="inline-flex items-center gap-1.5 text-xs text-[hsl(224_20%_45%)]">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {minDuration}
                </p>
              )}
              {startPrice && (
                <p className="text-sm font-semibold text-[hsl(224_72%_18%)]">{startPrice}</p>
              )}
              {s.description && (
                <p className="line-clamp-3 break-words text-xs leading-relaxed text-[hsl(224_20%_45%)]">
                  {s.description}
                </p>
              )}
              {s.surcharges.length > 0 && (
                <ul className="space-y-0.5 text-xs text-[hsl(224_20%_45%)]">
                  {s.surcharges.map((sc, i) => (
                    <li key={`${sc.label}-${i}`} className="break-words">
                      {surchargeLabel(sc, s.currency)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto space-y-2 pt-2">
                {nextLabel && (
                  <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
                    {nextLabel}
                  </p>
                )}
                {onSelect && (
                  <button
                    type="button"
                    onClick={onSelect}
                    aria-label={`Book ${serviceLabel(s.service_code)}`}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[hsl(222_88%_42%)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[hsl(222_88%_36%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                  >
                    Book denne ydelse
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default ProviderServices;
