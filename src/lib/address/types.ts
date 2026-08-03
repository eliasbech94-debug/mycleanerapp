/**
 * Canonical address shape returned by any provider (DAWA, Mapbox, …).
 * All fields are optional except `source`, `ref` and `display` so callers
 * can render a single formatted line while richer fields are stored when
 * available (DAWA gives us the full structured breakdown; Mapbox typically
 * gives street + house_number + postal_code + city).
 *
 * "google" is retained only so historical `place_validations` rows keep
 * type-checking; no code path produces it any more.
 */
export type AddressSource = "dawa" | "mapbox" | "google";


export interface ResolvedAddress {
  /** Which provider validated this address. */
  source: AddressSource;
  /** Provider's stable identifier for the address (Google placeId, DAWA UUID). */
  ref: string;
  /** Human-formatted full display string, e.g. "Sønder Boulevard 18, 1. tv, 1720 København V". */
  display: string;
  /** Lowercased, transliterated, comma-stripped normalization for de-duplication. */
  normalized: string;
  /** ISO country code (upper-case) — "DK" for DAWA results. */
  countryCode: string;

  // Structured components (all optional)
  street?: string;
  houseNumber?: string;
  letter?: string;
  floor?: string;
  side?: string;
  door?: string;
  entrance?: string;
  apartment?: string;
  postalCode?: string;
  city?: string;
  municipality?: string;
  lat?: number;
  lng?: number;
}

export interface AddressSuggestion {
  source: AddressSource;
  ref: string;
  /** Primary line (usually street + number + apartment). */
  primary: string;
  /** Secondary line (usually postal code + city). */
  secondary: string;
  /** Character indices [start, end) of matched substring in `primary`, used to bold matches. */
  match?: [number, number];
}

export interface AddressProvider {
  readonly source: AddressSource;
  /** Return up to N ranked suggestions for the query. */
  suggest(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]>;
  /** Look up a single canonical address by the provider ref. */
  resolve(ref: string, signal?: AbortSignal): Promise<ResolvedAddress | null>;
}
