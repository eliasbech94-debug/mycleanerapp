/** Services & prices — one card per enabled service, straight from the DB. */
import { Sparkles } from "lucide-react";
import type { PublicProviderProfile, PublicProviderService } from "./types";
import { serviceLabel, servicePriceLabel } from "./format";

export function ProviderServices({ profile }: { profile: PublicProviderProfile }) {
  const services: PublicProviderService[] = Array.isArray(profile.services) ? profile.services : [];
  if (services.length === 0) return null;

  return (
    <section data-testid="provider-services" className="space-y-3">
      <h2 className="text-xl font-bold text-[hsl(224_72%_18%)]">Ydelser og priser</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <article
            key={s.service_code}
            className="flex flex-col gap-1.5 rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)]"
          >
            <Sparkles className="h-5 w-5 text-[hsl(222_88%_42%)]" aria-hidden="true" />
            <h3 className="break-words text-base font-semibold text-[hsl(224_72%_18%)]">
              {serviceLabel(s.service_code)}
            </h3>
            <p className="text-lg font-bold text-[hsl(222_88%_42%)]">{servicePriceLabel(s)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ProviderServices;
