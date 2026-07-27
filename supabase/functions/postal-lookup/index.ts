import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const COUNTRY_MAP: Record<string, string> = { DK: "dk", SE: "se", ES: "es", UK: "gb" };
const PATTERNS: Record<string, RegExp> = {
  DK: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/,
  ES: /^\d{5}$/,
  UK: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: "unauthorized" }, 401);

  let body: { country_code?: string; postal_code?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const country = String(body.country_code || "").toUpperCase();
  const postal = String(body.postal_code || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!COUNTRY_MAP[country] || !PATTERNS[country]?.test(postal)) return json({ error: "invalid_postal_code" }, 422);

  try {
    const response = await fetch(`https://api.zippopotam.us/${COUNTRY_MAP[country]}/${encodeURIComponent(postal)}`, {
      headers: { Accept: "application/json", "User-Agent": "MyCleaner/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 404) return json({ error: "postal_code_not_found" }, 404);
    if (!response.ok) return json({ error: "lookup_unavailable" }, 502);
    const data = await response.json();
    const place = data?.places?.[0];
    if (!place?.["place name"]) return json({ error: "postal_code_not_found" }, 404);
    const resolvedPostal = data["post code"] || postal;
    const city = place["place name"];
    const lat = place.latitude ? Number(place.latitude) : null;
    const lng = place.longitude ? Number(place.longitude) : null;
    const placeId = `postal:${country}:${resolvedPostal}`;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { error: storeError } = await admin.from("place_validations").insert({
      user_id: userData.user.id,
      place_id: placeId,
      source: "postal",
      country_code: country,
      formatted_address: `${resolvedPostal} ${city}`,
      normalized_address: `${resolvedPostal} ${city}`.toLowerCase(),
      postal_code: resolvedPostal,
      city,
      lat,
      lng,
    });
    if (storeError) return json({ error: "store_failed" }, 500);
    return json({ postal_code: resolvedPostal, city, country_code: country, lat, lng, place_id: placeId });
  } catch {
    return json({ error: "lookup_unavailable" }, 502);
  }
});
