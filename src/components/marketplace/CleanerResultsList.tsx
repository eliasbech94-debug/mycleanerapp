import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star, MapPin, Heart, ShieldCheck, ArrowRight, User as UserIcon } from "lucide-react";
import { MarketplaceProvider } from "@/hooks/useMarketplaceProviders";
import { useFavoriteProviders } from "@/hooks/useFavoriteProviders";

/**
 * Public homepage provider preview list. Presentation-only: consumes rows
 * from useMarketplaceProviders and delegates favorite state to the shared
 * useFavoriteProviders hook. No RPC calls happen inside this component.
 */
export function CleanerResultsList({
  providers,
  loading,
  emptyLabel,
}: {
  providers: MarketplaceProvider[] | null;
  loading: boolean;
  emptyLabel?: string;
}) {
  const { t } = useTranslation("marketplace");
  const fav = useFavoriteProviders();

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-[28px] tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[34px]">
            {t("results.heading", "Top rated cleaners near you")}
          </h2>
          <p className="mt-1 text-[14px] text-[hsl(var(--mkt-ink-muted))]">
            {t("results.subtitle", "Verified professionals. Real reviews. Book with confidence.")}
          </p>
        </div>
        <Link
          to="/marketplace"
          className="group inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--mkt-border-strong))] bg-[hsl(var(--mkt-surface))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--mkt-ink))] transition hover:border-[hsl(var(--mkt-brand))] hover:text-[hsl(var(--mkt-brand))]"
        >
          {t("results.see_all", "See all cleaners")}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div
        aria-live="polite"
        aria-busy={loading}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {loading && (!providers || providers.length === 0)
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : (providers ?? []).length === 0
          ? (
            <div className="col-span-full rounded-2xl border border-dashed border-[hsl(var(--mkt-border-strong))] bg-[hsl(var(--mkt-surface))] p-10 text-center text-[14px] text-[hsl(var(--mkt-ink-muted))]">
              {t("results.empty", { defaultValue: "No cleaners yet in {{area}}. Try another area.", area: emptyLabel ?? t("results.empty_area", "your area") })}
            </div>
          )
          : (providers ?? []).slice(0, 8).map((p) => (
            <ProviderCard
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

function ProviderCard({ p, isFav, onToggleFav, pending }: { p: MarketplaceProvider; isFav: boolean; onToggleFav: () => void; pending: boolean }) {
  const { t } = useTranslation("marketplace");
  const distance = p.service_radius_km != null
    ? t("card.radius", { defaultValue: "within {{km}} km", km: p.service_radius_km })
    : null;
  return (
    <article className="group overflow-hidden rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] transition hover:-translate-y-0.5 hover:border-[hsl(var(--mkt-brand))]/40 hover:shadow-[var(--mkt-shadow-lift)]">
      <div className="relative aspect-[4/3] bg-[hsl(var(--mkt-surface-muted))]">
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt={t("card.avatar_alt", { defaultValue: "{{name}} profile photo", name: p.display_name })}
            className="h-full w-full object-cover"
            loading="lazy"
            width={320}
            height={240}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[hsl(var(--mkt-ink-soft))]">
            <UserIcon className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        <button
          type="button"
          onClick={onToggleFav}
          disabled={pending}
          aria-pressed={isFav}
          aria-label={isFav ? t("card.remove_fav", "Remove from favorites") : t("card.add_fav", "Add to favorites")}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--mkt-surface))]/95 shadow-sm backdrop-blur transition hover:bg-[hsl(var(--mkt-surface))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] disabled:opacity-60"
        >
          <Heart className={`h-4 w-4 ${isFav ? "fill-[hsl(0_84%_58%)] text-[hsl(0_84%_58%)]" : "text-[hsl(var(--mkt-ink-muted))]"}`} />
        </button>
        {p.identity_verified_badge && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--mkt-surface))]/95 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--mkt-success))] shadow-sm">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" /> {t("card.verified", "Verified")}
          </span>
        )}
      </div>
      <Link to={`/p/${p.provider_slug}?src=marketplace_pick`} className="block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))]">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-semibold leading-tight text-[hsl(var(--mkt-ink))] group-hover:text-[hsl(var(--mkt-brand))]">{p.display_name}</h3>
          {p.average_rating > 0 && (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[hsl(var(--mkt-ink))]">
              <Star className="h-3.5 w-3.5 fill-[hsl(var(--mkt-star))] text-[hsl(var(--mkt-star))]" aria-hidden="true" />
              {p.average_rating.toFixed(1)}
              <span className="font-normal text-[hsl(var(--mkt-ink-soft))]">({p.total_reviews})</span>
            </span>
          )}
        </div>
        {p.public_bio && (
          <p className="mt-1 line-clamp-2 text-[13px] text-[hsl(var(--mkt-ink-muted))]">{p.public_bio}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[hsl(var(--mkt-ink-soft))]">
          {p.country_code && (
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{p.country_code}{distance ? ` · ${distance}` : ""}</span>
          )}
          {p.completed_bookings > 0 && (
            <span>{t("card.completed", { defaultValue: "{{n}} bookings", n: p.completed_bookings })}</span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-[hsl(var(--mkt-border))] pt-3">
          <span className="text-[12px] text-[hsl(var(--mkt-ink-soft))]">
            {t("card.price_note", "Price calculated during booking")}
          </span>
          <span className="text-[13px] font-semibold text-[hsl(var(--mkt-brand))]">{t("card.view", "View profile")}</span>
        </div>
      </Link>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]">
      <div className="aspect-[4/3] animate-pulse bg-[hsl(var(--mkt-surface-muted))]" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
        <div className="h-3 w-full animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
      </div>
    </div>
  );
}
