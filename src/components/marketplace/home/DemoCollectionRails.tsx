import { Link } from "react-router-dom";
import { Star, Clock, Heart } from "lucide-react";
import { DEMO_MODE, getDemoFavoriteCount, hasDemoVideoIntro } from "@/data/demo";
import { useDemoMarketplace } from "@/hooks/useDemoMarketplace";
import { formatMoney } from "@/lib/markets";

/**
 * Homepage demo rails — development / preview only.
 *
 * Renders the fixture-derived collections (Featured, Most Booked, Top Rated,
 * Fast Response, New This Week, Recently Reviewed, Recommended Near You) plus
 * trending services, so the homepage never looks empty during development.
 */
export default function DemoCollectionRails() {
  const { collections, trendingServices, scenario } = useDemoMarketplace(8);

  if (!DEMO_MODE || collections.length === 0) return null;

  return (
    <section
      aria-label="Demo marketplace-samlinger"
      className="mx-auto max-w-[1400px] space-y-9 px-5 pb-10 pt-4 lg:px-8"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface-muted))] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[hsl(var(--mkt-ink-muted))]">
          Demo · {scenario.label}
        </span>
      </div>

      {collections.map((collection) => (
        <div key={collection.id}>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-[hsl(var(--mkt-ink))]">{collection.title}</h2>
              <p className="text-[13px] text-[hsl(var(--mkt-ink-muted))]">{collection.subtitle}</p>
            </div>
            <Link
              to="/marketplace"
              className="shrink-0 text-[13.5px] font-semibold text-[hsl(var(--mkt-brand))] hover:underline"
            >
              Se alle
            </Link>
          </div>

          <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
            {collection.providers.map((p) => (
              <li key={`${collection.id}-${p.provider_slug}`} className="w-[240px] shrink-0 snap-start">
                <Link
                  to={`/cleaner/${p.provider_slug}`}
                  className="flex h-full flex-col gap-2 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-3 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={p.avatar_url ?? ""}
                      alt={`Profilbillede af ${p.display_name}`}
                      loading="lazy"
                      className="h-11 w-11 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[hsl(var(--mkt-ink))]">
                        {p.display_name}
                      </p>
                      <p className="truncate text-[12px] text-[hsl(var(--mkt-ink-muted))]">{p.city}</p>
                    </div>
                  </div>

                  <p className="line-clamp-2 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">{p.public_bio}</p>

                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[hsl(var(--mkt-ink-muted))]">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-current text-[hsl(var(--mkt-brand))]" aria-hidden />
                      {p.average_rating.toFixed(1)} ({p.total_reviews})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {p.avg_response_minutes} min
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" aria-hidden />
                      {getDemoFavoriteCount(p.provider_slug)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[hsl(var(--mkt-ink))]">
                      {formatMoney((p.price_from ?? 0) * 100, p.country_code ?? "DK")}
                    </span>
                    {hasDemoVideoIntro(p.provider_slug) && (
                      <span className="rounded-full bg-[hsl(var(--mkt-surface-muted))] px-2 py-0.5 text-[10.5px] font-medium text-[hsl(var(--mkt-ink-muted))]">
                        🎥 Video Introduction
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {trendingServices.length > 0 && (
        <div>
          <h2 className="mb-3 text-[18px] font-semibold text-[hsl(var(--mkt-ink))]">Trending services</h2>
          <ul className="flex flex-wrap gap-2">
            {trendingServices.map((s) => (
              <li
                key={s.service}
                className="rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-3 py-1.5 text-[12.5px] text-[hsl(var(--mkt-ink))]"
              >
                {s.service}
                <span className="ml-2 text-[hsl(var(--mkt-ink-muted))]">
                  {s.bookings_last_7_days} bookinger · {s.change_pct > 0 ? "+" : ""}
                  {s.change_pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
