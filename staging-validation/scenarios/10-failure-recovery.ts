// Failure & recovery:
// 1) POST a Stripe webhook with a bad signature → expect 400 + rejected row.
// 2) POST same event with valid signature → expect 200 + accepted row.
import { env } from "../config.js";
import { runScenario, assert, attach } from "../lib/reporter.js";
import { stripeSignature } from "../lib/stripe-sign.js";
import { psqlJson } from "../lib/supabase-admin.js";
import { httpCall } from "../lib/http.js";

export async function scenarioFailureRecovery() {
  return runScenario("10-failure-recovery", "Bad-signature rejection then successful retry", async (ctx) => {
    const evtId = `evt_rc2_recover_${Date.now()}`;
    const payload = JSON.stringify({
      id: evtId, object: "event", type: "payment_intent.succeeded",
      livemode: false, created: Math.floor(Date.now()/1000),
      data: { object: { id: "pi_rc2_recover", amount: 5000, currency: "dkk", status: "succeeded", metadata: {} } },
    });

    const bad = await httpCall("stripe-bad-sig", env.STRIPE_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef" }, body: payload,
    });
    attach(ctx, bad.artifact);
    assert(ctx, "bad signature rejected 400", bad.status === 400, `got ${bad.status}`);

    const good = await httpCall("stripe-good-sig-retry", env.STRIPE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": stripeSignature(payload, env.STRIPE_TEST_WEBHOOK_SECRET) },
      body: payload,
    });
    attach(ctx, good.artifact);
    assert(ctx, "retry accepted 200", good.status === 200);

    const rows = psqlJson<{ status: string | null }>(
      `select status from public.stripe_webhook_events where stripe_event_id = '${evtId}'`,
    );
    assert(ctx, "accepted event stored once", rows.length === 1, `count=${rows.length}`);
    const rejected = psqlJson<{ n: number }>(
      `select count(*)::int as n from public.stripe_webhook_events where status='rejected' and created_at > now() - interval '5 minutes'`,
    );
    assert(ctx, "rejected attempt logged", (rejected[0]?.n ?? 0) >= 1, `rejected recent=${rejected[0]?.n}`);
  });
}
