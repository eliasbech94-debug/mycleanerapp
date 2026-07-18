// Authoritative country status — NEVER cached in shared/CDN caches.
// Frontend config (country-config) may be cached for ≤60s; before accepting a
// booking or payment we consult THIS endpoint (or the server-side RPC
// is_country_launch_ready), which reads the current published row directly.
//
// This closes the "stale cached active country" gap: even if a browser has
// a cached country-config payload for a now-deactivated country, every
// server-side write path re-verifies via is_country_launch_ready.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { monitored } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(monitored("country-status", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const iso = new URL(req.url).searchParams.get("iso")?.toUpperCase();
  if (!iso || !/^[A-Z]{2}$/.test(iso)) {
    return json({ error: "iso_required" }, 400);
  }
  const { data, error } = await admin.rpc("is_country_launch_ready", { _iso: iso });
  if (error) return json({ error: error.message }, 500);
  return new Response(JSON.stringify({ iso, launch_ready: !!data, checked_at: new Date().toISOString() }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      // Never cache — this is the authoritative pre-checkout gate.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
