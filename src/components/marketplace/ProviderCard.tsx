/**
 * ProviderCard — the single provider card used across marketplace surfaces
 * (homepage carousel, demo rails, marketplace grid).
 *
 * Presentation only: it renders data it is given (existing demo fixtures or
 * the live `search_marketplace_providers_v1` rows). No fetching, no writes.
 */
import { Link } from "react-router-dom";
import { Heart, MapPin, ShieldCheck, Star, Trophy, Zap } from "lucide-react";
import { formatMoney, marketByCode, NEUTRAL_MARKET } from "@/lib/markets";
import type { MarketplaceProvider } from "@/hooks/useMarketplaceProviders";

export type ProviderCardData = Partial<MarketplaceProvider> & {
  provider_slug: string;
  display_name: string;
  /** Optional presentation extras available on demo fixtures. */
  city?: string | null;
  services?: string[] | null;
  online?: boolean | null;
};

export type ProviderCardProps = {
  provider: ProviderCardData;
  /** Target profile URL. Defaults to the public profile route. */
  to?: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  className?: string;
};

const SERVICE_LABELS: Record<string, string> = {
  cleaning: "Rengøring",
  handyman: "Handyman",
  garden: "Havearbejde",
  moving: "Flyttehjælp",
};

function serviceLabel(s: string) {
  return SERVICE_LABELS[s] ?? s;
}

export function ProviderCard({
  provider: p,
  to,
  isFavorite = false,
  onToggleFavorite,
  className = "",
}: ProviderCardProps) {
  const market = marketByCode(p.country_code ?? undefined) ?? NEUTRAL_MARKET;
  const services = (p.services?.length ? p.services : p.service_categories) ?? [];
  const shown = services.slice(0, 3);
  const rest = Math.max(0, services.length - shown.length);
  const rating = typeof p.average_rating === "number" && p.average_rating > 0 ? p.average_rating : null;
  const href = to ?? `/p/${p.provider_slug}?src=marketplace_pick`;
  const location = p.city || p.country_code || null;

  return (
    <article
      className={`group relative h-full overflow-hidden rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_36px_-18px_rgba(16,24,40,0.35)] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none ${className}`}
    >
      <Link
        to={href}
        className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
        style={{ WebkitTapHighlightColor: "transparent" }}
        aria-label={`${p.display_name} — se profil`}
      >
        {/* Photo — identical square crop on every profile so the whole face shows. */}
        <div className="relative m-2.5 mb-0 aspect-square overflow-hidden rounded-2xl bg-[hsl(var(--mkt-brand-soft))]">
          {p.avatar_url ? (
            <img
              src={p.avatar_url}
              alt={`Profilbillede af ${p.display_name}`}
              loading="lazy"
              className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transform-none"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[26px] font-semibold text-[hsl(var(--mkt-brand))]">
              {p.display_name.slice(0, 1)}
            </div>
          )}

          <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
            {p.identity_verified_badge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--mkt-surface))]/92 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--mkt-brand))] shadow-sm backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Verificeret
              </span>
            )}
            {p.online && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--mkt-surface))]/92 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--mkt-ink))] shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(142_71%_40%)]" aria-hidden />
                Online
              </span>
            )}
          </div>

          {rating !== null && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--mkt-surface))]/92 px-2 py-1 text-[11.5px] font-semibold text-[hsl(var(--mkt-ink))] shadow-sm backdrop-blur">
              <Star className="h-3.5 w-3.5 fill-current text-[hsl(var(--mkt-star,38_92%_50%))]" aria-hidden />
              {rating.toFixed(1)}
              {p.total_reviews ? (
                <span className="font-normal text-[hsl(var(--mkt-ink-muted))]">({p.total_reviews})</span>
              ) : null}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-3.5">
          <div>
            <h3 className="text-[15.5px] font-semibold leading-snug text-[hsl(var(--mkt-ink))] [overflow-wrap:anywhere]">
              {p.display_name}
            </h3>
            {location && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="line-clamp-1">{location}</span>
              </p>
            )}
          </div>

          {shown.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {shown.map((s) => (
                <span
                  key={s}
                  className="rounded-lg border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface-muted,var(--mkt-brand-soft)))] px-2 py-0.5 text-[11.5px] font-medium text-[hsl(var(--mkt-ink-muted))]"
                >
                  {serviceLabel(s)}
                </span>
              ))}
              {rest > 0 && (
                <span className="rounded-lg px-1.5 py-0.5 text-[11.5px] font-semibold text-[hsl(var(--mkt-brand))]">
                  +{rest} flere
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[hsl(var(--mkt-ink-muted))]">
            {typeof p.completed_bookings === "number" && p.completed_bookings > 0 && (
              <span className="inline-flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                {p.completed_bookings} opgaver
              </span>
            )}
            {typeof p.avg_response_minutes === "number" && p.avg_response_minutes > 0 && (
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" aria-hidden />
                Svarer ~{p.avg_response_minutes} min
              </span>
            )}
          </div>

          <div className="mt-auto flex items-end justify-between gap-2 border-t border-[hsl(var(--mkt-border))] pt-2.5">
            <div className="min-w-0">
              {typeof p.price_from === "number" && p.price_from > 0 ? (
                <>
                  <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--mkt-ink-muted))]">Fra</span>
                  <div className="text-[15px] font-semibold leading-tight text-[hsl(var(--mkt-ink))]">
                    {formatMoney(p.price_from, market)}
                    <span className="text-[12px] font-normal text-[hsl(var(--mkt-ink-muted))]">/time</span>
                  </div>
                </>
              ) : (
                <span className="text-[13px] font-medium text-[hsl(var(--mkt-ink-muted))]">Se profil for pris</span>
              )}
            </div>
            <span className="shrink-0 rounded-xl bg-[hsl(var(--mkt-brand))] px-3 py-1.5 text-[12.5px] font-semibold text-[hsl(var(--mkt-brand-on,0_0%_100%))] transition-colors group-hover:bg-[hsl(var(--mkt-brand-hover,var(--mkt-brand)))]">
              Se profil
            </span>
          </div>
        </div>
      </Link>

      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "Fjern favorit" : "Tilføj til favoritter"}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--mkt-surface))]/92 text-[hsl(var(--mkt-ink))] shadow-sm backdrop-blur transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))]"
        >
          <Heart className={`h-4 w-4 ${isFavorite ? "fill-[hsl(0_84%_58%)] text-[hsl(0_84%_58%)]" : ""}`} />
        </button>
      )}
    </article>
  );
}

export default ProviderCard;
