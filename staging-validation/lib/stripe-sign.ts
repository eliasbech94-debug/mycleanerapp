// Build a valid Stripe-Signature header so replayed webhook events are
// accepted by the deployed stripe-webhook function.
import { createHmac } from "node:crypto";

export function stripeSignature(payload: string, secret: string, tsSeconds?: number): string {
  const t = tsSeconds ?? Math.floor(Date.now() / 1000);
  const signed = `${t}.${payload}`;
  const v1 = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${t},v1=${v1}`;
}
