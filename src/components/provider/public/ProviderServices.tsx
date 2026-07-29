/** Services & prices — one card per actively offered service, straight from the DB. */
import { Sparkles } from "lucide-react";
import type { PublicProviderProfile } from "./types";
import { serviceLabel } from "./format";
import { activeServices, minDurationLabel, priceLabel, surchargeLabel } from "./servicePricing";

export function ProviderServices({ profile }: { profile: PublicProviderProfile }) {
  const services = activeServices(profile.services);
  if (services.length === 0) return null;

  return (
    <section data-testid="provider-services" className="space-y-3">
      <h2 className="text-xl font-bold text-[hsl(224_72%_18%)]">Ydelser og priser</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const minDuration = minDurationLabel(s);
          return (
            <article
              key={s.service_code}
              className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)]"
            >
              <Sparkles className="h-5 w-5 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <h3 className="break-words text-base font-semibold text-[hsl(224_72%_18%)]">
                {serviceLabel(s.service_code)}
              </h3>
              <p className="break-words text-lg font-bold text-[hsl(222_88%_42%)]">{priceLabel(s)}</p>
              {minDuration && <p className="text-xs text-[hsl(224_20%_45%)]">{minDuration}</p>}
              {s.surcharges.length > 0 && (
                <ul className="mt-0.5 space-y-0.5 text-xs text-[hsl(224_20%_45%)]">
                  {s.surcharges.map((sc, i) => (
                    <li key={`${sc.label}-${i}`} className="break-words">
                      {surchargeLabel(sc, s.currency)}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default ProviderServices;
