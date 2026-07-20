// Bulk admin provider actions. Verifies each write produces an audit entry.
import { createClient } from "@supabase/supabase-js";
import { env } from "../config.js";
import { psqlJson } from "../lib/supabase-admin.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";
import { readAuditSince } from "../lib/audit.js";

export async function scenarioAdminBulk() {
  return runScenario("07-admin-bulk", "Bulk admin actions produce audit entries", async (ctx) => {
    const auditFrom = new Date().toISOString();
    const c = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY);
    const { data: sess, error } = await c.auth.signInWithPassword({
      email: `rc2-admin@${env.TEST_EMAIL_DOMAIN}`, password: env.TEST_PASSWORD,
    });
    if (error) throw new Error(error.message);
    const jwt = sess.session!.access_token;

    const targets = psqlJson<{ user_id: string }>(
      `select user_id from public.provider_profiles where status in ('active','suspended') limit 5`,
    );
    if (targets.length === 0) { saveJson("admin/skipped.json", { reason: "no targets" }); attach(ctx, "admin/skipped.json"); assert(ctx, "prereq", false, "no target providers"); return; }

    const responses: any[] = [];
    for (const [i, t] of targets.entries()) {
      const action = i % 2 === 0 ? "suspend" : "unsuspend";
      const r = await fetch(`${env.STAGING_SUPABASE_URL}/functions/v1/admin-provider-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": env.STAGING_SUPABASE_ANON_KEY, "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify({ target_user_id: t.user_id, action, reason: "rc2-bulk", idempotency_key: `rc2-bulk-${i}` }),
      });
      responses.push({ target: t.user_id, action, status: r.status, body: await r.text() });
    }
    saveJson("admin/bulk-responses.json", responses);
    attach(ctx, "admin/bulk-responses.json");
    const audit = readAuditSince(auditFrom, "07-audit");
    attach(ctx, "audit/07-audit.json");
    assert(ctx, "audit entry per action", audit.length >= targets.length, `audit=${audit.length} targets=${targets.length}`);
  });
}
