/**
 * Mapbox integration (replaces Google Maps).
 *
 * The browser token is a *public* (pk.) token, so shipping it to the browser is
 * expected — but it is no longer stored in the tracked `.env` file. It is served
 * at runtime by the `public-map-config` edge function from a Lovable runtime
 * secret (`MAPBOX_PUBLIC_TOKEN`).
 *
 * `VITE_MAPBOX_ACCESS_TOKEN` is still honoured as an optional local-development
 * override, but is not required and is not committed. There is deliberately NO
 * hardcoded fallback: a missing token must fail loudly and be handled
 * gracefully by the UI instead of silently using a stale token.
 */

import { supabase } from "@/integrations/supabase/client";

/** Thrown when the browser Mapbox token is not configured. */
export class MapboxConfigError extends Error {
  constructor() {
    super("mapbox_token_missing");
    this.name = "MapboxConfigError";
  }
}

/** Thrown when Mapbox is reachable but failing (network, 4xx/5xx). */
export class MapboxUnavailableError extends Error {
  readonly status?: number;
  constructor(status?: number) {
    super(`mapbox_unavailable${status ? `_${status}` : ""}`);
    this.name = "MapboxUnavailableError";
    this.status = status;
  }
}

let cachedToken: string | null = null;
let inFlight: Promise<string> | null = null;

function envToken(): string | null {
  const fromEnv = import.meta.env?.VITE_MAPBOX_ACCESS_TOKEN;
  return typeof fromEnv === "string" && fromEnv.trim() ? fromEnv.trim() : null;
}

/**
 * Resolves the browser token, fetching it once from the runtime config
 * endpoint and caching it for the lifetime of the page.
 *
 * Must be awaited before any synchronous `getMapboxToken()` consumer runs.
 */
export async function ensureMapboxToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const local = envToken();
  if (local) {
    cachedToken = local;
    return cachedToken;
  }

  if (!inFlight) {
    inFlight = (async () => {
      const { data, error } = await supabase.functions.invoke<{
        mapboxToken?: string;
      }>("public-map-config", { method: "GET" });
      const token = data?.mapboxToken?.trim();
      if (error || !token) throw new MapboxConfigError();
      cachedToken = token;
      return token;
    })().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}

/** Returns the resolved browser token, or `null` when it is not available. */
export function getMapboxTokenOrNull(): string | null {
  return cachedToken ?? envToken();
}

/** Returns the resolved browser token, throwing when it is missing. */
export function getMapboxToken(): string {
  const token = getMapboxTokenOrNull();
  if (!token) throw new MapboxConfigError();
  return token;
}



export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

const SEARCHBOX_BASE = "https://api.mapbox.com/search/searchbox/v1";

/**
 * Search Box sessions group `suggest` calls with their final `retrieve`, which
 * is both a billing and a relevance concern. One token per picked address.
 */
export function createSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sess-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export interface MapboxSuggestion {
  mapbox_id: string;
  name: string;
  place_formatted?: string;
  full_address?: string;
}

/**
 * Feature types accepted by Search Box `suggest`.
 * - `strict`  → house-level addresses only (booking / service address).
 * - `broad`   → also postcode, city and locality, so "2100", "København" or
 *               "Berlin" resolve while searching for cleaners.
 */
export const SUGGEST_TYPES = {
  strict: "address",
  broad: "address,street,postcode,place,locality,neighborhood",
} as const;

/** Autocomplete addresses, restricted to the given ISO country codes. */
export async function suggestAddresses(opts: {
  query: string;
  sessionToken: string;
  countries: string[];
  language?: string;
  signal?: AbortSignal;
  types?: string;
}): Promise<MapboxSuggestion[]> {
  const accessToken = await ensureMapboxToken();
  const params = new URLSearchParams({
    q: opts.query,
    access_token: accessToken,
    session_token: opts.sessionToken,
    types: opts.types || SUGGEST_TYPES.strict,
    limit: "6",
  });
  if (opts.countries.length > 0) params.set("country", opts.countries.join(",").toLowerCase());
  if (opts.language) params.set("language", opts.language);

  let res: Response;
  try {
    res = await fetch(`${SEARCHBOX_BASE}/suggest?${params.toString()}`, {
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new MapboxUnavailableError();
  }
  if (!res.ok) throw new MapboxUnavailableError(res.status);
  const body = (await res.json()) as { suggestions?: MapboxSuggestion[] };
  return body.suggestions ?? [];
}

