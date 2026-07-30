import type { MarketplaceProvider, MarketplaceQuery } from "@/hooks/useMarketplaceProviders";
import { DEMO_PROVIDER_FIXTURES, type DemoProvider } from "./providers";
import { getDemoScenario } from "./scenarios";
import { buildDemoCollections, buildDemoTrendingServices, type DemoCollection } from "./collections";

export type { DemoProvider, DemoBadge } from "./providers";
export * from "./scenarios";
export * from "./customers";
export * from "./reviews";
export * from "./bookings";
export * from "./conversations";
export * from "./activity";
export * from "./collections";


/**
 * DEMO_MODE — the single gate for the development demo dataset.
 *
 * True only in a Vite dev/preview build, or when the build explicitly defines
 * `VITE_DEMO_MODE="true"` / `VITE_ENABLE_DEMO_PROVIDERS="true"` (used for
 * preview deployments). Production builds evaluate this to `false`, which
 * leaves every demo array empty and every helper a no-op — the app behaves
 * exactly as it does today.
 *
 * The demo layer is read-only local fixture data: no network requests, no
 * database access, no writes, and therefore no RLS surface at all.
 */
/** Hostnames that always serve real production data. */
const PRODUCTION_HOSTS = ["mycleaner.dk", "www.mycleaner.dk", "mycleanerapp.lovable.app"];

const isPreviewHost = (): boolean => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (PRODUCTION_HOSTS.includes(host)) return false;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return true;
  // Lovable sandbox / preview domains
  if (host.startsWith("id-preview--") || host.endsWith(".lovableproject.com")) return true;
  return false;
};

export function isDemoModeEnabled(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env ?? {};
    if (env.VITE_DEMO_MODE === "false") return false;
    if (env.PROD === true && !isPreviewHost()) return false;
    if (env.DEV === true) return true;
    if (env.VITE_DEMO_MODE === "true") return true;
    if (env.VITE_ENABLE_DEMO_PROVIDERS === "true") return true;
    return isPreviewHost();
  } catch {
    /* noop */
  }
  return false;
}


export const DEMO_MODE = isDemoModeEnabled();

/** Full demo catalogue — empty outside demo mode. */
export const DEMO_PROVIDERS_ALL: DemoProvider[] = DEMO_MODE ? DEMO_PROVIDER_FIXTURES : [];

/**
 * Scenario-aware view of the catalogue. Scenarios only reshape which fixtures
 * are visible and how "busy" they look — they never mutate the source data.
 */
export function getVisibleDemoProviders(): DemoProvider[] {
  if (!DEMO_MODE) return [];
  const scenario = getDemoScenario();
  let rows = DEMO_PROVIDERS_ALL.filter((p) => {
    if (scenario.premiumOnly && !["pro", "premium"].includes(p.provider_tier ?? "")) return false;
    if (p.average_rating < scenario.minRating) return false;
    return true;
  });

  const keep = Math.max(3, Math.round(rows.length * scenario.providerShare));
  rows = rows.slice(0, keep);

  if (scenario.activityMultiplier === 1 && !scenario.fresh) return rows;

  return rows.map((p) => ({
    ...p,
    total_reviews: Math.max(scenario.fresh ? 0 : 1, Math.round(p.total_reviews * scenario.activityMultiplier)),
    completed_bookings: Math.max(
      0,
      Math.round((p.completed_bookings ?? 0) * scenario.activityMultiplier),
    ),
    average_rating: scenario.fresh && p.total_reviews * scenario.activityMultiplier < 1 ? 0 : p.average_rating,
  }));
}

export const isDemoProviderSlug = (slug: string) => slug.startsWith("demo-");

export const getDemoProvider = (slug: string): DemoProvider | null =>
  DEMO_PROVIDERS_ALL.find((p) => p.provider_slug === slug) ?? null;

/** Homepage collections built from the currently visible fixtures. */
export const getDemoCollections = (limit = 8): DemoCollection[] =>
  DEMO_MODE ? buildDemoCollections(getVisibleDemoProviders(), limit) : [];

export const getDemoTrendingServices = () => (DEMO_MODE ? buildDemoTrendingServices() : []);

/** True when a provider's calendar should render as fully booked. */
export const isDemoFullyBooked = () => DEMO_MODE && getDemoScenario().fullyBooked;


const rate = (p: DemoProvider) => p.price_from ?? 0;

const SORTERS: Record<string, (a: DemoProvider, b: DemoProvider) => number> = {
  score: (a, b) => (b.marketplace_score ?? 0) - (a.marketplace_score ?? 0),
  rating: (a, b) => b.average_rating - a.average_rating,
  reviews: (a, b) => b.total_reviews - a.total_reviews,
  price_asc: (a, b) => rate(a) - rate(b),
  price_desc: (a, b) => rate(b) - rate(a),
  newest: (a, b) => b.member_since.localeCompare(a.member_since),
};

/**
 * Applies the same filter/sort/paging semantics as
 * `search_marketplace_providers_v1`, purely in memory.
 */
export function selectDemoProviders(query: MarketplaceQuery = {}): DemoProvider[] {
  if (!DEMO_MODE) return [];
  const search = query.search?.trim().toLowerCase() ?? "";
  // Optional filters some surfaces pass through that the base query type
  // doesn't model yet (rating / availability / experience).
  const extra = query as MarketplaceQuery & {
    minRating?: number;
    availableFrom?: string;
    minYearsExperience?: number;
  };
  let rows = getVisibleDemoProviders().filter((p) => {
    if (query.countryCode && p.country_code !== query.countryCode) return false;
    if (query.serviceCategory && !(p.service_categories ?? []).includes(query.serviceCategory)) return false;
    if (query.language && !p.languages.some((l) => l.toLowerCase().includes(query.language!.toLowerCase())))
      return false;
    if (query.maxHourlyRate != null && rate(p) > query.maxHourlyRate) return false;
    if (query.minTier && query.minTier !== "all" && p.provider_tier !== query.minTier) return false;
    if (extra.minRating != null && p.average_rating < extra.minRating) return false;
    if (extra.availableFrom && isDemoFullyBooked()) return false;
    if (extra.minYearsExperience != null) {
      const years = (Date.now() - new Date(p.member_since).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (years < extra.minYearsExperience) return false;
    }
    if (
      search &&
      !`${p.display_name} ${p.city} ${p.public_bio ?? ""} ${p.services.join(" ")}`.toLowerCase().includes(search)
    )
      return false;
    return true;
  });


  const sorter = SORTERS[query.sort ?? "score"] ?? SORTERS.score;
  rows = [...rows].sort(sorter);

  const total = rows.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 12;
  return rows.slice(offset, offset + limit).map((p) => ({ ...p, total_count: total }));
}

/**
 * Same as `selectDemoProviders`, but guarantees at least `minimum` rows in demo
 * mode by progressively relaxing the narrowest filters (rating/availability →
 * language/price/tier → service category → country). Used by surfaces that must
 * never render an empty state during development, e.g. the homepage rails.
 * Returns `[]` when demo mode is off, so production behaviour is unchanged.
 */
export function selectDemoProvidersWithMinimum(
  query: MarketplaceQuery = {},
  minimum = 4,
): { rows: DemoProvider[]; relaxed: string[] } {
  if (!DEMO_MODE) return { rows: [], relaxed: [] };

  const steps: Array<{ label: string; q: MarketplaceQuery }> = [
    { label: "none", q: query },
    { label: "extras", q: { ...query, minTier: null, language: null, maxHourlyRate: null } },
    { label: "service", q: { ...query, minTier: null, language: null, maxHourlyRate: null, serviceCategory: null } },
    { label: "country", q: { sort: query.sort, limit: query.limit, offset: 0 } },
  ];

  const relaxed: string[] = [];
  let rows: DemoProvider[] = [];
  for (const step of steps) {
    rows = selectDemoProviders(step.q);
    if (step.label !== "none") relaxed.push(step.label);
    if (rows.length >= minimum) break;
  }
  return { rows, relaxed };
}


/**
 * Fallback helper for list surfaces: returns live rows when present, and demo
 * rows only when demo mode is on and the live result would render empty.
 */
export function withDemoFallback<T extends MarketplaceProvider>(
  live: T[] | null | undefined,
  query: MarketplaceQuery = {},
): { rows: (T | DemoProvider)[] | null; isDemo: boolean } {
  if (live && live.length > 0) return { rows: live, isDemo: false };
  if (!DEMO_MODE) return { rows: live ?? null, isDemo: false };
  const demo = selectDemoProviders(query);
  if (demo.length === 0) return { rows: live ?? null, isDemo: false };
  return { rows: demo, isDemo: true };
}

/** Similar / related providers for a given demo or live provider slug. */
export function getRelatedDemoProviders(slug: string, limit = 4): DemoProvider[] {
  if (!DEMO_MODE) return [];
  const base = getDemoProvider(slug);
  return DEMO_PROVIDERS_ALL.filter((p) => p.provider_slug !== slug)
    .sort((a, b) => {
      const aScore = (base && a.country_code === base.country_code ? 2 : 0) + (base && a.city === base.city ? 3 : 0);
      const bScore = (base && b.country_code === base.country_code ? 2 : 0) + (base && b.city === base.city ? 3 : 0);
      return bScore - aScore || (b.marketplace_score ?? 0) - (a.marketplace_score ?? 0);
    })
    .slice(0, limit);
}

/** Three curated profiles for screenshots and marketing material. */
export const DEMO_SHOWCASE_PROVIDERS: DemoProvider[] = DEMO_PROVIDERS_ALL.filter((p) => p.showcase);
