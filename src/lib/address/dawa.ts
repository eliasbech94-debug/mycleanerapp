/**
 * DAWA (Danish Address Web API) provider.
 *
 * DAWA is the official Danish address register — free, no API key, no rate
 * limit for reasonable use, and it exposes ALL structured components we need
 * (etage / dør / husnr / bogstav / postnr / by / kommune) plus ETRS89
 * coordinates. That's why every Danish address search goes through DAWA
 * instead of Google Places, which does not return floor or door.
 *
 * Endpoints used:
 *   - /adresser/autocomplete?q=<query>&fuzzy&per_side=8  (typeahead)
 *   - /adresser/<uuid>                                    (canonical lookup)
 *
 * We keep DAWA server-agnostic here: this file is imported by both the
 * frontend (`suggest()` during typing) and the `place-validate` edge function
 * (`fetchAddressById()` to re-fetch the canonical record before saving).
 */
import type { AddressProvider, AddressSuggestion, ResolvedAddress } from "./types";
import { normalizeAddress, matchSpan } from "./normalize";

const DAWA_BASE = "https://api.dataforsyningen.dk";

/** Raw DAWA autocomplete row (only fields we depend on are typed). */
interface DawaAutocompleteRow {
  tekst: string;
  adresse: {
    id: string;
    adressebetegnelse?: string;
    vejnavn?: string;
    husnr?: string;
    etage?: string | null;
    dør?: string | null;
    "supplerendebynavn"?: string | null;
    postnr?: string;
    postnrnavn?: string;
    x?: number; // longitude
    y?: number; // latitude
    kommunekode?: string;
  };
}

/** Raw DAWA `/adresser/{id}` payload (subset). */
interface DawaAdresseFull {
  id: string;
  adressebetegnelse: string;
  etage?: string | null;
  dør?: string | null;
  adgangsadresse: {
    vejstykke: { navn: string };
    husnr: string;
    postnummer: { nr: string; navn: string };
    kommune: { kode: string; navn: string };
    adgangspunkt: { koordinater: [number, number] } | null; // [lng, lat]
    supplerendebynavn?: string | null;
  };
}

function splitHusnr(husnr: string | undefined): { houseNumber?: string; letter?: string } {
  if (!husnr) return {};
  // DAWA returns "18", "18A", "18B" etc. Split trailing letters.
  const m = /^(\d+)([A-Za-zÆØÅæøå]*)$/.exec(husnr.trim());
  if (!m) return { houseNumber: husnr };
  return { houseNumber: m[1], letter: m[2] || undefined };
}

/**
 * Convert a raw DAWA full-address payload into our canonical ResolvedAddress.
 * Exposed so tests can feed fixtures without hitting the network.
 */
export function parseDawaFull(full: DawaAdresseFull): ResolvedAddress {
  const { houseNumber, letter } = splitHusnr(full.adgangsadresse.husnr);
  const koord = full.adgangsadresse.adgangspunkt?.koordinater;
  const display = full.adressebetegnelse;
  return {
    source: "dawa",
    ref: full.id,
    display,
    normalized: normalizeAddress(display),
    countryCode: "DK",
    street: full.adgangsadresse.vejstykke.navn,
    houseNumber,
    letter,
    floor: full.etage ?? undefined,
    // DAWA calls it "dør" which covers both side (tv/th/mf) and apartment numbers.
    // We store the raw value in both `side` (when it's a Danish side token)
    // and `door` (always) so downstream code has both shapes available.
    side: normalizeDawaDoor(full.dør),
    door: full.dør ?? undefined,
    postalCode: full.adgangsadresse.postnummer.nr,
    city: full.adgangsadresse.postnummer.navn,
    municipality: full.adgangsadresse.kommune.navn,
    lat: koord ? koord[1] : undefined,
    lng: koord ? koord[0] : undefined,
  };
}

function normalizeDawaDoor(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const low = v.toLowerCase().trim();
  if (["tv", "th", "mf"].includes(low)) return low;
  return undefined;
}

/**
 * Convert an autocomplete row into our AddressSuggestion.
 * `query` is passed through so we can compute the highlight span once.
 */
export function toSuggestion(row: DawaAutocompleteRow, query: string): AddressSuggestion {
  const primary = row.tekst || row.adresse.adressebetegnelse || "";
  const secondary = [row.adresse.postnr, row.adresse.postnrnavn].filter(Boolean).join(" ");
  const span = matchSpan(primary, query);
  return {
    source: "dawa",
    ref: row.adresse.id,
    primary,
    secondary,
    match: span ?? undefined,
  };
}

/** Fetch a single canonical DAWA address by UUID. Used server-side. */
export async function fetchDawaAddressById(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedAddress | null> {
  const url = `${DAWA_BASE}/adresser/${encodeURIComponent(id)}`;
  const res = await fetchImpl(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`dawa_lookup_failed_${res.status}`);
  const full = (await res.json()) as DawaAdresseFull;
  return parseDawaFull(full);
}

/**
 * Browser-side DAWA provider. `suggest()` accepts an AbortSignal so that
 * a keystroke fired after the previous request lands cancels the earlier
 * fetch without producing stale UI.
 */
export const dawaProvider: AddressProvider = {
  source: "dawa",

  async suggest(query, signal) {
    const q = query.trim();
    if (q.length < 2) return [];
    const url = new URL(`${DAWA_BASE}/adresser/autocomplete`);
    url.searchParams.set("q", q);
    url.searchParams.set("fuzzy", "");
    url.searchParams.set("per_side", "8");
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) return [];
    const rows = (await res.json()) as DawaAutocompleteRow[];
    return rows.map((r) => toSuggestion(r, q));
  },

  async resolve(ref, signal) {
    const url = `${DAWA_BASE}/adresser/${encodeURIComponent(ref)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const full = (await res.json()) as DawaAdresseFull;
    return parseDawaFull(full);
  },
};

/** Regex the edge function uses to recognise a DAWA UUID ref. */
export const DAWA_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
