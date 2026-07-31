/**
 * Location domain types.
 *
 * Language, market (country + currency) and location (city) are three
 * SEPARATE axes. A user may read the UI in English, browse the ES market in
 * EUR and have Barcelona selected as their location. Never derive one from
 * another beyond the documented fallbacks.
 */

/** How precise the stored/known location is. Never store more than needed. */
export type LocationPrecision = "exact" | "city" | "country";

/** Where the resolved location came from — drives the privacy copy shown. */
export type LocationSource =
  | "booking"        // booking/service address — wins inside a booking flow
  | "profile"        // saved on the authenticated user's profile
  | "manual"         // user picked it in the location picker
  | "geolocation"    // consented browser geolocation
  | "locale"         // country-level guess from locale / market context
  | "unknown";       // nothing known — never fake a city

/** A curated place from `public.market_places`. */
export interface MarketPlace {
  id: string;
  countryCode: string;
  name: string;
  slug: string;
  municipality: string | null;
  postcodePrefixes: string[];
  lat: number | null;
  lng: number | null;
  defaultRadiusKm: number;
  sortOrder: number;
}

/** The resolved location the whole app reads from. */
export interface ResolvedLocation {
  countryCode: string | null;
  city: string | null;
  citySlug: string | null;
  municipality: string | null;
  postcode: string | null;
  /** Rounded coordinates only (~1 km grid). Never the raw device fix. */
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  precision: LocationPrecision;
  source: LocationSource;
}

export const DEFAULT_RADIUS_KM = 25;

export const UNKNOWN_LOCATION: ResolvedLocation = {
  countryCode: null,
  city: null,
  citySlug: null,
  municipality: null,
  postcode: null,
  lat: null,
  lng: null,
  radiusKm: DEFAULT_RADIUS_KM,
  precision: "country",
  source: "unknown",
};

/** True when we know a specific area (not just a country). */
export function hasArea(loc: ResolvedLocation): boolean {
  return Boolean(loc.city || (loc.lat != null && loc.lng != null));
}
