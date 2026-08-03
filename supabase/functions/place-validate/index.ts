/**
 * place-validate — server-side authoritative address validator.
 *
 * Contract:
 *   POST { place_id: string, source?: "dawa" | "mapbox" }
 *
 * Behaviour:
 *   - `source: "dawa"` (or omitted when the ref is a DAWA UUID) → re-fetches
 *     the canonical address from DAWA and stores structured fields
 *     (street, house_number, floor, side, door, postal_code, city,
 *     municipality) in `place_validations`. Country is always DK.
 *   - `source: "mapbox"` (default for every non-DAWA ref) → Mapbox Search Box
 *     retrieve. Google Places is no longer supported; the project runs on
 *     Mapbox exclusively.
 *
 * The DB trigger `enforce_address_country` still reads formatted_address
 * + country_code + lat/lng from the same row, so downstream save paths
 * are 100% backwards compatible.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DAWA_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalize(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/ä/g, "ae").replace(/ö/g, "oe")
    .replace(/[.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitHusnr(husnr?: string): { house_number?: string; letter?: string } {
  if (!husnr) return {};
  const m = /^(\d+)([A-Za-zÆØÅæøå]*)$/.exec(husnr.trim());
  if (!m) return { house_number: husnr };
  return { house_number: m[1], letter: m[2] || undefined };
}

type DawaFetchResult =
  | { ok: true; data: any }
  | { ok: false; error: "dawa_not_found"; status: 404 }
  | { ok: false; error: "dawa_invalid_response"; status: 502 };

function headersForLog(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key] = value; });
  return out;
}

function logInvalidDawaResponse(meta: Record<string, unknown>) {
  console.error("[place-validate] DAWA invalid response", meta);
}

async function fetchDawaJson(url: string, attempt = 0): Promise<DawaFetchResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "identity",
        "User-Agent": "MyCleaner/1.0 (+https://mycleaner.dk)",
      },
    });

    const status = response.status;
    const headers = headersForLog(response.headers);
    const contentType = response.headers.get("content-type") ?? "";

    let body = "";
    try {
      body = await response.text();
    } catch (e) {
      if (attempt < 1) return fetchDawaJson(url, attempt + 1);
      logInvalidDawaResponse({
        status,
        headers,
        body_preview: "",
        reason: "body_read_failed",
        detail: (e as Error).message,
      });
      return { ok: false, error: "dawa_invalid_response", status: 502 };
    }

    if (status === 404) return { ok: false, error: "dawa_not_found", status: 404 };

    if (!response.ok || !body || !contentType.toLowerCase().includes("application/json")) {
      if (attempt < 1 && (!body || status >= 500)) return fetchDawaJson(url, attempt + 1);
      logInvalidDawaResponse({
        status,
        headers,
        body_preview: body.slice(0, 500),
        reason: !response.ok ? "http_not_ok" : !body ? "empty_body" : "invalid_content_type",
      });
      return { ok: false, error: "dawa_invalid_response", status: 502 };
    }

    try {
      return { ok: true, data: JSON.parse(body) };
    } catch (e) {
      if (attempt < 1) return fetchDawaJson(url, attempt + 1);
      logInvalidDawaResponse({
        status,
        headers,
        body_preview: body.slice(0, 500),
        reason: "json_parse_failed",
        detail: (e as Error).message,
      });
      return { ok: false, error: "dawa_invalid_response", status: 502 };
    }
  } catch (e) {
    if (attempt < 1) return fetchDawaJson(url, attempt + 1);
    logInvalidDawaResponse({
      status: null,
      headers: {},
      body_preview: "",
      reason: "fetch_failed",
      detail: (e as Error).message,
    });
    return { ok: false, error: "dawa_invalid_response", status: 502 };
  }
}

async function validateDawa(ref: string) {
  const url = `https://api.dataforsyningen.dk/adresser/${encodeURIComponent(ref)}`;
  const fetched = await fetchDawaJson(url);
  if (!fetched.ok) return { error: fetched.error, status: fetched.status };
  const full = fetched.data;
  const { house_number, letter } = splitHusnr(full?.adgangsadresse?.husnr);
  const koord = full?.adgangsadresse?.adgangspunkt?.koordinater;
  const doorRaw: string | null = full?.dør ?? null;
  const side = doorRaw && ["tv", "th", "mf"].includes(doorRaw.toLowerCase())
    ? doorRaw.toLowerCase()
    : null;
  return {
    ok: true as const,
    row: {
      source: "dawa",
      country_code: "DK",
      formatted_address: full.adressebetegnelse as string,
      normalized_address: normalize(full.adressebetegnelse),
      street: full?.adgangsadresse?.vejstykke?.navn ?? null,
      house_number: house_number ?? null,
      letter: letter ?? null,
      floor: full?.etage ?? null,
      side,
      door: doorRaw,
      entrance: null,
      apartment: null,
      postal_code: full?.adgangsadresse?.postnummer?.nr ?? null,
      city: full?.adgangsadresse?.postnummer?.navn ?? null,
      municipality: full?.adgangsadresse?.kommune?.navn ?? null,
      lat: Array.isArray(koord) ? koord[1] : null,
      lng: Array.isArray(koord) ? koord[0] : null,
    },
  };
}

/**
 * Mapbox Search Box `retrieve` — authoritative lookup for a picked suggestion.
 * The session token must match the one used for `suggest` so Mapbox bills the
 * interaction once and returns the same-ranked feature.
 */
async function validateMapbox(ref: string, token: string, sessionToken: string) {
  const params = new URLSearchParams({ access_token: token });
  if (sessionToken) params.set("session_token", sessionToken);
  const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(ref)}?${params}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    console.error("[place-validate] mapbox unreachable", { detail: (e as Error).message });
    return { error: "mapbox_unavailable", detail: "network_error", status: 503 };
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("[place-validate] mapbox retrieve failed", { status: res.status, body: t.slice(0, 300) });
    // 401/403 = bad or missing token; 5xx/429 = Mapbox degraded.
    const status = res.status === 404
      ? 404
      : res.status === 401 || res.status === 403
      ? 502
      : res.status >= 500 || res.status === 429
      ? 503
      : 502;
    return {
      error: status === 503 ? "mapbox_unavailable" : "mapbox_retrieve_failed",
      detail: t.slice(0, 300),
      status,
    };
  }
  const payload = await res.json();

  const feature = payload?.features?.[0];
  const props = feature?.properties;
  const ctx = props?.context ?? {};
  const countryCode: string | null = ctx?.country?.country_code || ctx?.country?.country_code_alpha_3 || null;
  const formatted: string | null = props?.full_address || props?.place_formatted || props?.name || null;
  if (!countryCode || !formatted) return { error: "place_missing_country", status: 422 };
  const coords = feature?.geometry?.coordinates;
  return {
    ok: true as const,
    row: {
      source: "mapbox",
      country_code: String(countryCode).toUpperCase().slice(0, 2),
      formatted_address: formatted,
      normalized_address: normalize(formatted),
      street: ctx?.street?.name ?? null,
      house_number: ctx?.address?.address_number ?? null,
      letter: null,
      floor: null,
      side: null,
      door: null,
      entrance: null,
      apartment: null,
      postal_code: ctx?.postcode?.name ?? null,
      city: ctx?.place?.name ?? ctx?.locality?.name ?? null,
      municipality: ctx?.district?.name ?? ctx?.region?.name ?? null,
      lat: Array.isArray(coords) ? coords[1] : null,
      lng: Array.isArray(coords) ? coords[0] : null,
    },
  };
}




Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // No inline fallback: a missing token is a configuration error, never a
  // silent downgrade to a stale hardcoded key.
  const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  // Guests may validate an address (public "find a cleaner" search runs before
  // sign-up). Guest lookups are read-only: nothing is persisted and no profile
  // country comparison is made. Authenticated lookups behave exactly as before.
  const user = userRes?.user ?? null;


  let body: { place_id?: unknown; source?: unknown; session_token?: unknown } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const ref = String(body.place_id ?? "").trim();
  // Mapbox ids are base64url-ish and may carry '.' / '=' padding.
  if (!ref || ref.length > 300 || !/^[A-Za-z0-9_\-.=]+$/.test(ref)) {
    return json({ error: "invalid_place_id" }, 400);
  }
  const sessionToken = String(body.session_token ?? "").trim();
  if (sessionToken && (sessionToken.length > 128 || !/^[A-Za-z0-9_\-]+$/.test(sessionToken))) {
    return json({ error: "invalid_session_token" }, 400);
  }
  const requestedSource = String(body.source ?? "").toLowerCase();
  const source =
    requestedSource === "dawa" || (!requestedSource && DAWA_UUID_RE.test(ref))
      ? "dawa"
      : "mapbox";

  let result: any;
  if (source === "dawa") {
    result = await validateDawa(ref);
  } else {
    if (!mapboxToken) return json({ error: "mapbox_token_missing" }, 500);
    result = await validateMapbox(ref, mapboxToken, sessionToken);
  }

  if (!result.ok) return json({ error: result.error, detail: result.detail }, result.status ?? 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let profileCountry = "";
  if (user) {
    const { data: prof } = await admin
      .from("profiles").select("country_code").eq("id", user.id).maybeSingle();
    profileCountry = (prof?.country_code || "").toUpperCase();

    const { error: insErr } = await admin.from("place_validations").insert({
      user_id: user.id,
      place_id: ref,
      ...result.row,
    });
    if (insErr) return json({ error: "store_failed", detail: insErr.message }, 500);
  }

  // Guests have no profile country, so the country gate cannot apply to them.
  const match = user ? !!profileCountry && profileCountry === result.row.country_code : null;


    return json({
      ok: true,
      place_id: ref,
      source: result.row.source,
      country_code: result.row.country_code,
      formatted_address: result.row.formatted_address,
      normalized_address: result.row.normalized_address,
      street: result.row.street,
      house_number: result.row.house_number,
      letter: result.row.letter,
      floor: result.row.floor,
      side: result.row.side,
      door: result.row.door,
      postal_code: result.row.postal_code,
      city: result.row.city,
      municipality: result.row.municipality,
      lat: result.row.lat,
      lng: result.row.lng,
      profile_country_code: profileCountry || null,
      country_matches_profile: match,
    });
  } catch (e) {
    console.error("[place-validate] unhandled error", { err: (e as Error).message, stack: (e as Error).stack });
    return json({ error: "internal_error" }, 500);
  }
});
