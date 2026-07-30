/**
 * CompactProviderCard — the ONE provider card used on the homepage.
 *
 * Deliberately minimal: photo, name, city, rating + review count, starting
 * hourly price and a maximum of ONE badge. No bio, no metadata blocks, no
 * multiple badges. Presentation only — it renders the data it is given.
 *
 * The only other provider card in the product is `ProviderCard`
 * (marketplace/search result card). Do not add a third layout.
 */
import { Link } from "react-router-dom";
import { ShieldCheck, Star, Trophy, CalendarCheck } from "lucide-react";
import { formatMoney, marketByCode, NEUTRAL_MARKET } from "@/lib/markets";
import type { ProviderCardData } from "./ProviderCard";

export type CompactProviderCardProps = {
  provider: ProviderCardData;
  to?: string;
  className?: string;
};

type Badge = { label: string; icon: JSX.Element };

/** Exactly one badge, by priority: Verified → Top Rated → Available Today. */
function pickBadge(p: ProviderCardData): Badge | null {
  if (p.identity_verified_badge) {
    return { label: "Verificeret", icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> };
  }
  if ((p.average_rating ?? 0) >= 4.7 && (p.total_reviews ?? 0) >= 10) {
    return { label: "Top bedømt", icon: <Trophy className="h-3.5 w-3.5" aria-hidden /> };
  }
  if (p.online) {
    return { label: "Ledig i dag", icon: <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> };
  }
  return null;
}

export function CompactProviderCard({ provider: p, to, className = "" }: CompactProviderCardProps) {
  const market = marketByCode(p.country_code ?? undefined) ?? NEUTRAL_MARKET;
  const rating = typeof p.average_rating === "number" && p.average_rating > 0 ? p.average_rating : null;
  const badge = pickBadge(p);
  const location = p.city || p.country_code || null;
  const href = to ?? `/p/${p.provider_slug}?src=marketplace_pick`;

  return (
    <article
      className={`group h-full overflow-hidden rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-22px_rgba(16,24,40,0.4)] motion-reduce:transform-none ${className}`}
    >
      <Link
        to={href}
        aria-label={`${p.display_name} — se profil`}
        className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[hsl(var(--mkt-brand-soft))]">
          {p.avatar_url ? (
            <img
              src={p.avatar_url}
              alt={`Profilbillede af ${p.display_name}`}
              loading="lazy"
              className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[26px] font-semibold text-[hsl(var(--mkt-brand))]">
              {p.display_name.slice(0, 1)}
            </div>
          )}

          {badge && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--mkt-surface))]/92 px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--mkt-ink))] shadow-sm backdrop-blur">
              {badge.icon}
              {badge.label}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="truncate text-[15px] font-semibold leading-snug text-[hsl(var(--mkt-ink))]">
            {p.display_name}
          </h3>

          <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            {rating !== null && (
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-[hsl(var(--mkt-ink))]">
                <Star className="h-3.5 w-3.5 fill-current text-[hsl(var(--mkt-star,38_92%_50%))]" aria-hidden />
                {rating.toFixed(1)}
                {p.total_reviews ? (
                  <span className="font-normal text-[hsl(var(--mkt-ink-muted))]">({p.total_reviews})</span>
                ) : null}
              </span>
            )}
            {rating !== null && location && <span aria-hidden>·</span>}
            {location && <span className="truncate">{location}</span>}
          </div>


          <p className="mt-auto pt-2 text-[13.5px] text-[hsl(var(--mkt-ink-muted))]">
            {typeof p.price_from === "number" && p.price_from > 0 ? (
              <>
                <span className="font-semibold text-[hsl(var(--mkt-ink))]">
                  {formatMoney(p.price_from, market)}
                </span>{" "}
                /time
              </>
            ) : (
              "Se profil for pris"
            )}
          </p>
        </div>
      </Link>
    </article>
  );
}

export default CompactProviderCard;
