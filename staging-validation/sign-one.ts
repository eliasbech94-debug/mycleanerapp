// Emit one pre-signed Stripe webhook payload for k6 to replay.
import { env } from "./config.js";
import { stripeSignature } from "./lib/stripe-sign.js";

const payload = JSON.stringify({
  id: `evt_rc2_k6_${Date.now()}`, object: "event", type: "payment_intent.succeeded",
  livemode: false, created: Math.floor(Date.now()/1000),
  data: { object: { id: "pi_rc2_k6", amount: 1000, currency: "dkk", status: "succeeded", metadata: {} } },
});
const signature = stripeSignature(payload, env.STRIPE_TEST_WEBHOOK_SECRET);
process.stdout.write(JSON.stringify({ payload, signature }));
