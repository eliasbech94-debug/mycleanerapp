import { Link } from "react-router-dom";
import { DEMO_MODE } from "@/data/demo";
import { useDemoMarketplace } from "@/hooks/useDemoMarketplace";
import { CompactProviderCard } from "@/components/marketplace/CompactProviderCard";

/**
 * Homepage rails — development / preview only.
 *
 * Simplification pass: only three rails render here (Top Rated, Most Booked,
 * New on MyCleaner). Together with the "Recommended near you" list rendered
 * above them the homepage never shows more than four provider rails.
 *
 * Deduplication rules:
 *  - a provider appears in at most TWO rails in total (the primary list above
 *    counts as one via `primarySlugs`)
 *  - never twice inside the same rail
 * If a rail runs out of eligible providers it simply shows fewer cards.
 */
const RAIL_IDS = ["top_rated", "most_booked", "new_this_week"] as const;
const MAX_RAILS_PER_PROVIDER = 2;
const CARDS_PER_RAIL = 6;

export default function DemoCollectionRails({ primarySlugs = [] }: { primarySlugs?: string[] }) {
  const { collections } = useDemoMarketplace(12);

  if (!DEMO_MODE || collections.length === 0) return null;

  const usage = new Map<string, number>();
  primarySlugs.forEach((slug) => usage.set(slug, 1));

  const rails = RAIL_IDS.map((id) => collections.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((collection) => {
      const seen = new Set<string>();
      const providers = collection.providers
        .filter((p) => {
          if (seen.has(p.provider_slug)) return false;
          if ((usage.get(p.provider_slug) ?? 0) >= MAX_RAILS_PER_PROVIDER) return false;
          seen.add(p.provider_slug);
          return true;
        })
        .slice(0, CARDS_PER_RAIL);
      providers.forEach((p) => usage.set(p.provider_slug, (usage.get(p.provider_slug) ?? 0) + 1));
      return { ...collection, providers };
    })
    .filter((c) => c.providers.length > 0);

  if (rails.length === 0) return null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-14 px-5 pb-20 pt-6 lg:px-8 lg:pt-10">
      {rails.map((collection) => (
        <section key={collection.id} aria-label={collection.title}>
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 className="text-[19px] font-semibold tracking-tight text-[hsl(var(--mkt-ink))] lg:text-[22px]">
              {collection.title}
            </h2>
            <Link
              to="/marketplace"
              className="shrink-0 text-[13.5px] font-semibold text-[hsl(var(--mkt-brand))] hover:underline"
            >
              Se alle
            </Link>
          </div>

          <ul className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
            {collection.providers.slice(0, CARDS_PER_RAIL).map((p, i) => (
              <li
                key={`${collection.id}-${p.provider_slug}`}
                className={`w-[220px] shrink-0 snap-start lg:w-auto ${i >= 4 ? "lg:hidden" : ""}`}
              >
                <CompactProviderCard provider={p} to={`/p/${p.provider_slug}?src=marketplace_pick`} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
