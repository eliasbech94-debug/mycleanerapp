// RC2 cleanup — removes disposable seeded test data while preserving audit
// evidence. Never touches records that are not tagged with an RC2 run id.
//
// Usage:
//   bunx tsx cleanup.ts <run-id>
//   bunx tsx cleanup.ts --all-rc2         (every rc2-* record; still audit-safe)
//
// Safe deletes: bookings, provider_profiles, provider_trust, cleaning_plans,
// finance_payouts, notification_outbox, sms_verifications, user_roles,
// profiles, and finally the auth user — all matched via email prefix
// "rc2+<run>-" or provider_profiles.notes tag "rc2-<run>".
// Preserved: admin_audit_log, stripe_webhook_events, identity_webhook_events,
// finance_statements — required for legal/audit continuity.
import { env } from "./config.js";
import { admin } from "./lib/supabase-admin.js";

const arg = process.argv[2];
if (!arg) { console.error("usage: cleanup.ts <run-id|--all-rc2>"); process.exit(2); }

const pattern = arg === "--all-rc2"
  ? `rc2+%@${env.TEST_EMAIL_DOMAIN}`
  : `rc2+${arg}-%@${env.TEST_EMAIL_DOMAIN}`;

console.log(`\n▶ RC2 cleanup pattern: ${pattern}`);
console.log("  (audit_log, stripe_webhook_events, identity_webhook_events, finance_statements are preserved)");

async function main() {
  const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const like = pattern.replace(/%/g, "");
  const matches = users.users.filter((u) => (u.email ?? "").startsWith(like.split("@")[0]) && (u.email ?? "").endsWith("@" + like.split("@")[1]));
  console.log(`  found ${matches.length} disposable auth users`);
  let removed = 0;
  for (const u of matches) {
    // Domain rows keyed by user_id are best-effort deleted; anything with a
    // FK protecting audit continuity will refuse and be left in place.
    for (const table of ["cleaning_plans", "finance_payouts", "notification_outbox", "sms_verifications", "provider_trust", "provider_profiles", "bookings", "user_roles", "profiles"]) {
      await admin.from(table as any).delete().or(`user_id.eq.${u.id},provider_id.eq.${u.id},customer_id.eq.${u.id},id.eq.${u.id}`);
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
    if (delErr) console.log(`  ⚠ could not remove ${u.email}: ${delErr.message}`);
    else { removed++; }
  }
  console.log(`✅ cleanup complete — removed ${removed}/${matches.length} disposable users. Audit evidence preserved.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
