// ============================================================================
// Scenario 16 — P0.1 Authoritative Pricing & Locked-Quote Checkout
//
// Executes the 15 P0.1 evidence checks against real staging paths used by the
// application:
//   • /functions/v1/pricing-quote
//   • /functions/v1/payment-create-intent
//   • PostgREST (RLS regression on `bookings`)
//   • feature_flags read (regression: dynamic_pricing.enabled)
//
// Identity policy
// ---------------
//   Customer A, Customer B, Provider, Admin: real signed-in JWTs obtained via
//   password grant through the anon client (mirrors browser). Anon identity
//   uses the anon key with no bearer token.
//
//   The service-role key is used ONLY for evidence inspection (reading the
//   `pricing_calculations` row to compare against the Stripe PaymentIntent
//   amount, and creating the Customer B seed user). Every service-role read
//   is explicitly labelled `service_role_evidence_inspection` in the
//   scenario report; no user authorization assertion runs under service
//   role.
//
// Redaction
// ---------
//   All HTTP transcripts flow through lib/http.ts → lib/redact.ts. Before
//   any check runs, we assert that the redactor still masks: JWTs, Stripe
//   sk_/pk_/pi_*_secret_*/cs_/whsec_, Supabase service-role keys and
//   Authorization/apikey headers. If any canary leaks, the scenario fails
//   before making any network call.
// ============================================================================
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env, EVIDENCE_DIR, RUN_ID } from "../config.js";
import { admin } from "../lib/supabase-admin.js";
import { httpCall } from "../lib/http.js";
import { redactHeaders, redactValue } from "../lib/redact.js";
import {
  runScenario, assert, attach, saveJson, ScenarioCtx, blocked,
} from "../lib/reporter.js";

// --------------------------------------------------------------------------
// Redactor self-check — run BEFORE anything else. Fails hard if a canary
// slips through, so the harness never writes an unredacted transcript.
// --------------------------------------------------------------------------
function redactorSelfCheck(ctx: ScenarioCtx) {
  const canaries: Array<{ name: string; input: unknown; mustNotContain: string[] }> = [
    { name: "jwt", input: { token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYmMifQ.SIGNATUREvalue1234567" }, mustNotContain: ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"] },
    { name: "sk_test", input: { secret: "sk_test_1234567890abcdef" }, mustNotContain: ["sk_test_1234567890abcdef"] },
    { name: "pi_client_secret", input: { client_secret: "pi_3ABC_secret_XYZ12345" }, mustNotContain: ["pi_3ABC_secret_XYZ12345"] },
    { name: "cs_test", input: "cs_test_abcdefghij1234567890", mustNotContain: ["cs_test_abcdefghij1234567890"] },
    { name: "whsec", input: "whsec_abcdefghij1234567890", mustNotContain: ["whsec_abcdefghij1234567890"] },
    { name: "bearer", input: { any: "Bearer abcdef.ghi_jklmnop-qrstuv" }, mustNotContain: ["Bearer abcdef.ghi_jklmnop-qrstuv"] },
    { name: "auth_header", input: undefined, mustNotContain: ["real-jwt-here"] },
  ];
  for (const c of canaries) {
    let s: string;
    if (c.name === "auth_header") {
      s = JSON.stringify(redactHeaders({ authorization: "Bearer real-jwt-here", apikey: "eyJreal.jwt.here12345" }));
    } else {
      s = JSON.stringify(redactValue(c.input));
    }
    for (const bad of c.mustNotContain) {
      const leaked = s.includes(bad);
      assert(ctx, `redactor masks ${c.name}`, !leaked, leaked ? `LEAK: ${bad}` : "masked");
      if (leaked) throw new Error(`redactor self-check failed for ${c.name} — refusing to write evidence`);
    }
  }
  // Environment-value redactor: service-role key should not appear in serialised form.
  const svc = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const svcCheck = JSON.stringify(redactValue({ note: `service key: ${svc}` }));
  const svcOk = !svcCheck.includes(svc);
  assert(ctx, "redactor masks STAGING_SUPABASE_SERVICE_ROLE_KEY", svcOk);
  if (!svcOk) throw new Error("redactor did not mask service-role env value");
  saveJson("p0-pricing-checkout/00-redactor-selfcheck.json", { ok: true, canaries: canaries.map((c) => c.name) });
  attach(ctx, "p0-pricing-checkout/00-redactor-selfcheck.json");
}

// --------------------------------------------------------------------------
// Identity provisioning — idempotent, mirrors 01-seed.ts convention.
// Never adds test-user creation logic to production code paths.
// --------------------------------------------------------------------------
interface Identity {
  slot: string;
  email: string;
  user_id: string;
  jwt: string;
  provisioned: "reused" | "created";
}

async function upsertUser(email: string, role: "customer" | "provider" | "admin"): Promise<{ user_id: string; provisioned: "reused" | "created" }> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list?.users.find((u) => u.email === email);
  let provisioned: "reused" | "created" = "reused";
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email, password: env.TEST_PASSWORD, email_confirm: true,
      user_metadata: { rc2_seed: true, role },
    });
    if (created.error) throw new Error(`createUser ${email}: ${created.error.message}`);
    user = created.data.user!;
    provisioned = "created";
  } else {
    await admin.auth.admin.updateUserById(user.id, { password: env.TEST_PASSWORD, email_confirm: true });
  }
  await admin.from("profiles").upsert({ id: user.id, email, full_name: `RC2 ${role}` }, { onConflict: "id" });
  await admin.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role" });
  return { user_id: user.id, provisioned };
}

async function signIn(email: string): Promise<string> {
  const c = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: env.TEST_PASSWORD });
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message ?? "no session"}`);
  return data.session.access_token;
}

async function loadIdentities(ctx: ScenarioCtx): Promise<{ ca: Identity; cb: Identity; provider: Identity; admin: Identity }> {
  const domain = env.TEST_EMAIL_DOMAIN;
  const spec = [
    { slot: "customer_a", email: `rc2-customer@${domain}`,   role: "customer" as const },
    { slot: "customer_b", email: `rc2-customer-b@${domain}`, role: "customer" as const },
    { slot: "provider",   email: `rc2-provider@${domain}`,   role: "provider" as const },
    { slot: "admin",      email: `rc2-admin@${domain}`,      role: "admin"    as const },
  ];
  const out: Record<string, Identity> = {};
  for (const s of spec) {
    const u = await upsertUser(s.email, s.role);
    let jwt: string;
    try { jwt = await signIn(s.email); }
    catch (e) {
      assert(ctx, `identity:${s.slot}:signin`, false, (e as Error).message);
      throw new Error(`required identity ${s.slot} could not authenticate: ${(e as Error).message}`);
    }
    out[s.slot] = { slot: s.slot, email: s.email, user_id: u.user_id, jwt, provisioned: u.provisioned };
    assert(ctx, `identity:${s.slot}:${u.provisioned}`, true, `email=${s.email}`);
  }
  saveJson("p0-pricing-checkout/01-identities.json", {
    identities: Object.values(out).map((i) => ({ slot: i.slot, email: i.email, user_id: i.user_id, provisioned: i.provisioned })),
    note: "JWTs are omitted from evidence artefacts.",
  });
  attach(ctx, "p0-pricing-checkout/01-identities.json");
  return { ca: out.customer_a, cb: out.customer_b, provider: out.provider, admin: out.admin };
}

// --------------------------------------------------------------------------
// Edge function callers — always via /functions/v1/... with anon apikey +
// Bearer JWT, exactly like the browser. No service-role in these paths.
// --------------------------------------------------------------------------
function fnUrl(path: string): string {
  return `${env.STAGING_SUPABASE_URL}/functions/v1${path}`;
}
function userHeaders(jwt: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": env.STAGING_SUPABASE_ANON_KEY,
  };
  if (jwt) h["Authorization"] = `Bearer ${jwt}`;
  return h;
}

async function callQuote(label: string, jwt: string | null, body: unknown) {
  return httpCall(`p0/${label}`, fnUrl("/pricing-quote"), {
    method: "POST",
    headers: userHeaders(jwt),
    body: JSON.stringify(body),
  });
}
async function callIntent(label: string, jwt: string | null, body: unknown) {
  return httpCall(`p0/${label}`, fnUrl("/payment-create-intent"), {
    method: "POST",
    headers: userHeaders(jwt),
    body: JSON.stringify(body),
  });
}

// --------------------------------------------------------------------------
// Provider discovery — the quote engine requires a bookable provider_profiles
// row. We reuse whatever seed 02-provider-lifecycle produced; if none exists
// we mark the scenario BLOCKED rather than fabricating one.
// --------------------------------------------------------------------------
async function pickBookableProvider(): Promise<{
  user_id: string; provider_slug: string | null; country_code: string;
  currency: string; service_category: string; hourly_rate: number;
} | null> {
  const { data } = await admin
    .from("provider_profiles")
    .select("user_id, provider_slug, country_code, service_categories, hourly_rate, status, visibility")
    .eq("status", "active").eq("visibility", "public")
    .not("hourly_rate", "is", null)
    .limit(20);
  const row = (data ?? []).find((r) => Array.isArray(r.service_categories) && r.service_categories.length > 0 && r.hourly_rate > 0);
  if (!row) return null;
  const service_category = (row.service_categories as string[])[0];
  const { data: cfg } = await admin.rpc("get_published_country_config", { _iso: row.country_code });
  const cc = Array.isArray(cfg) ? cfg[0] : cfg;
  if (!cc) return null;
  return {
    user_id: row.user_id, provider_slug: row.provider_slug ?? null,
    country_code: row.country_code, currency: String(cc.currency).toUpperCase(),
    service_category, hourly_rate: row.hourly_rate,
  };
}

// --------------------------------------------------------------------------
// Report writer — machine-readable rc2.json alongside the harness's report.
// --------------------------------------------------------------------------
function commitSha(): string {
  try { return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); }
  catch { return "unknown"; }
}
function writeP0Report(ctx: ScenarioCtx, totals: { pass: number; fail: number; skip: number }, discrepancies: string[]) {
  const payload = {
    scenario: "16-p0-pricing-checkout",
    run_id: RUN_ID,
    commit_sha: commitSha(),
    generated_at: new Date().toISOString(),
    totals: { ...totals, total: ctx.assertions.length },
    assertions: ctx.assertions,
    artifacts: ctx.artifacts,
    discrepancies,
    service_role_usage: [
      "identity upsert (auth.admin, mirrors 01-seed.ts)",
      "provider discovery (provider_profiles read)",
      "evidence inspection of pricing_calculations after quote (labelled)",
    ],
    redaction_confirmed: true,
  };
  const rel = `reports/rc2.json`;
  const abs = `${EVIDENCE_DIR}/${rel}`;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(payload, null, 2));
  attach(ctx, rel);
}

// --------------------------------------------------------------------------
// Scenario
// --------------------------------------------------------------------------
export async function scenarioP0PricingCheckout() {
  return runScenario(
    "16-p0-pricing-checkout",
    "P0.1 authoritative pricing & locked-quote checkout (15-check matrix)",
    async (ctx) => {
      const discrepancies: string[] = [];
      redactorSelfCheck(ctx);
      const ids = await loadIdentities(ctx);

      const prov = await pickBookableProvider();
      if (!prov) {
        saveJson("p0-pricing-checkout/blocked.json", { reason: "no bookable provider_profiles row on staging" });
        attach(ctx, "p0-pricing-checkout/blocked.json");
        blocked("no bookable provider on staging (requires 02-provider-lifecycle to have produced an active/public provider with hourly_rate + service_categories)");
      }
      const providerIdText = prov!.provider_slug ?? prov!.user_id;
      const startAt = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
      const bookingDate = startAt.slice(0, 10);
      const baseQuoteBody = {
        provider_id_text: providerIdText,
        service_category: prov!.service_category,
        currency: prov!.currency,
        start_at: startAt,
        duration_minutes: 120,
        quote_context: "customer_checkout",
      };

      // -------------------- QUOTE CREATION (checks 1–7) --------------------

      // 1. Valid DB provider receives a quote.
      const q1 = await callQuote("01-valid-quote", ids.ca.jwt, baseQuoteBody);
      attach(ctx, q1.artifact);
      const quoteOk = q1.status === 200 && typeof q1.json?.quote_id === "string";
      assert(ctx, "01 valid provider receives quote", quoteOk, `status=${q1.status}`);
      const quoteId: string | null = quoteOk ? q1.json.quote_id : null;

      // 2. Fixture / unknown provider → provider_not_found.
      const q2 = await callQuote("02-unknown-provider", ids.ca.jwt, {
        ...baseQuoteBody, provider_id_text: `fixture-does-not-exist-${RUN_ID}`,
      });
      attach(ctx, q2.artifact);
      assert(ctx, "02 unknown provider rejected with provider_not_found",
        q2.status === 400 && q2.json?.error === "provider_not_found",
        `status=${q2.status} error=${JSON.stringify(q2.json?.error)}`);

      // 3+4. Provider market determines currency; client-supplied currency cannot influence.
      const wrongCurrency = prov!.currency === "USD" ? "EUR" : "USD";
      const q3 = await callQuote("03-wrong-currency", ids.ca.jwt, {
        ...baseQuoteBody, currency: wrongCurrency,
      });
      attach(ctx, q3.artifact);
      assert(ctx, "03 client-supplied currency rejected (currency_country_mismatch)",
        q3.status === 400 && q3.json?.error === "currency_country_mismatch",
        `status=${q3.status} error=${JSON.stringify(q3.json?.error)}`);
      assert(ctx, "04 quote currency equals provider market currency",
        quoteOk && q1.json.currency === prov!.currency,
        `quote.currency=${q1.json?.currency} market=${prov!.currency}`);

      // 5. dynamic_pricing.enabled is still false; static pricing still works.
      const { data: flag } = await admin.from("feature_flags")
        .select("enabled").eq("flag_key", "dynamic_pricing.enabled").maybeSingle();
      const flagOff = flag?.enabled === false;
      assert(ctx, "05 dynamic_pricing.enabled remains false", flagOff, `enabled=${flag?.enabled}`);

      // 6. Dynamic surcharges remain disabled → pricing_mode is 'static' and no surcharge bps set.
      const dynDisabled = quoteOk && q1.json.pricing_mode === "static";
      assert(ctx, "06 dynamic surcharges disabled (pricing_mode=static)",
        dynDisabled, `mode=${q1.json?.pricing_mode}`);

      // 7. Quote returns expected provider/country/currency and split-fee totals.
      let quoteRowOk = false;
      let quoteRow: any = null;
      if (quoteId) {
        // service_role evidence inspection — clearly labelled.
        const { data: row } = await admin
          .from("pricing_calculations")
          .select("id, provider_user_id, country_code, currency, subtotal_minor, customer_total_minor, provider_net_minor, platform_fee_minor, commission_bps, customer_half_bps, provider_half_bps, status, expires_at, quote_context")
          .eq("id", quoteId).maybeSingle();
        quoteRow = row;
        saveJson("p0-pricing-checkout/07-quote-row.evidence.json", { source: "service_role_evidence_inspection", row: redactValue(row) });
        attach(ctx, "p0-pricing-checkout/07-quote-row.evidence.json");
        if (row) {
          const expectedCust = Math.ceil(row.subtotal_minor * (10000 + row.customer_half_bps) / 10000);
          const expectedProv = Math.floor(row.subtotal_minor * (10000 - row.provider_half_bps) / 10000);
          quoteRowOk =
            row.provider_user_id === prov!.user_id &&
            row.country_code === prov!.country_code &&
            row.currency === prov!.currency &&
            row.customer_total_minor === expectedCust &&
            row.provider_net_minor === expectedProv &&
            row.platform_fee_minor === row.customer_total_minor - row.provider_net_minor;
        }
      }
      assert(ctx, "07 quote row matches split-fee invariant + expected provider/country/currency",
        quoteRowOk, quoteRow ? `subtotal=${quoteRow.subtotal_minor} cust=${quoteRow.customer_total_minor} prov=${quoteRow.provider_net_minor}` : "no row");

      // ---------------- OWNERSHIP & LIFECYCLE (checks 8–11) ----------------

      // Baseline booking body (all money fields absent — server-authoritative).
      const baseBookBody = {
        quote_id: quoteId,
        booking_date: bookingDate,
        slot: "09:00",
        address: "RC2 Test Address 1",
        notes: `rc2 ${RUN_ID}`,
      };

      // 8. Customer B cannot use Customer A's quote.
      const c8 = await callIntent("08-other-customer-quote", ids.cb.jwt, baseBookBody);
      attach(ctx, c8.artifact);
      assert(ctx, "08 Customer B cannot use Customer A's quote",
        c8.status === 403 && c8.json?.error === "quote_not_owned",
        `status=${c8.status} error=${JSON.stringify(c8.json?.error)}`);

      // 9. Anonymous rejected (no bearer token).
      const c9 = await callIntent("09-anonymous", null, baseBookBody);
      attach(ctx, c9.artifact);
      assert(ctx, "09 anonymous rejected (401 Unauthorized)",
        c9.status === 401,
        `status=${c9.status}`);

      // 10. Expired quote rejected. We force-expire via service_role (labelled evidence-op).
      // Create a fresh quote first so we don't corrupt the primary quoteId.
      const q10 = await callQuote("10a-quote-to-expire", ids.ca.jwt, baseQuoteBody);
      attach(ctx, q10.artifact);
      const expQuoteId = q10.json?.quote_id;
      if (expQuoteId) {
        await admin.from("pricing_calculations")
          .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
          .eq("id", expQuoteId);
        const c10 = await callIntent("10b-expired-quote", ids.ca.jwt, { ...baseBookBody, quote_id: expQuoteId });
        attach(ctx, c10.artifact);
        assert(ctx, "10 expired quote rejected",
          c10.status === 400 && c10.json?.error === "quote_expired",
          `status=${c10.status} error=${JSON.stringify(c10.json?.error)}`);
      } else {
        assert(ctx, "10 expired quote rejected", false, "could not create expiry-test quote");
      }

      // ---------------- TAMPERING (checks 11–13) ----------------

      // 11. Manipulated customer_pays / provider_gets / currency / platform_fee are ignored.
      const tampered = {
        ...baseBookBody,
        customer_pays: 1,
        provider_gets: 1,
        platform_fee: 1,
        currency: wrongCurrency,
        commission: 9999,
      };
      const c11 = await callIntent("11-tampered-fields", ids.ca.jwt, tampered);
      attach(ctx, c11.artifact);
      // Success paths: either schema strip → 200 + booking created with quote amounts,
      // OR 400 explicitly rejecting unknown fields. Either is acceptable so long as
      // no tampered value takes effect. We assert non-effect via checks 12–13.
      assert(ctx, "11 payment-create-intent tolerates or rejects tampered money fields (no crash)",
        c11.status === 200 || (c11.status >= 400 && c11.status < 500),
        `status=${c11.status}`);
      const firstBookingId = c11.status === 200 ? c11.json?.booking_id : null;
      const firstPI = c11.status === 200 ? c11.json?.payment_intent_id : null;

      // If the tampered call did not succeed, retry cleanly to establish a booking
      // for the amount-equality + idempotency checks.
      let bookingId = firstBookingId;
      let paymentIntentId = firstPI;
      if (!bookingId) {
        const c11b = await callIntent("11b-clean-checkout", ids.ca.jwt, baseBookBody);
        attach(ctx, c11b.artifact);
        assert(ctx, "11b clean checkout succeeds", c11b.status === 200 && !!c11b.json?.booking_id,
          `status=${c11b.status}`);
        bookingId = c11b.json?.booking_id;
        paymentIntentId = c11b.json?.payment_intent_id;
      }

      // 12. Booking financial fields equal locked quote (customer_pays, provider_gets, currency, platform_fee_amount).
      let bookingFieldsOk = false;
      let bookingRow: any = null;
      if (bookingId && quoteRow) {
        const { data: br } = await admin
          .from("bookings")
          .select("id, customer_pays, provider_gets, currency, platform_fee_amount, pricing_calculation_id, payment_intent_id")
          .eq("id", bookingId).maybeSingle();
        bookingRow = br;
        saveJson("p0-pricing-checkout/12-booking-row.evidence.json", { source: "service_role_evidence_inspection", row: redactValue(br) });
        attach(ctx, "p0-pricing-checkout/12-booking-row.evidence.json");
        bookingFieldsOk = !!br &&
          br.customer_pays === quoteRow.customer_total_minor &&
          br.provider_gets === quoteRow.provider_net_minor &&
          br.currency === quoteRow.currency &&
          br.platform_fee_amount === quoteRow.platform_fee_minor &&
          br.pricing_calculation_id === quoteRow.id;
      }
      assert(ctx, "12 booking money fields byte-exact match locked quote",
        bookingFieldsOk,
        bookingRow ? `bk=${JSON.stringify({ c: bookingRow.customer_pays, p: bookingRow.provider_gets, cur: bookingRow.currency, f: bookingRow.platform_fee_amount })}` : "no booking row");

      // 13. Stripe PI amount equals pricing_calculations.customer_total_minor.
      // Do NOT expose client_secret; only read {amount, currency, id, metadata}.
      let piAmountOk = false;
      let piRedactedEvidence: any = null;
      if (paymentIntentId) {
        const stripeRes = await httpCall("p0/13-stripe-pi-inspect",
          `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`,
          { method: "GET", headers: { Authorization: `Bearer ${env.STRIPE_TEST_SECRET_KEY}` } });
        // stripeRes goes through httpCall; both Authorization header and any pi_*_secret_* in body are redacted.
        attach(ctx, stripeRes.artifact);
        const pi = stripeRes.json;
        piRedactedEvidence = { id: pi?.id, amount: pi?.amount, currency: pi?.currency, capture_method: pi?.capture_method, metadata: pi?.metadata };
        piAmountOk = pi?.amount === quoteRow?.customer_total_minor &&
          String(pi?.currency).toUpperCase() === String(quoteRow?.currency).toUpperCase();
        saveJson("p0-pricing-checkout/13-stripe-pi.summary.json", piRedactedEvidence);
        attach(ctx, "p0-pricing-checkout/13-stripe-pi.summary.json");
      }
      assert(ctx, "13 Stripe PaymentIntent amount == pricing_calculations.customer_total_minor",
        piAmountOk, piRedactedEvidence ? `pi.amount=${piRedactedEvidence.amount} vs quote=${quoteRow?.customer_total_minor}` : "no PI");

      // ---------------- IDEMPOTENCY & UNIQUE INDEX (checks 14–15) ----------------

      // 14. Repeat the same quote_id: should idempotently return the same booking + PI.
      const c14a = await callIntent("14a-replay-one", ids.ca.jwt, baseBookBody);
      const c14b = await callIntent("14b-replay-two", ids.ca.jwt, baseBookBody);
      attach(ctx, c14a.artifact); attach(ctx, c14b.artifact);
      const sameBooking = c14a.json?.booking_id === bookingId && c14b.json?.booking_id === bookingId;
      const samePI = c14a.json?.payment_intent_id === paymentIntentId && c14b.json?.payment_intent_id === paymentIntentId;
      assert(ctx, "14 repeated payment-create-intent returns same booking_id + payment_intent_id (Stripe Idempotency-Key: pi:quote:<id>)",
        sameBooking && samePI,
        `sameBooking=${sameBooking} samePI=${samePI}`);

      // 15. bookings_pricing_calculation_id_uniq prevents duplicate rows.
      const { count: dupCount } = await admin
        .from("bookings").select("id", { count: "exact", head: true })
        .eq("pricing_calculation_id", quoteId);
      saveJson("p0-pricing-checkout/15-booking-count.evidence.json", { source: "service_role_evidence_inspection", pricing_calculation_id: quoteId, count: dupCount });
      attach(ctx, "p0-pricing-checkout/15-booking-count.evidence.json");
      assert(ctx, "15 bookings_pricing_calculation_id_uniq → exactly one booking per quote",
        dupCount === 1, `count=${dupCount}`);

      // ---------------- RLS regression (bonus, mandated by brief) ----------------

      // Direct customer INSERT into bookings must fail through PostgREST.
      const rlsRes = await httpCall("p0/rls-direct-insert-bookings",
        `${env.STAGING_SUPABASE_URL}/rest/v1/bookings`,
        {
          method: "POST",
          headers: {
            ...userHeaders(ids.ca.jwt),
            "Prefer": "return=representation",
          },
          body: JSON.stringify({
            customer_user_id: ids.ca.user_id,
            provider_id: providerIdText,
            service: prov!.service_category,
            hours: 2, booking_date: bookingDate, slot: "10:00",
            address: "RLS regression", customer_pays: 1, provider_gets: 1,
            currency: prov!.currency, status: "pending", payment_status: "unpaid",
          }),
        });
      attach(ctx, rlsRes.artifact);
      assert(ctx, "RLS direct INSERT into bookings as customer is denied",
        rlsRes.status === 401 || rlsRes.status === 403 ||
        (rlsRes.status >= 400 && /row-level security|permission|denied|policy/i.test(rlsRes.body)),
        `status=${rlsRes.status}`);

      // Regression: dynamic_pricing.enabled still false at end of scenario.
      const { data: flagAfter } = await admin.from("feature_flags")
        .select("enabled, updated_at").eq("flag_key", "dynamic_pricing.enabled").maybeSingle();
      saveJson("p0-pricing-checkout/regression-flag.evidence.json", { source: "service_role_evidence_inspection", flag: flagAfter });
      attach(ctx, "p0-pricing-checkout/regression-flag.evidence.json");
      assert(ctx, "regression: dynamic_pricing.enabled remains false after scenario",
        flagAfter?.enabled === false, `enabled=${flagAfter?.enabled}`);

      // ---- final report ----
      const pass = ctx.assertions.filter((a) => a.ok).length;
      const fail = ctx.assertions.length - pass;
      writeP0Report(ctx, { pass, fail, skip: 0 }, discrepancies);
    },
  );
}

// Manual run: `bun x tsx staging-validation/scenarios/16-p0-pricing-checkout.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  scenarioP0PricingCheckout()
    .then((r) => { console.log(JSON.stringify({ status: r.status, pass: r.assertions.filter(a=>a.ok).length, total: r.assertions.length }, null, 2)); process.exit(r.status === "PASS" ? 0 : 1); })
    .catch((e) => { console.error(e); process.exit(1); });
}
