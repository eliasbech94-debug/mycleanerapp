// Load-test the stripe-webhook endpoint with valid signatures.
// NOTE: k6 doesn't ship HMAC helpers by default — we pre-generate one signed
// payload in Node and pass it via env, so k6 just replays it. This measures
// throughput and dedup behaviour, not signature-generation cost.
import http from "k6/http";
import { check } from "k6";

const URL = __ENV.STRIPE_WEBHOOK_URL;
const PAYLOAD = __ENV.RC2_SIGNED_PAYLOAD;
const SIG = __ENV.RC2_SIGNED_HEADER;

export const options = {
  vus: Number(__ENV.K6_VUS ?? 20),
  duration: __ENV.K6_DURATION ?? "30s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1500"],
  },
};

export default function () {
  const res = http.post(URL, PAYLOAD, {
    headers: { "Content-Type": "application/json", "stripe-signature": SIG },
  });
  check(res, { "webhook 200": (r) => r.status === 200 });
}
