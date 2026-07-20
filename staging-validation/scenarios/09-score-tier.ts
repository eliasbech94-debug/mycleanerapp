// Calls refresh_provider_score_tier twice with the same idempotency key.
// Expect one history row (no duplicate).
import { admin, psqlJson } from "../lib/supabase-admin.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";
import { env } from "../config.js";

export async function scenarioScoreTier() {
  return runScenario("09-score-tier", "refresh_provider_score_tier idempotency", async (ctx) => {
    const { data: prof } = await admin
      .from("profiles").select("id").eq("email", `rc2-provider@${env.TEST_EMAIL_DOMAIN}`).single();
    if (!prof) throw new Error("provider profile missing");
    const key = `rc2-score-${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      await admin.rpc("refresh_provider_score_tier", { _user_id: prof.id, _event_id: key } as any);
    }
    const rows = psqlJson<{ n: number }>(
      `select count(*)::int as n from public.provider_score_history where idempotency_key = '${key}'`,
    );
    saveJson("score/idempotency.json", rows);
    attach(ctx, "score/idempotency.json");
    assert(ctx, "single history row for repeated key", rows[0]?.n === 1, `n=${rows[0]?.n}`);
  });
}
