// Cron-invoked: cancels PaymentIntents for pending bookings whose 24h
// authorization window has elapsed, and marks the booking expired.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows } = await admin
    .from("bookings")
    .select("id, payment_intent_id")
    .eq("status", "pending")
    .eq("payment_status", "authorized")
    .lt("authorization_expires_at", new Date().toISOString())
    .limit(100);

  const results: any[] = [];
  for (const b of rows || []) {
    try {
      if (b.payment_intent_id) {
        await fetch(`https://api.stripe.com/v1/payment_intents/${b.payment_intent_id}/cancel`, {
          method: "POST", headers: { Authorization: `Bearer ${stripeKey}` },
        });
      }
      await admin.from("bookings").update({
        status: "cancelled", payment_status: "expired",
        decided_at: new Date().toISOString(),
      }).eq("id", b.id);
      results.push({ id: b.id, ok: true });
    } catch (e) {
      results.push({ id: b.id, error: (e as Error).message });
    }
  }
  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
