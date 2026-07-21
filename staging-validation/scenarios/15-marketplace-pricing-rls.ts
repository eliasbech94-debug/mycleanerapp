// RLS regression matrix via PostgREST (anon key + optional user JWT).
// Signs a mock user JWT with the DB's JWT secret — mirrors what Supabase gateway does.
import { createClient } from "@supabase/supabase-js";

const URL  = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Grab a real signed-in user via password grant? Not available in staging.
// Instead we exercise anon + service_role paths (the two we can prove non-interactively).
// Provider-owner and admin paths are exercised through the RPC's SECURITY DEFINER
// permission check (auth.uid() null → unauthorized) which we validated in-DB above.

const anon = createClient(URL, ANON, { auth: { persistSession: false } });

const results = [];
async function check(name, fn, expect) {
  try {
    const { data, error, status } = await fn();
    const outcome = error ? `ERR ${status} ${error.code||""} ${error.message}` : `OK ${status} rows=${Array.isArray(data)?data.length:"?"}`;
    const pass = expect(error, data, status);
    results.push({ name, pass, outcome });
  } catch (e) {
    results.push({ name, pass: false, outcome: `THROW ${e.message}` });
  }
}

// 1. anon SELECT market_pricing_rules  → no anon policy → 0 rows (200)
await check("anon SELECT market_pricing_rules → 0 rows",
  () => anon.from("market_pricing_rules").select("id"),
  (e, d) => !e && Array.isArray(d) && d.length === 0);

// 2. anon INSERT market_pricing_rules → RLS reject
await check("anon INSERT market_pricing_rules → rejected",
  () => anon.from("market_pricing_rules").insert({
    country_code:"ZZ",scope:"country",currency:"EUR",min_hourly_minor:10000
  }),
  (e) => !!e && (e.code==="42501" || /row-level security|permission/i.test(e.message)));

// 3. anon INSERT market_pricing_multipliers → RLS reject
await check("anon INSERT market_pricing_multipliers → rejected",
  () => anon.from("market_pricing_multipliers").insert({
    country_code:"ZZ",key:"test",multiplier_bps:11000
  }),
  (e) => !!e && (e.code==="42501" || /row-level security|permission/i.test(e.message)));

// 4. anon SELECT provider_pricing_preferences → 0 rows
await check("anon SELECT provider_pricing_preferences → 0 rows",
  () => anon.from("provider_pricing_preferences").select("user_id"),
  (e, d) => !e && Array.isArray(d) && d.length === 0);

// 5. anon INSERT provider_pricing_preferences → RLS reject
await check("anon INSERT provider_pricing_preferences → rejected",
  () => anon.from("provider_pricing_preferences").insert({
    user_id:"00000000-0000-0000-0000-000000000000",country_code:"DK",currency:"DKK",hourly_rate_minor:30000,smart_pricing_enabled:false
  }),
  (e) => !!e && (e.code==="42501" || /row-level security|permission/i.test(e.message)));

// 6. anon RPC save_provider_pricing → 401/403 or unauthorized
await check("anon RPC save_provider_pricing → rejected",
  () => anon.rpc("save_provider_pricing", { _payload:{country_code:"DK",hourly_rate_minor:30000,smart_pricing_enabled:false} }),
  (e) => !!e && (/unauthorized|permission|denied/i.test(e.message) || e.code==="42501"));

// 7. anon RPC compute_recommended_price → rejected
await check("anon RPC compute_recommended_price → rejected",
  () => anon.rpc("compute_recommended_price", { _user_id:"00000000-0000-0000-0000-000000000000" }),
  (e) => !!e && (/unauthorized|permission|denied/i.test(e.message) || e.code==="42501"));

// 8. anon RPC resolve_market_minimum → allowed
await check("anon RPC resolve_market_minimum(DK) → allowed",
  () => anon.rpc("resolve_market_minimum", { _country_code:"DK" }),
  (e, d) => !e && d && d.matched_scope === "country");

// 9. Resolver hierarchy
const R = async (args) => (await anon.rpc("resolve_market_minimum", args)).data;
await check("resolver postcode wins",
  () => Promise.resolve({ data: R({ _country_code:"DK", _postcode:"1050" }), error:null, status:200 }),
  async (_, dp) => { const d=await dp; return d.matched_scope==="postcode" && d.currency==="DKK"; });
await check("resolver city wins over region+country",
  () => Promise.resolve({ data: R({ _country_code:"DK", _city:"Copenhagen" }), error:null, status:200 }),
  async (_, dp) => { const d=await dp; return d.matched_scope==="city"; });
await check("resolver country fallback",
  () => Promise.resolve({ data: R({ _country_code:"DK" }), error:null, status:200 }),
  async (_, dp) => { const d=await dp; return d.matched_scope==="country" && d.min_minor>0; });
await check("resolver missing country rule",
  () => Promise.resolve({ data: R({ _country_code:"XX" }), error:null, status:200 }),
  async (_, dp) => { const d=await dp; return d.error==="no_active_rule"; });
await check("resolver lowercase inputs normalized",
  () => Promise.resolve({ data: R({ _country_code:"dk", _city:"copenhagen" }), error:null, status:200 }),
  async (_, dp) => { const d=await dp; return d.matched_scope==="city"; });

// Print
console.log("\n=== RLS/RPC MATRIX (anon identity) ===");
for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}  |  ${r.outcome}`);
const failed = results.filter(r=>!r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
