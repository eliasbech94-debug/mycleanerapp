// Public country config — anonymous safe. Serves only the allowlisted DTO
// from country_configs_public. Never leaks Stripe IDs, internal thresholds,
// fraud settings, verification rules, or unpublished data.
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
  if (error) { await log.error(error, { category: "country_config_read" });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ countries: data ?? [] }), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}));
