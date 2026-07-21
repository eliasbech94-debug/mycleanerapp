// End-to-end concurrency and negative-path suite for lock_pricing_quote.
// Requires a real quote + booking pair seeded on staging.
import { admin } from "../lib/supabase-admin.js";
import { runScenario, assert, saveJson, attach } from "../lib/reporter.js";

async function seedQuoteAndBooking() {
  // Minimal seed: reuses seeded rc2-customer / rc2-provider from scenario 01.
  const { data: prov } = await admin.from("provider_profiles").select("user_id").eq("status","active").limit(1).maybeSingle();
  const { data: cust } = await admin.from("profiles").select("id").eq("role","customer").limit(1).maybeSingle();
  if (!prov || !cust) throw new Error("seed missing: run scenarios/01-seed.ts first");

  const start = new Date(Date.now() + 3600_000).toISOString();
  const { data: booking, error: bErr } = await admin.from("bookings").insert({
    customer_user_id: cust.id, provider_user_id: prov.user_id,
    start_at: start, duration_minutes: 120, currency: "DKK", country_code: "DK",
    service_category: "cleaning", status: "pending",
  }).select("id").single();
  if (bErr) throw new Error(`booking insert: ${bErr.message}`);

  const { data: quote, error: qErr } = await admin.from("pricing_calculations").insert({
    customer_user_id: cust.id, provider_id_text: prov.user_id,
    country_code: "DK", currency: "DKK", service_category: "cleaning",
    start_at: start, duration_minutes: 120,
    subtotal_minor: 60000, customer_total_minor: 68400, provider_net_minor: 51600, platform_fee_minor: 16800,
    fingerprint: "test-fp-" + crypto.randomUUID(),
    status: "quoted", expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).select("id, fingerprint").single();
  if (qErr) throw new Error(`quote insert: ${qErr.message}`);

  return { booking, quote, customer_id: cust.id, provider_id: prov.user_id };
}

export async function scenarioLockRpcConcurrency() {
  return runScenario("14-lock-rpc-concurrency", "lock_pricing_quote — full negative + concurrency matrix", async (ctx) => {
    const seed = await seedQuoteAndBooking();
    const good = {
      _quote_id: seed.quote.id, _booking_id: seed.booking.id,
      _fingerprint: seed.quote.fingerprint, _customer_user_id: seed.customer_id,
      _country_code: "DK", _currency: "DKK",
    };

    const cases: { name: string; args: any; expectErr: RegExp | null }[] = [
      { name: "wrong customer",     args: { ...good, _customer_user_id: "00000000-0000-0000-0000-000000000000" }, expectErr: /customer/i },
      { name: "wrong currency",     args: { ...good, _currency: "EUR" }, expectErr: /currenc/i },
      { name: "wrong country",      args: { ...good, _country_code: "SE" }, expectErr: /countr/i },
      { name: "fingerprint mismatch", args: { ...good, _fingerprint: "nope" }, expectErr: /fingerprint/i },
      { name: "wrong booking",      args: { ...good, _booking_id: "00000000-0000-0000-0000-000000000000" }, expectErr: /booking/i },
      { name: "wrong quote",        args: { ...good, _quote_id: "00000000-0000-0000-0000-000000000000" }, expectErr: /quote|not.?found/i },
    ];
    const results: any[] = [];
    for (const c of cases) {
      const { error } = await admin.rpc("lock_pricing_quote", c.args);
      const pass = c.expectErr ? c.expectErr.test(error?.message ?? "") : error === null;
      assert(ctx, c.name, pass, error?.message ?? "no error");
      results.push({ ...c, err: error?.message ?? null });
    }

    // Concurrency — 8 parallel calls with the correct args. Exactly one wins.
    const parallel = await Promise.all(
      Array.from({ length: 8 }, () => admin.rpc("lock_pricing_quote", good)),
    );
    const winners = parallel.filter((r) => r.error === null).length;
    assert(ctx, "exactly one concurrent winner", winners === 1, `winners=${winners}`);
    results.push({ concurrency: { winners, total: 8 } });

    // Already locked — must reject.
    const { error: e2 } = await admin.rpc("lock_pricing_quote", good);
    assert(ctx, "re-lock rejected", /already|locked|terminal/i.test(e2?.message ?? ""), e2?.message ?? "no error");

    // Expired quote — synthesise a new expired quote and try.
    const { data: expired } = await admin.from("pricing_calculations").insert({
      customer_user_id: seed.customer_id, provider_id_text: seed.provider_id,
      country_code: "DK", currency: "DKK", service_category: "cleaning",
      start_at: new Date(Date.now() + 3600_000).toISOString(), duration_minutes: 120,
      subtotal_minor: 60000, customer_total_minor: 68400, provider_net_minor: 51600, platform_fee_minor: 16800,
      fingerprint: "exp-" + crypto.randomUUID(),
      status: "quoted", expires_at: new Date(Date.now() - 60_000).toISOString(),
    }).select("id, fingerprint").single();
    const { error: eExp } = await admin.rpc("lock_pricing_quote", {
      ...good, _quote_id: expired!.id, _fingerprint: expired!.fingerprint,
    });
    assert(ctx, "expired quote rejected", /expired/i.test(eExp?.message ?? ""), eExp?.message ?? "no error");

    // Superseded — mark quote superseded and try.
    const { data: sup } = await admin.from("pricing_calculations").insert({
      customer_user_id: seed.customer_id, provider_id_text: seed.provider_id,
      country_code: "DK", currency: "DKK", service_category: "cleaning",
      start_at: new Date(Date.now() + 3600_000).toISOString(), duration_minutes: 120,
      subtotal_minor: 60000, customer_total_minor: 68400, provider_net_minor: 51600, platform_fee_minor: 16800,
      fingerprint: "sup-" + crypto.randomUUID(),
      status: "superseded", expires_at: new Date(Date.now() + 600_000).toISOString(),
    }).select("id, fingerprint").single();
    const { error: eSup } = await admin.rpc("lock_pricing_quote", {
      ...good, _quote_id: sup!.id, _fingerprint: sup!.fingerprint,
    });
    assert(ctx, "superseded quote rejected", /supersed|terminal|status/i.test(eSup?.message ?? ""), eSup?.message ?? "no error");

    saveJson("pricing/lock-rpc.json", results);
    attach(ctx, "pricing/lock-rpc.json");
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scenarioLockRpcConcurrency().then(() => process.exit(0));
}
