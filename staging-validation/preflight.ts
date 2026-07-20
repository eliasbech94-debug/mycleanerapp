// RC2 preflight — validates the harness can run before any destructive scenario.
// Prints a status per check; exits non-zero on any hard failure. Blocked
// external checks are reported as BLOCKED, never as passed.
import { env, RUN_ID } from "./config.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

type CheckStatus = "OK" | "FAIL" | "BLOCKED" | "WARN";
interface Check { name: string; status: CheckStatus; detail?: string }
const checks: Check[] = [];

function record(name: string, status: CheckStatus, detail?: string) {
  checks.push({ name, status, detail });
  const icon = { OK: "✓", FAIL: "✖", BLOCKED: "⏸", WARN: "⚠" }[status];
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(name: string, fn: () => Promise<CheckStatus | void> | CheckStatus | void, detail?: (r: any) => string) {
  try {
    const r = await fn();
    record(name, (r as CheckStatus) ?? "OK", detail?.(r));
  } catch (e) {
    record(name, "FAIL", (e as Error).message.split("\n")[0]);
  }
}

async function main() {
  console.log(`\n▶ RC2 preflight  (run_id=${RUN_ID})\n`);

  console.log("Environment guards");
  await check("staging URLs / test-mode keys / destructive-ack",
    () => { /* config.ts already validated on import */ });

  console.log("\nDatabase connectivity");
  await check("psql reachable", () => {
    execSync(`psql "${env.STAGING_PG_CONN}" -c "select 1" -A -t -X`, { stdio: ["ignore", "pipe", "pipe"] });
  });
  await check("required tables present", () => {
    const required = [
      "profiles", "user_roles", "provider_profiles", "provider_trust",
      "bookings", "stripe_webhook_events", "identity_webhook_events",
      "admin_audit_log", "finance_payouts", "notification_outbox",
    ];
    const out = execSync(
      `psql "${env.STAGING_PG_CONN}" -A -t -X -c "select string_agg(table_name, ',') from information_schema.tables where table_schema='public' and table_name in ('${required.join("','")}')"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const found = new Set(out.split(","));
    const missing = required.filter((t) => !found.has(t));
    if (missing.length) throw new Error(`missing tables: ${missing.join(",")}`);
  });
  await check("required RPCs present", () => {
    const required = ["search_marketplace_providers_v1", "get_public_provider_profile_v1", "submit_provider_application", "has_role"];
    const out = execSync(
      `psql "${env.STAGING_PG_CONN}" -A -t -X -c "select string_agg(proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and proname in ('${required.join("','")}')"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const found = new Set(out.split(","));
    const missing = required.filter((t) => !found.has(t));
    if (missing.length) throw new Error(`missing RPCs: ${missing.join(",")}`);
  });
  await check("no pending migrations drift", () => "WARN" as CheckStatus, () => "manual check — compare supabase/migrations vs live schema");

  console.log("\nCallback reachability");
  for (const [label, url] of [["stripe-webhook", env.STRIPE_WEBHOOK_URL], ["sumsub-webhook", env.SUMSUB_WEBHOOK_URL]] as const) {
    await check(`${label} reachable`, async () => {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      // Any HTTP response ≠ network error proves reachability. Signature-rejected 400/401 is fine.
      if (res.status >= 500) return "BLOCKED";
    }, () => url);
  }

  console.log("\nTest-mode integrations");
  await check("Stripe test key accepted", async () => {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${env.STRIPE_TEST_SECRET_KEY}` },
    });
    if (res.status === 401) throw new Error("Stripe 401 — key rejected");
    if (res.status >= 500) return "BLOCKED";
  });
  await check("Sumsub credentials present", () => {
    if (!env.SUMSUB_APP_TOKEN || !env.SUMSUB_SECRET_KEY) throw new Error("missing token/secret");
  });

  console.log("\nTooling");
  await check("Playwright installed",
    () => { if (!existsSync("node_modules/.bin/playwright") && !existsSync("node_modules/@playwright/test")) throw new Error("run `bun install`"); });
  await check("k6 installed (optional)", () => {
    try { execSync("k6 version", { stdio: "ignore" }); }
    catch { return "WARN"; }
  }, () => "load tests skipped when missing");

  const hard = checks.filter((c) => c.status === "FAIL").length;
  const blockedN = checks.filter((c) => c.status === "BLOCKED").length;
  console.log(`\n▶ Preflight: OK=${checks.filter(c=>c.status==='OK').length} FAIL=${hard} BLOCKED=${blockedN} WARN=${checks.filter(c=>c.status==='WARN').length}`);
  if (hard > 0) { console.log("❌ Preflight failed — fix hard errors before running RC2."); process.exit(1); }
  if (blockedN > 0) { console.log("⚠ Preflight blocked — some scenarios will report BLOCKED, not PASS."); process.exit(0); }
  console.log("✅ Preflight passed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
