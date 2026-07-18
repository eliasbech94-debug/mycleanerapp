// Cron-invoked: cancels PaymentIntents for pending bookings whose 24h
// authorization window has elapsed, and marks the booking expired.
// Restricted to service-role (cron) or admin users.
// Instrumented: monitored() + startJobRun() for observability.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireServiceOrAdmin } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";
import { startJobRun } from "../_shared/jobrun.ts";

Deno.serve(monitored("booking-expire-pending", async (req, log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireServiceOrAdmin(req, corsHeaders);
  if (gate instanceof Response) return gate;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const run = await startJobRun("booking-expire-pending", log.correlationId);
  const counters = { processed: 0, success: 0, failed: 0 };

  try {
    const { data: rows } = await admin
      .from("bookings")
      .select("id, payment_intent_id")
      .eq("status", "pending")
      .eq("payment_status", "authorized")
      .lt("authorization_expires_at", new Date().toISOString())
      .limit(100);

    const results: any[] = [];
    for (const b of rows || []) {
      counters.processed += 1;
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
        counters.success += 1;
        results.push({ id: b.id, ok: true });
      } catch (e) {
        counters.failed += 1;
        await log.error(e, { category: "expire_booking", booking_id: b.id });
        results.push({ id: b.id, error: (e as Error).message });
      }
    }

    await run.finish("completed", counters);
    log.info("booking-expire-pending.done", counters);
    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await run.finish("failed", counters, e);
    throw e;
  }
}));
