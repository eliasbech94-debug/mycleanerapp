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
    return json({
      postal_code: data["post code"] || postal,
      city: place["place name"],
      country_code: country,
      lat: place.latitude ? Number(place.latitude) : null,
      lng: place.longitude ? Number(place.longitude) : null,
    });
  } catch {
    return json({ error: "lookup_unavailable" }, 502);
  }
});
