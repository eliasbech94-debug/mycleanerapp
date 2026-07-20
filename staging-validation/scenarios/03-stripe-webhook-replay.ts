// Replays a canonical set of Stripe test-mode events against the deployed
// stripe-webhook function using real signatures, then verifies DB effects.
import { env } from "../config.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";
import { stripeSignature } from "../lib/stripe-sign.js";
import { psqlJson } from "../lib/supabase-admin.js";
import { httpCall } from "../lib/http.js";

const EVENTS = [
  { id: "evt_rc2_pi_succeeded", type: "payment_intent.succeeded" },
  { id: "evt_rc2_pi_failed", type: "payment_intent.payment_failed" },
  { id: "evt_rc2_charge_refunded", type: "charge.refunded" },
  { id: "evt_rc2_transfer_created", type: "transfer.created" },
  { id: "evt_rc2_payout_paid", type: "payout.paid" },
  { id: "evt_rc2_dispute_created", type: "charge.dispute.created" },
  { id: "evt_rc2_account_updated", type: "account.updated" },
];

function skeleton(id: string, type: string) {
  return {
    id, object: "event", type, api_version: "2024-06-20", livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: minimalObject(type) },
  };
}

function minimalObject(type: string): any {
  if (type.startsWith("payment_intent."))
    return { id: "pi_rc2_test", object: "payment_intent", amount: 10000, currency: "dkk", status: "succeeded", metadata: { booking_id: "00000000-0000-0000-0000-00000000rc02" } };
  if (type === "charge.refunded")
    return { id: "ch_rc2_test", object: "charge", payment_intent: "pi_rc2_test", amount_captured: 10000, refunds: { data: [{ id: "re_rc2", amount: 10000, currency: "dkk", status: "succeeded", created: Math.floor(Date.now()/1000) }] } };
  if (type === "transfer.created")
    return { id: "tr_rc2", object: "transfer", amount: 7200, currency: "dkk", metadata: {}, transfer_group: "rc2" };
  if (type === "payout.paid")
    return { id: "po_rc2", object: "payout", amount: 7200, currency: "dkk", status: "paid", arrival_date: Math.floor(Date.now()/1000) };
  if (type === "charge.dispute.created")
    return { id: "dp_rc2", object: "dispute", charge: "ch_rc2_test", amount: 10000, currency: "dkk", status: "warning_needs_response", reason: "fraudulent" };
  if (type === "account.updated")
    return { id: "acct_rc2", object: "account", charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [], disabled_reason: null } };
  return {};
}

export async function scenarioStripeWebhookReplay() {
  return runScenario("03-stripe-webhook", "Replay Stripe test events with valid signatures", async (ctx) => {
    for (const e of EVENTS) {
      const payload = JSON.stringify(skeleton(e.id, e.type));
      const sig = stripeSignature(payload, env.STRIPE_TEST_WEBHOOK_SECRET);
      const call = await httpCall(`stripe-${e.type}`, env.STRIPE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "stripe-signature": sig },
        body: payload,
      });
      attach(ctx, call.artifact);
      assert(ctx, `${e.type} → 200`, call.status === 200, `got ${call.status}`);
    }

    // Verify events landed in stripe_webhook_events.
    const rows = psqlJson<{ stripe_event_id: string; event_type: string; status: string | null }>(
      `select stripe_event_id, event_type, status from public.stripe_webhook_events
        where stripe_event_id like 'evt_rc2%' order by created_at desc limit 20`,
    );
    saveJson("webhooks/stripe-db.json", rows);
    attach(ctx, "webhooks/stripe-db.json");
    assert(ctx, "all replayed events logged", rows.length >= EVENTS.length, `found=${rows.length}`);

    // Idempotency: replay one event, expect no duplicate row.
    const dupPayload = JSON.stringify(skeleton("evt_rc2_pi_succeeded", "payment_intent.succeeded"));
    const dupSig = stripeSignature(dupPayload, env.STRIPE_TEST_WEBHOOK_SECRET);
    const dup = await httpCall("stripe-dup-replay", env.STRIPE_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": dupSig }, body: dupPayload,
    });
    attach(ctx, dup.artifact);
    const [{ n }] = psqlJson<{ n: number }>(`select count(*)::int as n from public.stripe_webhook_events where stripe_event_id = 'evt_rc2_pi_succeeded'`);
    assert(ctx, "duplicate replay deduped", n === 1, `count=${n}`);
  });
}
