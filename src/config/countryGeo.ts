/**
 * Presentation-only geography for map overlays.
 *
 * IMPORTANT: this file is NOT a source of truth for which markets are active.
 * Active markets always come from the server (`public.market_launch_status`
 * via `useMarketStatus`). This module only answers "where do I draw a symbol
 * for market XX, and what is its name/flag".
 */
import { countries } from "@/lib/countries";
import { normalizeCountryCode } from "@/lib/marketStatus";

/** Approximate country centroids (lng/lat) used to place symbolic markers. */
const CENTROIDS: Record<string, [number, number]> = {
  DK: [10.0, 56.0],
  SE: [15.5, 61.0],
  NO: [9.5, 61.5],
  DE: [10.4, 51.1],
  NL: [5.3, 52.2],
  FR: [2.3, 46.6],
  ES: [-3.7, 40.2],
  IT: [12.5, 42.8],
  GB: [-1.5, 53.0],
  FI: [26.0, 64.0],
  PL: [19.4, 52.1],
  AT: [14.5, 47.6],
  BE: [4.5, 50.6],
  IE: [-8.0, 53.3],
  PT: [-8.2, 39.6],
  CH: [8.2, 46.8],
};

/**
 * Approximate half-extent (in degrees) of each market, used only to scatter
 * symbolic showcase markers inside a country outline. Never derived from, and
 * never applied to, a real provider address.
 */
const SPREADS: Record<string, [number, number]> = {
  DK: [1.9, 1.3],
  SE: [4.5, 4.5],
  NO: [4.5, 4.0],
  DE: [3.6, 3.2],
  NL: [1.2, 0.9],
  FR: [3.8, 3.6],
  ES: [4.2, 2.8],
  IT: [3.4, 3.8],
  GB: [2.6, 3.2],
  FI: [3.4, 3.6],
  PL: [3.4, 2.4],
  AT: [2.4, 0.9],
  BE: [1.1, 0.7],
  IE: [1.4, 1.3],
  PT: [1.0, 2.4],
  CH: [1.4, 0.8],
};

export interface CountryMapPoint {
  code: string;
  name: string;
  flag: string;
  lng: number;
  lat: number;
  /** Half-extent [lng, lat] in degrees for symbolic scattering. */
  spread: [number, number];
}

/** Resolve a market code to a drawable point. Unknown codes are skipped. */
export function countryMapPoint(code?: string | null): CountryMapPoint | null {
  const iso = normalizeCountryCode(code);
  if (!iso) return null;
  const centroid = CENTROIDS[iso];
  if (!centroid) return null;
  // `countries` still uses the legacy "UK" spelling for Great Britain.
  const meta = countries.find((c) => normalizeCountryCode(c.code) === iso);
  return {
    code: iso,
    name: meta?.name ?? iso,
    flag: meta?.flag ?? "🏳️",
    lng: centroid[0],
    lat: centroid[1],
    spread: SPREADS[iso] ?? [1.5, 1.5],
  };
}

export function countryMapPoints(codes: string[]): CountryMapPoint[] {
  return codes
    .map((c) => countryMapPoint(c))
    .filter((p): p is CountryMapPoint => p !== null);
}
