/**
 * Place resolution helpers.
 *
 * The canonical city list lives in `public.market_places` (admin-managed) —
 * NEVER hardcode city names in components. Everything here is pure except
 * `fetchMarketPlaces`, so the matching rules stay unit-testable.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_RADIUS_KM, type MarketPlace, type ResolvedLocation } from "./types";

interface MarketPlaceRow {
  id: string;
  country_code: string;
  name: string;
  slug: string;
  municipality: string | null;
  postcode_prefixes: string[] | null;
  lat: number | string | null;
  lng: number | string | null;
  default_radius_km: number | null;
  sort_order: number | null;
}

export function mapPlaceRow(row: MarketPlaceRow): MarketPlace {
  return {
    id: row.id,
    countryCode: (row.country_code || "").toUpperCase(),
    name: row.name,
    slug: row.slug,
    municipality: row.municipality,
    postcodePrefixes: row.postcode_prefixes ?? [],
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    defaultRadiusKm: row.default_radius_km ?? DEFAULT_RADIUS_KM,
    sortOrder: row.sort_order ?? 100,
  };
}

let cache: MarketPlace[] | null = null;
let inflight: Promise<MarketPlace[]> | null = null;

/** Test seam. */
export function __resetPlacesCache() {
  cache = null;
  inflight = null;
}

export async function fetchMarketPlaces(): Promise<MarketPlace[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase
        .from("market_places")
        .select("id,country_code,name,slug,municipality,postcode_prefixes,lat,lng,default_radius_km,sort_order")
        .eq("is_active", true)
        .order("country_code")
        .order("sort_order");
      if (error || !data) return [];
      cache = (data as unknown as MarketPlaceRow[]).map(mapPlaceRow);
      return cache;
    })();
  }
  return inflight;
}

export function placesForCountry(places: MarketPlace[], countryCode?: string | null): MarketPlace[] {
  if (!countryCode) return [];
  const up = countryCode.toUpperCase();
  return places.filter((p) => p.countryCode === up);
}

export function findPlaceBySlug(
  places: MarketPlace[],
  countryCode: string | null | undefined,
  slug: string | null | undefined,
): MarketPlace | null {
  if (!slug) return null;
  return (
    placesForCountry(places, countryCode).find((p) => p.slug === slug) ??
    places.find((p) => p.slug === slug) ??
    null
  );
}

/** Postcode → place. Longest matching prefix wins so "SW" beats "S". */
export function findPlaceByPostcode(
  places: MarketPlace[],
  countryCode: string | null | undefined,
  postcode: string | null | undefined,
): MarketPlace | null {
  if (!postcode) return null;
  const norm = postcode.replace(/\s+/g, "").toUpperCase();
  let best: MarketPlace | null = null;
  let bestLen = 0;
  for (const place of placesForCountry(places, countryCode)) {
    for (const prefix of place.postcodePrefixes) {
      const p = prefix.toUpperCase();
      if (p && norm.startsWith(p) && p.length > bestLen) {
        best = place;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/** Free-text city name → place (accent/case insensitive). */
export function findPlaceByName(
  places: MarketPlace[],
  countryCode: string | null | undefined,
  name: string | null | undefined,
): MarketPlace | null {
  if (!name) return null;
  const norm = normalize(name);
  const scope = placesForCountry(places, countryCode);
  const pool = scope.length ? scope : places;
  return (
    pool.find((p) => normalize(p.name) === norm) ??
    pool.find((p) => normalize(p.municipality ?? "") === norm) ??
    null
  );
}

/** Fold accents plus the Nordic/German letters NFD does not decompose. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/ß/g, "ss")
    .replace(/đ/g, "d")
    .trim();
}

/** Great-circle distance in km. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Public-facing distance. Never expose a precise figure that could be used to
 * triangulate a home address — round to the nearest step (default 1 km) and
 * floor at the step.
 */
export function roundedDistanceKm(km: number, step = 1): number {
  return Math.max(step, Math.round(km / step) * step);
}

/** Nearest curated place to a coordinate — used after a geolocation fix. */
export function nearestPlace(
  places: MarketPlace[],
  point: { lat: number; lng: number },
  countryCode?: string | null,
): { place: MarketPlace; km: number } | null {
  const scope = countryCode ? placesForCountry(places, countryCode) : places;
  const pool = (scope.length ? scope : places).filter((p) => p.lat != null && p.lng != null);
  if (!pool.length) return null;
  let best: { place: MarketPlace; km: number } | null = null;
  for (const place of pool) {
    const km = distanceKm(point, { lat: place.lat as number, lng: place.lng as number });
    if (!best || km < best.km) best = { place, km };
  }
  return best;
}

/** Snap coordinates to a ~1 km grid so no precise fix is ever persisted. */
export function coarsen(lat: number, lng: number, grid = 0.01): { lat: number; lng: number } {
  return {
    lat: Math.round(lat / grid) * grid,
    lng: Math.round(lng / grid) * grid,
  };
}

export function placeToLocation(
  place: MarketPlace,
  source: ResolvedLocation["source"],
  overrides: Partial<ResolvedLocation> = {},
): ResolvedLocation {
  return {
    countryCode: place.countryCode,
    city: place.name,
    citySlug: place.slug,
    municipality: place.municipality,
    postcode: null,
    lat: place.lat,
    lng: place.lng,
    radiusKm: place.defaultRadiusKm,
    precision: "city",
    source,
    ...overrides,
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
