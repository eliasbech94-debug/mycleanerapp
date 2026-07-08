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

Deno.serve(async (req) => {
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
  if (!gKey) return json({ error: "google_key_missing" }, 500);

  let body: { place_id?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const placeId = String(body.place_id ?? "").trim();
  if (!placeId || placeId.length > 300 || !/^[A-Za-z0-9_\-]+$/.test(placeId)) {
    return json({ error: "invalid_place_id" }, 400);
  }

  // Google Places v1 (New) — Place Details
  const url =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const gRes = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": gKey,
      "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
    },
  });
  if (!gRes.ok) {
    const t = await gRes.text();
    return json({ error: "google_places_failed", detail: t.slice(0, 300) }, 502);
  }
  const place = await gRes.json();
  const comps: any[] = place.addressComponents || [];
  const country = comps.find((c) => (c.types || []).includes("country"));
  const countryCode: string | null =
    country?.shortText || country?.short_name || null;
  const formatted: string | null = place.formattedAddress || null;
  const lat: number | null = place.location?.latitude ?? null;
  const lng: number | null = place.location?.longitude ?? null;

  if (!countryCode || !formatted) {
    return json({ error: "place_missing_country" }, 422);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Look up user's profile country for immediate feedback
  const { data: prof } = await admin
    .from("profiles")
    .select("country_code")
    .eq("id", user.id)
    .maybeSingle();
  const profileCountry = (prof?.country_code || "").toUpperCase();

  // Store the validation row so the DB trigger will accept a subsequent save
  const { error: insErr } = await admin.from("place_validations").insert({
    user_id: user.id,
    place_id: placeId,
    country_code: countryCode.toUpperCase(),
    formatted_address: formatted,
    lat,
    lng,
  });
  if (insErr) return json({ error: "store_failed", detail: insErr.message }, 500);

  const match = !!profileCountry && profileCountry === countryCode.toUpperCase();

  return json({
    ok: true,
    place_id: placeId,
    country_code: countryCode.toUpperCase(),
    formatted_address: formatted,
    lat,
    lng,
    profile_country_code: profileCountry || null,
    country_matches_profile: match,
  });
});
