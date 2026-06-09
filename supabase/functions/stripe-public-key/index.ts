// Returns the Stripe publishable key + mode. Public; no auth needed.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const pk = Deno.env.get("STRIPE_PUBLISHABLE_KEY") || "";
  const mode = pk.startsWith("pk_live_") ? "live" : pk.startsWith("pk_test_") ? "test" : "unknown";
  return new Response(JSON.stringify({ publishable_key: pk, mode }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
