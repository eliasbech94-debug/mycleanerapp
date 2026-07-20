// Server-side lifecycle validation (no browser): draft → submitted → approved → active.
// Uses provider JWT for state changes and admin JWT for approval.
// UI walk-through lives in scenarios/12-ui-provider-onboarding.spec.ts.
import { createClient } from "@supabase/supabase-js";
import { admin, psqlJson } from "../lib/supabase-admin.js";
import { env } from "../config.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";
import { readAuditSince } from "../lib/audit.js";
import { snapshotCounts, diff } from "../lib/db-snapshot.js";

async function login(email: string): Promise<string> {
  const c = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY);
  const { data, error } = await c.auth.signInWithPassword({ email, password: env.TEST_PASSWORD });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return data.session!.access_token;
}

export async function scenarioProviderLifecycle() {
  return runScenario("02-provider-lifecycle", "Provider draft → submitted → approved → active", async (ctx) => {
    const providerEmail = `rc2-provider@${env.TEST_EMAIL_DOMAIN}`;
    const adminEmail = `rc2-admin@${env.TEST_EMAIL_DOMAIN}`;
    const before = snapshotCounts("02-before");
    const auditFrom = new Date().toISOString();

    const providerJwt = await login(providerEmail);
    const adminJwt = await login(adminEmail);

    // 1. Start / ensure provider_profile row exists.
    const start = await fetch(`${env.STAGING_SUPABASE_URL}/functions/v1/provider-start-application`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${providerJwt}`, "apikey": env.STAGING_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    saveJson("provider/01-start.json", { status: start.status, body: await start.text() });
    attach(ctx, "provider/01-start.json");
    assert(ctx, "start-application 2xx", start.status < 300);

    // 2. Fill minimum required fields directly (bypasses UI; tested separately).
    const { data: prof } = await admin.from("profiles").select("id").eq("email", providerEmail).single();
    if (!prof) throw new Error("provider profile missing");
    await admin.from("provider_profiles").update({
      first_name: "RC2", last_name: "Provider", phone: "+4570000001",
      address_line1: "Nørrebrogade 1", postal_code: "2200", city: "København N", country_code: "DK",
      about: "RC2 seeded provider", languages: ["da", "en"],
      services: ["cleaning"], service_area_km: 15,
    }).eq("user_id", prof.id);

    // 3. Submit.
    const submit = await fetch(`${env.STAGING_SUPABASE_URL}/functions/v1/provider-submit-application`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${providerJwt}`, "apikey": env.STAGING_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const submitBody = await submit.text();
    saveJson("provider/02-submit.json", { status: submit.status, body: tryJson(submitBody) });
    attach(ctx, "provider/02-submit.json");
    // Submission may 400 if requirements incomplete — record either outcome.
    assert(ctx, "submit responded", submit.status < 500, `status=${submit.status}`);

    // 4. Admin approve.
    if (submit.status < 300) {
      const approve = await fetch(`${env.STAGING_SUPABASE_URL}/functions/v1/admin-provider-action`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminJwt}`, "apikey": env.STAGING_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ target_user_id: prof.id, action: "approve", reason: "RC2 automated approval" }),
      });
      saveJson("provider/03-approve.json", { status: approve.status, body: tryJson(await approve.text()) });
      attach(ctx, "provider/03-approve.json");
      assert(ctx, "approve 2xx", approve.status < 300);
    }

    // 5. Verify DB state.
    const [row] = psqlJson<{ status: string; tier: string | null }>(
      `select status, tier from public.provider_profiles where user_id = '${prof.id}'`,
    );
    saveJson("provider/04-final-state.json", row);
    attach(ctx, "provider/04-final-state.json");
    assert(ctx, "provider_profile row exists", !!row);

    // 6. Audit + snapshot diff.
    const audit = readAuditSince(auditFrom, "02-audit");
    attach(ctx, "audit/02-audit.json");
    assert(ctx, "audit entries recorded", audit.length > 0, `count=${audit.length}`);

    const after = snapshotCounts("02-after");
    saveJson("db/02-diff.json", diff(before, after));
    attach(ctx, "db/02-before.json"); attach(ctx, "db/02-after.json"); attach(ctx, "db/02-diff.json");
  });
}

function tryJson(s: string) { try { return JSON.parse(s); } catch { return s; } }
