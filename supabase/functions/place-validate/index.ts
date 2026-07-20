/**
 * place-validate — server-side authoritative address validator.
 *
 * Contract:
 *   POST { place_id: string, source?: "dawa" | "google" }
 *
 * Behaviour:
 *   - `source: "dawa"` (or omitted when the ref is a DAWA UUID) → re-fetches
 *     the canonical address from DAWA and stores structured fields
 *     (street, house_number, floor, side, door, postal_code, city,
 *     municipality) in `place_validations`. Country is always DK.
 *   - `source: "google"` (default legacy path) → unchanged Google Places
 *     Details fetch. Existing bookings and saved addresses keep working
 *     with no code changes elsewhere.
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

async function validateGoogle(ref: string, apiKey: string) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(ref)}`;
  const gRes = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
    },
  });
  if (!gRes.ok) {
    const t = await gRes.text();
    return { error: "google_places_failed", detail: t.slice(0, 300), status: 502 };
  }
  const place = await gRes.json();
  const comps: any[] = place.addressComponents || [];
  const country = comps.find((c) => (c.types || []).includes("country"));
  const countryCode: string | null = country?.shortText || country?.short_name || null;
  const formatted: string | null = place.formattedAddress || null;
  if (!countryCode || !formatted) {
    return { error: "place_missing_country", status: 422 };
  }
  return {
    ok: true as const,
    row: {
      source: "google",
      country_code: countryCode.toUpperCase(),
      formatted_address: formatted,
      normalized_address: normalize(formatted),
      street: null,
      house_number: null,
      letter: null,
      floor: null,
      side: null,
      door: null,
      entrance: null,
      apartment: null,
      postal_code: null,
      city: null,
      municipality: null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
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
  const gKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { place_id?: unknown; source?: unknown } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const ref = String(body.place_id ?? "").trim();
  if (!ref || ref.length > 300 || !/^[A-Za-z0-9_\-]+$/.test(ref)) {
    return json({ error: "invalid_place_id" }, 400);
  }
  const requestedSource = String(body.source ?? "").toLowerCase();
  const source =
    requestedSource === "dawa" || (!requestedSource && DAWA_UUID_RE.test(ref))
      ? "dawa"
      : "google";

  let result: any;
  if (source === "dawa") {
    result = await validateDawa(ref);
  } else {
    if (!gKey) return json({ error: "google_key_missing" }, 500);
    result = await validateGoogle(ref, gKey);
  }
  if (!result.ok) return json({ error: result.error, detail: result.detail }, result.status ?? 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: prof } = await admin
    .from("profiles").select("country_code").eq("id", user.id).maybeSingle();
  const profileCountry = (prof?.country_code || "").toUpperCase();

  const { error: insErr } = await admin.from("place_validations").insert({
    user_id: user.id,
    place_id: ref,
    ...result.row,
  });
  if (insErr) return json({ error: "store_failed", detail: insErr.message }, 500);

  const match = !!profileCountry && profileCountry === result.row.country_code;

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
