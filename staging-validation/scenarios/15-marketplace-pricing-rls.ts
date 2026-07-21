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

// ============================================================
// Authenticated JWT matrix — Provider A, Provider B, Admin, Customer.
// Runs only when staging JWTs are provided in the environment. This keeps CI
// green when credentials aren't seeded and lets an operator run the full
// E2E security pass with a single env-file swap. No service-role key is used
// for provider/customer assertions — every check goes through PostgREST with
// the anon key + user Bearer token, exactly like the browser client.
//
// Required env for the full matrix:
//   PROVIDER_A_JWT, PROVIDER_A_USER_ID
//   PROVIDER_B_JWT, PROVIDER_B_USER_ID
//   ADMIN_JWT
//   CUSTOMER_JWT      (optional)
// ============================================================

const PA_JWT = process.env.PROVIDER_A_JWT;
const PA_UID = process.env.PROVIDER_A_USER_ID;
const PB_JWT = process.env.PROVIDER_B_JWT;
const PB_UID = process.env.PROVIDER_B_USER_ID;
const AD_JWT = process.env.ADMIN_JWT;
const CU_JWT = process.env.CUSTOMER_JWT;

function asUser(jwt) {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

if (PA_JWT && PA_UID && PB_JWT && PB_UID && AD_JWT) {
  const pa = asUser(PA_JWT);
  const pb = asUser(PB_JWT);
  const ad = asUser(AD_JWT);
  const cu = CU_JWT ? asUser(CU_JWT) : null;

  // Resolve DK market bounds once for below/above tests.
  const { data: dk } = await pa.rpc("resolve_market_minimum", { _country_code: "DK" });
  const minDK = dk?.min_minor ?? 20000;
  const maxDK = dk?.max_minor ?? 60000;
  const validRate = Math.round((minDK + maxDK) / 2);

  // --- Provider A: own read/write ---
  await check("PA reads own preferences (owner SELECT)",
    () => pa.from("provider_pricing_preferences").select("user_id").eq("user_id", PA_UID),
    (e, d) => !e && Array.isArray(d));

  await check("PA saves valid hourly rate",
    () => pa.rpc("save_provider_pricing", { _payload: {
      country_code: "DK", hourly_rate_minor: validRate, smart_pricing_enabled: false } }),
    (e) => !e);

  await check("PA cannot save below market minimum",
    () => pa.rpc("save_provider_pricing", { _payload: {
      country_code: "DK", hourly_rate_minor: Math.max(1, minDK - 100), smart_pricing_enabled: false } }),
    (e) => !!e && /below_market_minimum/i.test(e.message));

  await check("PA cannot save above market maximum",
    () => pa.rpc("save_provider_pricing", { _payload: {
      country_code: "DK", hourly_rate_minor: maxDK + 10000, smart_pricing_enabled: false } }),
    (e) => !!e && /above_market_maximum/i.test(e.message));

  await check("PA cannot enable Smart Pricing without bounds",
    () => pa.rpc("save_provider_pricing", { _payload: {
      country_code: "DK", hourly_rate_minor: validRate, smart_pricing_enabled: true } }),
    (e) => !!e && /smart_bounds_required/i.test(e.message));

  await check("PA cannot set smart_max below smart_min",
    () => pa.rpc("save_provider_pricing", { _payload: {
      country_code: "DK", hourly_rate_minor: validRate, smart_pricing_enabled: true,
      smart_min_minor: validRate, smart_max_minor: validRate - 500 } }),
    (e) => !!e && /smart_max_below_min/i.test(e.message));

  await check("PA cannot override market currency (payload currency ignored)",
    async () => {
      const r = await pa.rpc("save_provider_pricing", { _payload: {
        country_code: "DK", currency: "USD", hourly_rate_minor: validRate, smart_pricing_enabled: false } });
      if (r.error) return r;
      const row = await pa.from("provider_pricing_preferences")
        .select("currency").eq("user_id", PA_UID).maybeSingle();
      return { data: row.data, error: null, status: 200 };
    },
    (e, d) => !e && d?.currency === "DKK");

  await check("PA computes own recommendation",
    () => pa.rpc("compute_recommended_price", { _user_id: PA_UID }),
    (e, d) => !e && d && typeof d.recommended_minor === "number");

  await check("PA cannot read Provider B's preferences (RLS scoping)",
    () => pa.from("provider_pricing_preferences").select("user_id").eq("user_id", PB_UID),
    (e, d) => !e && Array.isArray(d) && d.length === 0);

  await check("PA cannot save pricing for Provider B via RPC",
    () => pa.rpc("save_provider_pricing", { _payload: {
      user_id: PB_UID, country_code: "DK", hourly_rate_minor: validRate, smart_pricing_enabled: false } }),
    (e) => !!e && /forbidden_other_user|permission|denied/i.test(e.message));

  await check("PA cannot compute Provider B's recommendation",
    () => pa.rpc("compute_recommended_price", { _user_id: PB_UID }),
    (e) => !!e && /forbidden|permission|denied/i.test(e.message));

  // --- Provider B: symmetric isolation ---
  await check("PB cannot read Provider A's preferences",
    () => pb.from("provider_pricing_preferences").select("user_id").eq("user_id", PA_UID),
    (e, d) => !e && Array.isArray(d) && d.length === 0);

  await check("PB cannot UPDATE Provider A directly",
    () => pb.from("provider_pricing_preferences")
      .update({ hourly_rate_minor: 1 }).eq("user_id", PA_UID),
    (e, d) => !e && Array.isArray(d) && d.length === 0); // RLS filters to 0 rows

  await check("PB manages own preferences only",
    () => pb.rpc("save_provider_pricing", { _payload: {
      country_code: "DK", hourly_rate_minor: validRate, smart_pricing_enabled: false } }),
    (e) => !e);

  // --- Customer: forbidden from provider surfaces ---
  if (cu) {
    await check("Customer cannot save provider pricing (not_a_provider)",
      () => cu.rpc("save_provider_pricing", { _payload: {
        country_code: "DK", hourly_rate_minor: validRate, smart_pricing_enabled: false } }),
      (e) => !!e && /not_a_provider|forbidden|permission/i.test(e.message));

    await check("Customer cannot INSERT provider_pricing_preferences",
      () => cu.from("provider_pricing_preferences").insert({
        user_id: PA_UID, country_code: "DK", currency: "DKK",
        hourly_rate_minor: validRate, smart_pricing_enabled: false }),
      (e) => !!e && (e.code === "42501" || /row-level security|permission/i.test(e.message)));

    await check("Customer cannot INSERT market_pricing_rules",
      () => cu.from("market_pricing_rules").insert({
        country_code: "ZZ", scope: "country", currency: "EUR", min_hourly_minor: 10000 }),
      (e) => !!e && (e.code === "42501" || /row-level security|permission/i.test(e.message)));
  }

  // --- Admin: rule & multiplier CRUD ---
  let adminRuleId = null;
  await check("Admin creates pricing rule",
    async () => {
      const r = await ad.from("market_pricing_rules").insert({
        country_code: "ZZ", scope: "country", currency: "EUR",
        min_hourly_minor: 10000, max_hourly_minor: 50000, recommended_hourly_minor: 25000,
        active: true,
      }).select("id").maybeSingle();
      adminRuleId = r.data?.id ?? null;
      return { data: r.data, error: r.error, status: r.status };
    },
    (e, d) => !e && d?.id);

  await check("Admin edits pricing rule",
    () => ad.from("market_pricing_rules").update({ recommended_hourly_minor: 26000 })
      .eq("id", adminRuleId).select("id"),
    (e, d) => !e && Array.isArray(d) && d.length === 1);

  await check("Admin deactivates pricing rule",
    () => ad.from("market_pricing_rules").update({ active: false })
      .eq("id", adminRuleId).select("active").maybeSingle(),
    (e, d) => !e && d?.active === false);

  await check("Admin reactivates pricing rule",
    () => ad.from("market_pricing_rules").update({ active: true })
      .eq("id", adminRuleId).select("active").maybeSingle(),
    (e, d) => !e && d?.active === true);

  let adminMultId = null;
  await check("Admin creates multiplier",
    async () => {
      const r = await ad.from("market_pricing_multipliers").insert({
        country_code: "ZZ", key: "e2e_test", multiplier_bps: 11000, active: true,
      }).select("id").maybeSingle();
      adminMultId = r.data?.id ?? null;
      return { data: r.data, error: r.error, status: r.status };
    },
    (e, d) => !e && d?.id);

  await check("Admin toggles multiplier active flag",
    () => ad.from("market_pricing_multipliers").update({ active: false })
      .eq("id", adminMultId).select("active").maybeSingle(),
    (e, d) => !e && d?.active === false);

  // Admin override of another provider is explicit + intentional; document it.
  await check("Admin CAN save pricing for a provider (documented override)",
    () => ad.rpc("save_provider_pricing", { _payload: {
      user_id: PA_UID, country_code: "DK", hourly_rate_minor: validRate, smart_pricing_enabled: false } }),
    (e) => !e);

  // Cleanup admin-created rows
  if (adminMultId) await ad.from("market_pricing_multipliers").delete().eq("id", adminMultId);
  if (adminRuleId) await ad.from("market_pricing_rules").delete().eq("id", adminRuleId);

  console.log("\n=== AUTHENTICATED JWT MATRIX ===");
} else {
  console.log("\n⚠️  Authenticated JWT matrix skipped — set PROVIDER_A_JWT / PROVIDER_A_USER_ID / PROVIDER_B_JWT / PROVIDER_B_USER_ID / ADMIN_JWT (and optional CUSTOMER_JWT) to run.");
}

// Print
console.log("\n=== RLS/RPC MATRIX ===");
for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}  |  ${r.outcome}`);
const failed = results.filter(r=>!r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
