/**
 * MobileSearch — touch-first search screen for /marketplace on viewports < 768px.
 *
 * Presentation only. Reuses:
 *  - useMarketplaceProviders() → same RPC (`search_marketplace_providers_v1`)
 *    used by Marketplace.tsx, Homepage and FindCleaner. No parallel logic.
 *  - useActiveMarket()         → active-market scoping (identical to Marketplace).
 *  - BottomSheet               → filters/sort surface.
 *  - Public /p/:slug           → provider profile flow (guest-safe).
 *
 * Explicit non-features (see Phase 4 constraints):
 *  - No map toggle. FindCleaner’s map is not modular enough to embed without
 *    a refactor; we don’t install new deps or fabricate coords.
 *  - No pull-to-refresh (Phase 4 defers this).
 *  - Never trusts client price calculations — displays `price_from` verbatim
 *    from the RPC.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search as SearchIcon,
  MapPin,
  Star,
  ShieldCheck,
  SlidersHorizontal,
  Loader2,
  X,
  ChevronRight,
} from "lucide-react";
import {
  useMarketplaceProviders,
  type MarketplaceProvider,
  type MarketplaceQuery,
} from "@/hooks/useMarketplaceProviders";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { useAuth } from "@/hooks/useAuth";
import { BottomSheet } from "@/components/layout/BottomSheet";

const PAGE_SIZE = 12;

// Mirrors the sort keys accepted by search_marketplace_providers_v1 (see Marketplace.tsx).
const SORTS = [
  { v: "score", key: "sort.score" },
  { v: "price_asc", key: "sort.price_asc" },
  { v: "price_desc", key: "sort.price_desc" },
  { v: "rating", key: "sort.rating" },
  { v: "response", key: "sort.response" },
] as const;

// MyCleaner is a cleaning-only marketplace. Only "all" and "cleaning" chips
// are exposed here; non-cleaning categories are intentionally omitted.
const CHIP_CATEGORIES = ["all", "cleaning"] as const;

type ChipCategory = (typeof CHIP_CATEGORIES)[number];

export default function MobileSearch() {
  const { t } = useTranslation("marketplace");
  const { user } = useAuth();
  const { market, isNeutral } = useActiveMarket();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ChipCategory>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["v"]>("score");
  const [maxRate, setMaxRate] = useState<string>("");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Reset pagination on any filter change.
  useEffect(() => {
    setPage(0);
  }, [q, category, sort, maxRate, market.code]);

  // Clear cached client presentation when the authenticated user changes.
  useEffect(() => {
    setPage(0);
  }, [user?.id]);

  const query: MarketplaceQuery = useMemo(
    () => ({
      countryCode: isNeutral ? null : market.code,
      serviceCategory: category === "all" ? null : category,
      search: q.trim() || null,
      maxHourlyRate: maxRate ? Number(maxRate) : null,
      sort,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [isNeutral, market.code, category, q, maxRate, sort, page],
  );

  const { data, total, loading, error, refetch } = useMarketplaceProviders(query, {
    realtime: false,
    debounceMs: 250,
  });

  const activeFilters =
    (category !== "all" ? 1 : 0) + (maxRate ? 1 : 0) + (sort !== "score" ? 1 : 0);

  function resetFilters() {
    setCategory("all");
    setMaxRate("");
    setSort("score");
    setQ("");
    setFiltersOpen(false);
  }

  return (
    <div className="pb-6">
      {/* Sticky search field */}
      <div className="sticky top-0 z-30 -mx-0 border-b border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/95 px-4 py-3 backdrop-blur">
        <label className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-bg))] px-3 py-2.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
          <input
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("mobileSearch.placeholder", "Søg efter navn, by eller postnummer")}
            aria-label={t("mobileSearch.aria", "Søg efter Cleaners")}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[hsl(var(--mkt-ink))] placeholder:text-[hsl(var(--mkt-ink-muted))] focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={t("mobileSearch.clear", "Ryd søgning")}
              className="tap-target -mr-1 inline-flex items-center justify-center rounded-full text-[hsl(var(--mkt-ink-muted))]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>

        {/* Horizontally scrollable category chips */}
        <div
          className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none]"
          role="tablist"
          aria-label={t("mobileSearch.chips.aria", "Filtrer kategori")}
        >
          {CHIP_CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c)}
                className={`tap-target whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  active
                    ? "border-[hsl(var(--mkt-brand))] bg-[hsl(var(--mkt-brand))] text-white"
                    : "border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] text-[hsl(var(--mkt-ink))]"
                }`}
              >
                {t(`mobileSearch.chips.${c}`, c === "all" ? "Alle" : c)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="tap-target ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-3.5 py-1.5 text-[13px] font-semibold text-[hsl(var(--mkt-ink))]"
            aria-label={t("mobileSearch.filters.open", "Åbn filtre")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            {t("mobileSearch.filters.label", "Filtre")}
            {activeFilters > 0 && (
              <span
                aria-hidden
                className="ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] px-1 text-[11px] font-bold text-white"
              >
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Result count */}
      <div className="px-4 pt-3 text-[12px] text-[hsl(var(--mkt-ink-muted))]" aria-live="polite">
        {loading
          ? t("mobileSearch.loading_count", "Henter…")
          : error
            ? ""
            : t("mobileSearch.count", "{{n}} Cleaners fundet", { n: total })}
      </div>

      {/* Result list */}
      <div className="mt-2 space-y-3 px-4">
        {loading ? (
          <SkeletonList />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          data.map((p) => <ProviderCard key={p.provider_slug} p={p} />)
        )}
      </div>

      {/* Pagination — reuses limit/offset from the shared RPC. */}
      {!loading && !error && data && data.length > 0 && (
        <Pagination page={page} total={total} onChange={setPage} />
      )}

      <Suspense fallback={null}>
        <FiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          sort={sort}
          setSort={setSort}
          maxRate={maxRate}
          setMaxRate={setMaxRate}
          onReset={resetFilters}
        />
      </Suspense>
    </div>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function ProviderCard({ p }: { p: MarketplaceProvider }) {
  const { t } = useTranslation("marketplace");
  return (
    <Link
      to={`/p/${p.provider_slug}?src=mobile_search`}
      className="tap-target flex gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-3 shadow-[var(--app-shadow-card,0_1px_2px_rgba(0,0,0,0.04))] active:scale-[0.995] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
      aria-label={`${p.display_name} — ${t("card.view", "Se profil")}`}
    >
      <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-[hsl(var(--mkt-brand-soft))]">
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[hsl(var(--mkt-brand))]">
            <SearchIcon className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[15.5px] font-semibold text-[hsl(var(--mkt-ink))]">
            {p.display_name}
          </h3>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
          {p.average_rating > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-current text-[hsl(var(--mkt-brand))]" aria-hidden />
              {p.average_rating.toFixed(1)}
              <span className="opacity-70">({p.total_reviews})</span>
            </span>
          )}
          {p.identity_verified_badge && (
            <span className="inline-flex items-center gap-1 text-[hsl(var(--mkt-brand))]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {t("card.verified", "Verificeret")}
            </span>
          )}
          {p.country_code && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {p.country_code}
              {p.service_radius_km ? ` · ${p.service_radius_km} km` : ""}
            </span>
          )}
        </div>
        {p.public_bio && (
          <p className="mt-1 line-clamp-2 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
            {p.public_bio}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {(p.service_categories ?? []).slice(0, 2).map((c) => (
              <span
                key={c}
                className="rounded-full border border-[hsl(var(--mkt-border))] px-2 py-0.5 text-[11px] capitalize text-[hsl(var(--mkt-ink-muted))]"
              >
                {c}
              </span>
            ))}
          </div>
          {p.price_from !== null && (
            <div className="text-[13px] font-semibold text-[hsl(var(--mkt-ink))]">
              {t("mobileSearch.price_from", "fra {{price}} kr/t", { price: p.price_from })}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function SkeletonList() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex animate-pulse gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-3"
          aria-hidden
        >
          <div className="h-[84px] w-[84px] shrink-0 rounded-xl bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-[hsl(var(--mkt-brand-soft))]" />
            <div className="h-3 w-1/2 rounded bg-[hsl(var(--mkt-brand-soft))]" />
            <div className="h-3 w-full rounded bg-[hsl(var(--mkt-brand-soft))]" />
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation("marketplace");
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 text-center"
    >
      <div className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
        {t("mobileSearch.empty.title", "Ingen Cleaners matcher dine filtre")}
      </div>
      <p className="mt-1 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
        {t("mobileSearch.empty.body", "Prøv at nulstille filtrene eller udvid dit søgeområde.")}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="tap-target mt-4 inline-flex items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] px-5 py-2 text-[13px] font-semibold text-white"
      >
        {t("mobileSearch.empty.reset", "Nulstil filtre")}
      </button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("marketplace");
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 text-center"
    >
      <div className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
        {t("mobileSearch.error.title", "Søgning er midlertidigt utilgængelig")}
      </div>
      <p className="mt-1 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
        {t("mobileSearch.error.body", "Prøv igen om et øjeblik.")}
      </p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="tap-target mt-4 inline-flex items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] px-5 py-2 text-[13px] font-semibold text-white"
      >
        {t("mobileSearch.error.retry", "Prøv igen")}
      </button>
    </div>
  );
}

function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation("marketplace");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-between px-4 text-[13px]">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onChange(Math.max(0, page - 1))}
        className="tap-target rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-4 py-2 font-semibold text-[hsl(var(--mkt-ink))] disabled:opacity-40"
      >
        {t("mobileSearch.pagination.prev", "Forrige")}
      </button>
      <span className="text-[hsl(var(--mkt-ink-muted))]">
        {t("mobileSearch.pagination.pageOf", "Side {{page}} af {{pages}}", {
          page: page + 1,
          pages,
        })}
      </span>
      <button
        type="button"
        disabled={page + 1 >= pages}
        onClick={() => onChange(page + 1)}
        className="tap-target rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-4 py-2 font-semibold text-[hsl(var(--mkt-ink))] disabled:opacity-40"
      >
        {t("mobileSearch.pagination.next", "Næste")}
      </button>
    </div>
  );
}

function FiltersSheet({
  open,
  onOpenChange,
  sort,
  setSort,
  maxRate,
  setMaxRate,
  onReset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sort: string;
  setSort: (v: (typeof SORTS)[number]["v"]) => void;
  maxRate: string;
  setMaxRate: (v: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation("marketplace");
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("mobileSearch.filters.title", "Filtre og sortering")}
      description={t("mobileSearch.filters.description", "Tilpas søgningen")}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="tap-target flex-1 rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-4 py-2.5 text-[14px] font-semibold text-[hsl(var(--mkt-ink))]"
          >
            {t("mobileSearch.filters.reset", "Nulstil")}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="tap-target flex-1 rounded-full bg-[hsl(var(--mkt-brand))] px-4 py-2.5 text-[14px] font-semibold text-white"
          >
            {t("mobileSearch.filters.apply", "Vis resultater")}
          </button>
        </div>
      }
    >
      <div className="space-y-5 py-2">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-[hsl(var(--mkt-ink))]">
            {t("mobileSearch.filters.sortHeading", "Sortering")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => {
              const active = sort === s.v;
              return (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => setSort(s.v)}
                  aria-pressed={active}
                  className={`tap-target rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
                    active
                      ? "border-[hsl(var(--mkt-brand))] bg-[hsl(var(--mkt-brand))] text-white"
                      : "border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] text-[hsl(var(--mkt-ink))]"
                  }`}
                >
                  {t(`mobileSearch.${s.key}`, s.v)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-2 block text-[13px] font-semibold text-[hsl(var(--mkt-ink))]">
            {t("mobileSearch.filters.maxRate", "Maks. timepris")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={maxRate}
            onChange={(e) => setMaxRate(e.target.value)}
            placeholder={t("mobileSearch.filters.maxRatePlaceholder", "Ingen grænse")}
            className="tap-target w-full rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-bg))] px-3.5 py-3 text-[15px] text-[hsl(var(--mkt-ink))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mkt-brand))]"
          />
        </label>
      </div>
    </BottomSheet>
  );
}
