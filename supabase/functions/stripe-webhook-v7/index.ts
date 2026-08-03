// =====================================================================
// stripe-webhook-v7 — DEACTIVATED.
//
// The v7 ledger ingestion now runs inside the single authoritative endpoint
// `stripe-webhook` (see supabase/functions/_shared/stripeLedgerIngest.ts).
// Two endpoints competing for the same `stripe_webhook_events` idempotency
// row meant whichever handler won the race silently suppressed the other.
//
// Configure ONLY this URL in Stripe:
//   https://<project>.supabase.co/functions/v1/stripe-webhook
//
// This stub stays deployed to return an explicit 410 so a stale Stripe
// endpoint configuration is loud instead of silently dropping ledger events.
// =====================================================================
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.error("stripe-webhook-v7 called but is deactivated — point Stripe at /stripe-webhook");
  return new Response(
    JSON.stringify({
      error: "endpoint_deactivated",
      message: "stripe-webhook-v7 is retired. Use /functions/v1/stripe-webhook.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
