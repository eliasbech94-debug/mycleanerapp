import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star, MapPin, Heart, ShieldCheck, User as UserIcon } from "lucide-react";
import { MarketplaceProvider } from "@/hooks/useMarketplaceProviders";
import { useFavoriteProviders } from "@/hooks/useFavoriteProviders";
import { isDemoProviderSlug } from "@/data/demoProviders";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { formatMoney } from "@/lib/markets";

/**
 * Homepage top-rated cleaners — horizontal-row layout matching the
 * reference: avatar left, name/verified/rating, bio, tags, price and
 * View profile on the right. Presentation only.
 */
export function CleanerResultsList({
  providers,
  loading,
  emptyLabel,
  isDemo = false,
}: {
  providers: MarketplaceProvider[] | null;
  loading: boolean;
  emptyLabel?: string;
  isDemo?: boolean;
}) {
  const { t } = useTranslation("marketplace");
  const fav = useFavoriteProviders();

  return (
    <section className="mx-auto max-w-[1400px] px-5 pt-10 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[18px] font-semibold text-[hsl(var(--mkt-ink))]">
            {t("results.heading", "Top rated cleaners near you")}
          </h2>
          {isDemo && (
            <span className="rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface-muted))] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[hsl(var(--mkt-ink-muted))]">
              {t("results.demo_badge", "Demo")}
            </span>
          )}
        </div>
        <Link
          to="/marketplace"
          className="text-[13.5px] font-semibold text-[hsl(var(--mkt-brand))] hover:underline"
        >
          {t("results.see_all", "View all")}
        </Link>
      </div>

      <div
        aria-live="polite"
        aria-busy={loading}
        className="flex flex-col gap-3"
      >
        {loading && (!providers || providers.length === 0)
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
          : (providers ?? []).length === 0
          ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--mkt-border-strong))] bg-[hsl(var(--mkt-surface))] p-10 text-center text-[14px] text-[hsl(var(--mkt-ink-muted))]">
              {t("results.empty", { defaultValue: "No cleaners yet in {{area}}. Try another area.", area: emptyLabel ?? t("results.empty_area", "your area") })}
            </div>
          )
          : (providers ?? []).slice(0, 6).map((p) => (
            <ProviderRow
              key={p.provider_slug}
              p={p}
              isFav={fav.isFavorite(p.provider_slug)}
              onToggleFav={() => fav.toggle(p.provider_slug)}
              pending={fav.isPending(p.provider_slug)}
            />
          ))}
      </div>
    </section>
  );
}

function ProviderRow({ p, isFav, onToggleFav, pending }: { p: MarketplaceProvider; isFav: boolean; onToggleFav: () => void; pending: boolean }) {
  const { t } = useTranslation("marketplace");
  const { market } = useActiveMarket();
  const distance = p.service_radius_km != null
    ? t("card.radius_km_away", { defaultValue: "{{km}} km away", km: p.service_radius_km })
    : null;

  const priceLabel = p.price_from != null
    ? t("card.price_per_hour", {
        defaultValue: "{{price}} / hour",
        price: formatMoney(p.price_from, market),
      })
    : null;

  const tags = (p.public_bio ?? "")
    .split(/[,•·|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <article className="group relative flex flex-col gap-4 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 transition hover:border-[hsl(var(--mkt-brand))]/40 hover:shadow-[var(--mkt-shadow-lift)] sm:flex-row sm:items-center">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--mkt-surface-muted))] sm:h-20 sm:w-20">
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt={t("card.avatar_alt", { defaultValue: "{{name}} profile photo", name: p.display_name })}
            className="h-full w-full object-cover"
            loading="lazy"
            width={80}
            height={80}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[hsl(var(--mkt-ink-soft))]">
            <UserIcon className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isDemoProviderSlug(p.provider_slug) ? (
            <span className="text-[15.5px] font-semibold text-[hsl(var(--mkt-ink))]">{p.display_name}</span>
          ) : (
            <Link
              to={`/p/${p.provider_slug}?src=marketplace_pick`}
              className="text-[15.5px] font-semibold text-[hsl(var(--mkt-ink))] hover:text-[hsl(var(--mkt-brand))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))]"
            >
              {p.display_name}
            </Link>
          )}
          {p.identity_verified_badge && (
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--mkt-brand))]" aria-label={t("card.verified", "Verified")} />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[hsl(var(--mkt-ink-soft))]">
          {p.average_rating > 0 && (
            <span className="inline-flex items-center gap-1 text-[hsl(var(--mkt-ink))]">
              <Star className="h-3.5 w-3.5 fill-[hsl(var(--mkt-star))] text-[hsl(var(--mkt-star))]" aria-hidden="true" />
              <span className="font-semibold">{p.average_rating.toFixed(1)}</span>
              <span className="text-[hsl(var(--mkt-ink-soft))]">({p.total_reviews})</span>
            </span>
          )}
          {distance && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {distance}
            </span>
          )}
        </div>
        {p.public_bio && (
          <p className="mt-1.5 line-clamp-2 max-w-2xl text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            {p.public_bio}
          </p>
        )}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface-muted))] px-2 py-0.5 text-[11.5px] font-medium text-[hsl(var(--mkt-ink-muted))]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
        <div className="text-right">
          <div className="text-[11.5px] uppercase tracking-wider text-[hsl(var(--mkt-ink-soft))]">
            {t("card.from", "From")}
          </div>
          {priceLabel ? (
            <>
              <div className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
                {formatMoney(p.price_from as number, market)}
              </div>
              <div className="text-[11px] text-[hsl(var(--mkt-ink-soft))]">
                {t("card.per_hour", "per hour")}
              </div>
            </>
          ) : (
            <div className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
              {t("card.price_note_short", "See profile")}
            </div>
          )}
        </div>
        {isDemoProviderSlug(p.provider_slug) ? (
          <span
            aria-disabled="true"
            title={t("card.demo_hint", "Demo profile — sign in to browse real cleaners")}
            className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-[hsl(var(--mkt-brand))]/60 px-4 py-2 text-[13px] font-semibold text-[hsl(var(--mkt-brand-on))]"
          >
            {t("card.view", "View profile")}
          </span>
        ) : (
          <Link
            to={`/p/${p.provider_slug}?src=marketplace_pick`}
            className="inline-flex items-center justify-center rounded-lg bg-[hsl(var(--mkt-brand))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--mkt-brand-on))] transition hover:bg-[hsl(var(--mkt-brand-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
          >
            {t("card.view", "View profile")}
          </Link>
        )}
      </div>

      {!isDemoProviderSlug(p.provider_slug) && (
        <button
          type="button"
          onClick={onToggleFav}
          disabled={pending}
          aria-pressed={isFav}
          aria-label={isFav ? t("card.remove_fav", "Remove from favorites") : t("card.add_fav", "Add to favorites")}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-[hsl(var(--mkt-ink-soft))] transition hover:bg-[hsl(var(--mkt-surface-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] disabled:opacity-60"
        >
          <Heart className={`h-4 w-4 ${isFav ? "fill-[hsl(0_84%_58%)] text-[hsl(0_84%_58%)]" : ""}`} />
        </button>
      )}
    </article>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4">
      <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-[hsl(var(--mkt-surface-muted))]" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
        <div className="h-3 w-64 animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
        <div className="h-3 w-48 animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
      </div>
      <div className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-[hsl(var(--mkt-surface-muted))]" />
    </div>
  );
}
