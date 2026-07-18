// Public country config — anonymous safe. Serves only the allowlisted DTO from
// country_configs_public. Never leaks Stripe IDs, internal thresholds, fraud
// settings, verification rules, or unpublished/draft rows.
//
// Cache strategy: short public max-age (60s) + s-maxage (300s) for CDN reuse.
// stale-while-revalidate lets a stale value be served while a background
// refresh happens, so a publish is visible in ≤ max-age seconds. Inactive
// countries are filtered by country_configs_public itself, so a stale cache
// cannot expose an unpublished/inactive country.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { monitored } from "../_shared/logger.ts";

const anon = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);

Deno.serve(monitored("country-config", async (req, log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const iso = url.searchParams.get("iso")?.toUpperCase();

  let q = anon.from("country_configs_public").select("*");
  if (iso) q = q.eq("iso", iso);
  const { data, error } = await q;
  if (error) {
    await log.error(error, { category: "country_config_read" });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Compute a strong ETag from (iso, config_version, published_at) so cache
  // consumers can bypass immediately when a publish bumps config_version.
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const tag = rows
    .map((r) => `${r.iso}:${r.config_version ?? 0}:${r.published_at ?? ""}`)
    .join("|");
  const etag = `W/"${await sha256(tag)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ...corsHeaders, ETag: etag } });
  }

  return new Response(JSON.stringify({ countries: rows }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ETag: etag,
      // Public, cacheable, revalidation within 60s; CDN may keep 5m and
      // serve stale for another 5m while revalidating.
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
      "Vary": "Accept-Language",
    },
  });
}));

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
