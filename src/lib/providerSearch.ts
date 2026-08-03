/**
 * Privacy-safe provider geo search.
 *
 * Privacy contract (enforced server-side by
 * `public.search_providers_public_geo_v1`, mirrored here):
 *
 * - `private_provider_address`   — exact residential/business address.
 *                                  NEVER leaves the database.
 * - `public_provider_location`   — city/area, country and ANONYMISED map
 *                                  coordinates (snapped to a ~1 km grid with a
 *                                  stable per-provider offset).
 * - `provider_service_area`      — radius in km the provider accepts work in.
 * - `customer_job_location`      — the point the CUSTOMER selected; all
 *                                  distances are measured from this point.
 *
 * The client never receives street, house number, full legal name or exact
 * residential coordinates, so nothing here can leak them by accident.
 */
import { supabase } from "@/integrations/supabase/client";
// Statically imported: `countryGeo` is already a static dependency of
// ProviderMap/europeShowcase, so a dynamic import here cannot split it into its
// own chunk and only produced a bundler warning.
import { countryMapPoints } from "@/config/countryGeo";

export type JobLocation = { lat: number; lng: number; label?: string };

export type PublicProvider = {
  slug: string | null;
  userId: string;
  /** First name + surname initial. Never the full legal name. */
  displayName: string;
  avatarUrl: string | null;
  countryCode: string;
  /** City / district only — never a street address. */
  publicArea: string | null;
  /** Anonymised area coordinates — never the provider's home. */
  publicLat: number;
  publicLng: number;
  serviceRadiusKm: number;
  /** Distance from the customer-selected job location, in km. */
  distanceKm: number;
  coversLocation: boolean;
  priceFrom: number | null;
  currency: string;
  languages: string[];
  serviceCategories: string[];
  yearsExperience: number | null;
  avgResponseMinutes: number | null;
  verified: boolean;
  rating: number;
  reviews: number;
  completedBookings: number;
  relevance: number;
};

/** Fields that must never appear on a public provider payload. */
export const FORBIDDEN_PUBLIC_FIELDS = [
  "address",
  "street",
  "house_number",
  "full_name",
  "base_address_formatted",
  "base_lat",
  "base_lng",
  "lat",
  "lng",
  "date_of_birth",
  "emergency_contact",
] as const;

/** Great-circle distance in km. */
export function distanceKm(a: JobLocation, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Deterministic anonymisation used for local demo fixtures only — the real
 * values are anonymised in Postgres before they ever reach the browser.
 * Same seed ⇒ same approximate point across visits.
 */
export function anonymizeGeoPoint(lat: number, lng: number, seed: string) {
  const h = (s: string) => {
    let acc = 0;
    for (let i = 0; i < s.length; i += 1) acc = (acc * 31 + s.charCodeAt(i)) >>> 0;
    return acc;
  };
  return {
    lat: Math.round(lat / 0.01) * 0.01 + ((h(seed) % 7) - 3) * 0.0009,
    lng: Math.round(lng / 0.01) * 0.01 + ((h(`lng:${seed}`) % 7) - 3) * 0.0014,
  };
}

/** First name + surname initial. Never the full legal name. */
export function publicDisplayName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Cleaner";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export type RankInput = Pick<
  PublicProvider,
  | "coversLocation"
  | "distanceKm"
  | "rating"
  | "completedBookings"
  | "avgResponseMinutes"
  | "relevance"
> & { availableForSelectedTime?: boolean };

/**
 * Relevance ranking (mirrors the SQL ordering so demo/fallback data sorts
 * identically): availability → service-area coverage → proximity → rating →
 * response time → completed jobs.
 */
export function rankScore(p: RankInput, radiusKm: number) {
  const radius = Math.max(radiusKm, 1);
  return (
    (p.availableForSelectedTime === false ? 0 : 25) +
    (p.coversLocation ? 40 : 0) +
    Math.max(0, 30 - (p.distanceKm * 30) / radius) +
    (p.rating ?? 0) * 2 +
    Math.min(p.completedBookings ?? 0, 50) * 0.2 +
    ((p.avgResponseMinutes ?? 999) <= 60 ? 5 : 0)
  );
}

export function rankProviders<T extends RankInput>(list: T[], radiusKm: number): T[] {
  return [...list].sort(
    (a, b) => rankScore(b, radiusKm) - rankScore(a, radiusKm) || a.distanceKm - b.distanceKm,
  );
}

export type GeoSearchFilters = {
  countryCode?: string | null;
  serviceCategory?: string | null;
  language?: string | null;
  maxHourlyRate?: number | null;
};

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  DK: "DKK",
  SE: "SEK",
  NO: "NOK",
  UK: "GBP",
  GB: "GBP",
  DE: "EUR",
  ES: "EUR",
};

export function currencyForCountry(code: string | null | undefined) {
  return CURRENCY_BY_COUNTRY[(code ?? "DK").toUpperCase()] ?? "EUR";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

/**
 * Search providers whose service area covers — or is near — the customer's
 * selected cleaning location. Everything is resolved server-side.
 */
export async function searchProvidersAround(
  job: JobLocation,
  radiusKm: number,
  filters: GeoSearchFilters = {},
  limit = 60,
): Promise<PublicProvider[]> {
  const { data, error } = await rpc("search_providers_public_geo_v1", {
    _lat: job.lat,
    _lng: job.lng,
    _radius_km: radiusKm,
    _country_code: filters.countryCode ?? null,
    _service_category: filters.serviceCategory ?? null,
    _language: filters.language ?? null,
    _max_hourly_rate: filters.maxHourlyRate ?? null,
    _limit: limit,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? []).map(mapRow);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRow(row: any): PublicProvider {
  const country = (row.country_code ?? "DK").toUpperCase();
  return {
    slug: row.provider_slug ?? null,
    userId: String(row.user_id ?? ""),
    displayName: publicDisplayName(row.display_name),
    avatarUrl: row.avatar_url ?? null,
    countryCode: country,
    publicArea: row.public_area ?? null,
    publicLat: Number(row.public_lat),
    publicLng: Number(row.public_lng),
    serviceRadiusKm: Number(row.service_radius_km ?? 10),
    distanceKm: Number(row.distance_km ?? 0),
    coversLocation: Boolean(row.covers_location),
    priceFrom: row.price_from == null ? null : Number(row.price_from),
    currency: currencyForCountry(country),
    languages: row.languages ?? [],
    serviceCategories: row.service_categories ?? [],
    yearsExperience: row.years_experience ?? null,
    avgResponseMinutes: row.avg_response_minutes ?? null,
    verified: Boolean(row.identity_verified_badge),
    rating: Number(row.average_rating ?? 0),
    reviews: Number(row.total_reviews ?? 0),
    completedBookings: Number(row.completed_bookings ?? 0),
    relevance: Number(row.relevance ?? 0),
  };
}

/**
 * Europe-wide showcase search — used for the DEFAULT Find Cleaner state, before
 * the customer has entered an address.
 *
 * It runs the exact same privacy-safe RPC once per ACTIVE market (server-driven
 * codes, never hardcoded here), centred on the market centroid with a radius
 * that covers the country. Every returned coordinate is therefore still the
 * anonymised area point produced in Postgres — no extra data is exposed.
 */
export async function searchProvidersAcrossMarkets(
  codes: string[],
  perMarket = 60,
): Promise<PublicProvider[]> {
  const points = countryMapPoints(codes);
  if (points.length === 0) return [];
  const batches = await Promise.all(
    points.map(async (c) => {
      const radiusKm = Math.round(Math.max(c.spread[0], c.spread[1]) * 111) + 40;
      try {
        return await searchProvidersAround(
          { lat: c.lat, lng: c.lng },
          radiusKm,
          { countryCode: c.code },
          perMarket,
        );
      } catch {
        return [] as PublicProvider[];
      }
    }),
  );
  const byId = new Map<string, PublicProvider>();
  batches.flat().forEach((p) => {
    if (p.userId && !byId.has(p.userId)) byId.set(p.userId, p);
  });
  return [...byId.values()];
}
