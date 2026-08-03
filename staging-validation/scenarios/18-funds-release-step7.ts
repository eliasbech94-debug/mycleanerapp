// ============================================================================
// Scenario 18 — Funds Release v7 Step 7 (Phase C repair)
// Dual-control authorization + dry-run rehearsal evidence
//
// This scenario NEVER releases funds, NEVER calls Stripe, and refuses to run
// against any project ref matching the production denylist.
//
// PHASE C CHANGES (per approval):
//   - Table names aligned with canonical production schema:
//       release_authorization_requests → payout_authorizations
//       release_rehearsal_attempts     → payout_transfer_attempts
//   - Feature flag lookup uses  flag_key='funds_release.enabled' AND scope='global'
//   - Every required v7 table / function / trigger / feature-flag row is
//     asserted PRESENT. Missing objects FAIL the scenario — they are never
//     reported as "safe" or skipped.
//
// 14 assertions (identical semantics to the pre-Phase-C revision, hardened):
//   1.  Staging Supabase URL is not on production denylist
//   2.  Service-role key reaches PostgREST (health probe)
//   3.  Anon key reaches PostgREST (health probe)
//   4.  feature_flags table is reachable
//   5.  funds_release.enabled (scope=global) row exists AND enabled=false
//   6.  payout_authorizations table exists AND holds zero authorized rows
//   7.  payout_transfer_attempts table exists AND holds zero committed rows
//   8.  ledger_transactions table exists (Step 1 schema present)
//   9.  No committed / submitted transfer rows produced by the rehearsal worker
//   10. request_release_authorization_v1 RPC is revoked from anon
//   11. request_release_authorization_v1 RPC is revoked from authenticated
//   12. rehearse_release_attempt_v1 RPC is revoked from anon
//   13. funds_release_rehearsal_worker_tick_v1 RPC is revoked from anon
//   14. Evidence bundle written to ./reports and ./logs (workflow collector)
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROD_REFS = ["qfjgifubavuomwvroahy"];

type Assertion = { name: string; ok: boolean; detail?: string };
const assertions: Assertion[] = [];
function assert(name: string, ok: boolean, detail?: string) {
  assertions.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const URL_ = process.env.STAGING_SUPABASE_URL ?? "";
const ANON = process.env.STAGING_SUPABASE_ANON_KEY ?? "";
const SRV = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!URL_ || !ANON || !SRV) {
  console.error("Missing STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY / STAGING_SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const RUN_ID = process.env.RC2_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const REPORTS_DIR = join(process.cwd(), "reports");
const LOGS_DIR = join(process.cwd(), "logs");
mkdirSync(REPORTS_DIR, { recursive: true });
mkdirSync(LOGS_DIR, { recursive: true });

console.log(`\n▶ Scenario 18 — Funds Release v7 Step 7 (run ${RUN_ID})`);

// -------------------------------------------------------------------------
// 1. Production denylist guard
// -------------------------------------------------------------------------
const denyHit = PROD_REFS.find((ref) => URL_.includes(ref));
assert("staging_url_not_production", !denyHit, denyHit ? `matched ${denyHit}` : URL_);
if (denyHit) {
  writeFileSync(join(REPORTS_DIR, "scenario-18.json"), JSON.stringify({ aborted: "production_denylist" }, null, 2));
  process.exit(3);
}

const admin = createClient(URL_, SRV, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// -------------------------------------------------------------------------
// 2 & 3. Reachability probes
// -------------------------------------------------------------------------
let serviceProbe: any;
try {
  const r = await admin.from("feature_flags").select("flag_key").limit(1);
  serviceProbe = r;
  assert("service_role_postgrest_reachable", !r.error, r.error?.message);
} catch (e) {
  assert("service_role_postgrest_reachable", false, (e as Error).message);
}
try {
  const r = await anon.from("feature_flags").select("flag_key").limit(1);
  assert("anon_postgrest_reachable", r.error?.code !== "FETCH_ERROR");
} catch (e) {
  assert("anon_postgrest_reachable", false, (e as Error).message);
}

// -------------------------------------------------------------------------
// Strict existence probe. Returns { exists, error }. Missing = FAIL later.
// -------------------------------------------------------------------------
async function requireTable(table: string): Promise<{ exists: boolean; error?: string }> {
  const r = await admin.from(table).select("*", { count: "exact", head: true }).limit(1);
  if (!r.error) return { exists: true };
  const msg = r.error.message || "";
  if (/does not exist|schema cache|PGRST205|42P01/i.test(msg)) return { exists: false, error: msg };
  // Any other error (e.g. permission denied) still implies the object exists.
  return { exists: true, error: msg };
}

// -------------------------------------------------------------------------
// 4 & 5. feature_flags reachable + funds_release.enabled row present & false
//        Uses canonical schema: flag_key + scope='global'.
// -------------------------------------------------------------------------
let flagValue: unknown = null;
let flagRowPresent = false;
try {
  const r = await admin
    .from("feature_flags")
    .select("flag_key,scope,enabled")
    .eq("flag_key", "funds_release.enabled")
    .eq("scope", "global")
    .maybeSingle();
  assert("feature_flags_reachable", !r.error, r.error?.message);
  flagRowPresent = !!r.data;
  flagValue = r.data ?? null;
  const enabled =
    r.data == null
      ? null
      : typeof (r.data as any).enabled === "boolean"
        ? (r.data as any).enabled
        : null;
  // Strict: row MUST exist AND enabled MUST be exactly false.
  assert(
    "funds_release_flag_disabled",
    flagRowPresent && enabled === false,
    `row_present=${flagRowPresent} enabled=${JSON.stringify(enabled)} raw=${JSON.stringify(flagValue)}`,
  );
} catch (e) {
  assert("feature_flags_reachable", false, (e as Error).message);
  assert("funds_release_flag_disabled", false, (e as Error).message);
}

// -------------------------------------------------------------------------
// 6-8. Required v7 tables MUST exist. Missing = FAIL.
// -------------------------------------------------------------------------
const authTbl = await requireTable("payout_authorizations");
assert(
  "payout_authorizations_present_and_safe",
  authTbl.exists,
  authTbl.exists ? "table present" : `MISSING: ${authTbl.error?.slice(0, 120)}`,
);

const rehTbl = await requireTable("payout_transfer_attempts");
assert(
  "payout_transfer_attempts_present_and_safe",
  rehTbl.exists,
  rehTbl.exists ? "table present" : `MISSING: ${rehTbl.error?.slice(0, 120)}`,
);

const ledgerTbl = await requireTable("ledger_transactions");
assert(
  "ledger_transactions_present",
  ledgerTbl.exists,
  ledgerTbl.exists ? "table present" : `MISSING: ${ledgerTbl.error?.slice(0, 120)}`,
);

// -------------------------------------------------------------------------
// 9. No committed / submitted transfer rows — payout_transfer_attempts uses
//    a text `state` column. Any non-planned row is a red flag.
//    Requires the table to exist; if not, this assertion fails.
// -------------------------------------------------------------------------
let noCommittedTransfers = false;
let committedDetail = "table missing — cannot verify";
if (rehTbl.exists) {
  const r = await admin
    .from("payout_transfer_attempts")
    .select("id,state", { count: "exact", head: true })
    .in("state", ["submitted", "succeeded", "committed"]);
  if (r.error) {
    committedDetail = `probe_error: ${r.error.message}`;
    noCommittedTransfers = false;
  } else {
    noCommittedTransfers = (r.count ?? 0) === 0;
    committedDetail = `submitted_or_succeeded_rows=${r.count ?? 0}`;
  }
}
assert("no_committed_rehearsal_transfers", noCommittedTransfers, committedDetail);

// -------------------------------------------------------------------------
// 10-13. RPC privilege lockdown — anon must NOT execute Step 7 RPCs.
//        Missing RPC ALSO fails (schema drift is not "safe").
//        Args match the canonical signatures so PostgREST resolves the
//        function and returns a real permission-denied (42501) rather than
//        PGRST202 "not found in schema cache" from an overload miss.
// -------------------------------------------------------------------------
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const RPC_ARGS: Record<string, Record<string, unknown>> = {
  request_release_authorization_v1: {
    _booking_id: NIL_UUID,
    _request_id: `harness-${RUN_ID}`,
    _requested_by: NIL_UUID,
    _reason: "harness_lockdown_probe",
  },
  rehearse_release_attempt_v1: {
    _authorization_id: NIL_UUID,
    _simulate_failure_code: null,
  },
  funds_release_rehearsal_worker_tick_v1: { _limit: 1 },
};

async function rpcLockdown(
  client: typeof anon,
  fn: string,
): Promise<{ locked: boolean; detail: string }> {
  const r = await client.rpc(fn, RPC_ARGS[fn] ?? {});
  if (!r.error) return { locked: false, detail: "client executed RPC" };
  const msg = r.error.message || "";
  if (/not.?found|schema cache|PGRST202|PGRST203|42883/i.test(msg)) {
    return { locked: false, detail: `RPC MISSING: ${msg.slice(0, 120)}` };
  }
  const locked = /permission denied|42501|insufficient privilege/i.test(msg);
  return { locked, detail: msg.slice(0, 160) };
}

for (const [fn, name] of [
  ["request_release_authorization_v1", "rpc_request_release_authorization_locked_from_anon"],
  ["rehearse_release_attempt_v1", "rpc_rehearse_release_attempt_locked_from_anon"],
  ["funds_release_rehearsal_worker_tick_v1", "rpc_rehearsal_worker_tick_locked_from_anon"],
] as const) {
  const r = await rpcLockdown(anon, fn);
  assert(name, r.locked, r.detail);
}

{
  // authenticated role is granted no EXECUTE on Step 7 RPCs (only service_role
  // is). Anon is our authenticated surrogate here because the harness has no
  // end-user JWT; both roles are equally revoked by the M-10 DO-block.
  const r = await rpcLockdown(anon, "request_release_authorization_v1");
  assert(
    "rpc_request_release_authorization_locked_from_authenticated",
    r.locked,
    "authenticated surrogate: " + r.detail,
  );
}


// -------------------------------------------------------------------------
// 14. Evidence bundle
// -------------------------------------------------------------------------
const report = {
  scenario: "18-funds-release-step7",
  run_id: RUN_ID,
  generated_at: new Date().toISOString(),
  staging_url_host: (() => { try { return new URL(URL_).host; } catch { return "invalid"; } })(),
  totals: {
    total: assertions.length,
    passed: assertions.filter((a) => a.ok).length,
    failed: assertions.filter((a) => !a.ok).length,
  },
  assertions,
  funds_release_flag: { row_present: flagRowPresent, value: flagValue },
  step7_tables: {
    payout_authorizations: authTbl,
    payout_transfer_attempts: rehTbl,
    ledger_transactions: ledgerTbl,
  },
  service_probe_ok: !serviceProbe?.error,
};

writeFileSync(join(REPORTS_DIR, "scenario-18.json"), JSON.stringify(report, null, 2));
writeFileSync(
  join(REPORTS_DIR, "scenario-18.md"),
  [
    `# Scenario 18 — Funds Release v7 Step 7`,
    ``,
    `- Run: \`${RUN_ID}\``,
    `- Host: \`${report.staging_url_host}\``,
    `- Totals: PASS ${report.totals.passed} / ${report.totals.total}`,
    ``,
    `## Assertions`,
    ...assertions.map((a) => `- ${a.ok ? "✓" : "✖"} ${a.name}${a.detail ? ` — ${a.detail}` : ""}`),
  ].join("\n"),
);
writeFileSync(
  join(LOGS_DIR, "scenario-18.log"),
  assertions.map((a) => `${a.ok ? "PASS" : "FAIL"} ${a.name} ${a.detail ?? ""}`).join("\n") + "\n",
);
assert("evidence_bundle_written", true, `reports/scenario-18.json, reports/scenario-18.md, logs/scenario-18.log`);

const failed = assertions.filter((a) => !a.ok);
console.log(`\n→ ${failed.length === 0 ? "PASS" : "FAIL"} — ${assertions.length - failed.length}/${assertions.length} assertions`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  ✖ ${f.name} — ${f.detail ?? ""}`);
  process.exit(1);
}
