// k6 run --vus=$K6_VUS --duration=$K6_DURATION load/k6-marketplace.js
// Output: --summary-export=evidence/<run>/load/marketplace-summary.json
import http from "k6/http";
import { check } from "k6";

const URL = `${__ENV.STAGING_SUPABASE_URL}/rest/v1/rpc/search_marketplace_providers_v1`;
const ANON = __ENV.STAGING_SUPABASE_ANON_KEY;

export const options = {
  vus: Number(__ENV.K6_VUS ?? 50),
  duration: __ENV.K6_DURATION ?? "60s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

export default function () {
  const res = http.post(URL, JSON.stringify({
    _country: "DK", _services: ["cleaning"], _limit: 20, _offset: 0,
  }), {
    headers: { "Content-Type": "application/json", "apikey": ANON, "Authorization": `Bearer ${ANON}` },
  });
  check(res, { "status is 200": (r) => r.status === 200 });
}
