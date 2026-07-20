// Fires N parallel booking-create attempts against the same slot.
// Expect exactly one to succeed; the rest to fail with slot_conflict.
import { createClient } from "@supabase/supabase-js";
import { env } from "../config.js";
import { admin, psqlJson } from "../lib/supabase-admin.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";

const CONCURRENCY = 8;

export async function scenarioConcurrentBooking() {
  return runScenario("06-concurrent-booking", "N parallel bookings on same slot — exactly 1 winner", async (ctx) => {
    const { data: prov } = await admin
      .from("provider_profiles").select("user_id").eq("status", "active").limit(1).maybeSingle();
    if (!prov) { saveJson("concurrent/skipped.json", { reason: "no active provider on staging" }); attach(ctx, "concurrent/skipped.json"); assert(ctx, "prereq", false, "no active provider"); return; }

    const customer = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY);
    const { data: sess, error } = await customer.auth.signInWithPassword({
      email: `rc2-customer@${env.TEST_EMAIL_DOMAIN}`, password: env.TEST_PASSWORD,
    });
    if (error) throw new Error(error.message);
    const jwt = sess.session!.access_token;

    const slotStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const attempts = Array.from({ length: CONCURRENCY }, (_, i) =>
      fetch(`${env.STAGING_SUPABASE_URL}/rest/v1/rpc/create_booking_v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": env.STAGING_SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${jwt}`,
          "Idempotency-Key": `rc2-concurrent-${i}`,
        },
        body: JSON.stringify({ _provider_user_id: prov.user_id, _slot_start: slotStart, _duration_min: 120, _service: "cleaning" }),
      }).then(async (r) => ({ status: r.status, body: await r.text() })),
    );
    const results = await Promise.all(attempts);
    saveJson("concurrent/attempts.json", results);
    attach(ctx, "concurrent/attempts.json");
    const winners = results.filter((r) => r.status < 300).length;
    assert(ctx, "exactly one booking succeeded", winners === 1, `winners=${winners}/${CONCURRENCY}`);
  });
}
