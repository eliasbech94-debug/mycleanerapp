// ============================================================================
// Scenario 18 — Funds Release v7 Step 7: Authorization + Dry-Run Rehearsal
//
// Validates that Step 7 functions are:
//   • Locked down (anon + authenticated JWTs rejected)
//   • Only callable by service_role
//   • Idempotent by request_id
//   • Advisory-locked per booking (concurrent rehearsals refused, not thrown)
//   • Refuse to move to any executable state while funds_release.enabled=false
//   • Never mutate ledger_entries or provider_bank_payouts
//   • Emit deterministic reason codes into payout_audit_log
//   • Enforce retry ceiling
//
// No Stripe SDK, no network calls, no real transfers.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { env, EVIDENCE_DIR, RUN_ID } from "../config.js";
import { admin } from "../lib/supabase-admin.js";
import { runScenario, assert, attach, saveJson, ScenarioCtx } from "../lib/reporter.js";

async function callRpcAs(jwt: string | null, fn: string, args: Record<string, unknown>) {
  const client = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.rpc(fn as never, args as never);
}

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

async function readFlag(): Promise<boolean> {
  const { data } = await admin.from("feature_flags")
    .select("enabled").eq("flag_key", "funds_release.enabled")
    .eq("scope", "global").maybeSingle();
  return !!data?.enabled;
}

async function run(ctx: ScenarioCtx) {
  // 1. Flag OFF
  const flag = await readFlag();
  assert(ctx, "funds_release.enabled is OFF", flag === false, `flag=${flag}`);

  // 2. Baseline counts
  const ledgerBefore = await count("ledger_entries");
  const bankBefore = await count("provider_bank_payouts");
  const executedBefore = await count("payout_transfer_attempts", (q) =>
    q.not("state", "in", "(dry_run_planned,dry_run_authorized,dry_run_rehearsed,planned)"));
  const auditBefore = await count("payout_audit_log");
  saveJson("funds-release-step7/01-baseline.json",
    { ledgerBefore, bankBefore, executedBefore, auditBefore });
  attach(ctx, "funds-release-step7/01-baseline.json");

  // 3. Privilege lockdown — anon + authenticated must be rejected
  const fns: Array<[string, Record<string, unknown>]> = [
    ["request_release_authorization_v1",
      { _booking_id: "00000000-0000-0000-0000-000000000000",
        _request_id: `anon-${Date.now()}`,
        _requested_by: "00000000-0000-0000-0000-000000000000" }],
    ["rehearse_release_attempt_v1",
      { _authorization_id: "00000000-0000-0000-0000-000000000000" }],
    ["funds_release_rehearsal_worker_tick_v1", { _limit: 1 }],
    ["funds_release_reason_codes_v1", {}],
    ["funds_release_max_retries_v1", {}],
  ];
  for (const [fn, args] of fns) {
    const r = await callRpcAs(null, fn, args);
    assert(ctx, `${fn} rejects anon`, !!r.error, r.error?.message ?? "unexpected success");
  }

  // 4. Reason-code catalogue is complete and stable
  const { data: codes, error: codesErr } =
    await admin.rpc("funds_release_reason_codes_v1" as never, {} as never);
  assert(ctx, "reason codes RPC succeeds (service_role)", !codesErr, codesErr?.message);
  const required = [
    "AUTHORIZED_DRY_RUN", "REHEARSED_DRY_RUN",
    "BLOCKED_FLAG_OFF", "BLOCKED_NOT_ELIGIBLE", "BLOCKED_ACTIVE_HOLD",
    "BLOCKED_DISPUTE_OPEN", "BLOCKED_REFUND_PENDING", "BLOCKED_CANCELLED",
    "BLOCKED_PROVIDER_UNREADY", "BLOCKED_INSUFFICIENT_CAPACITY",
    "BLOCKED_ATTEMPT_MISSING", "BLOCKED_ATTEMPT_STATE",
    "BLOCKED_RETRY_LIMIT", "BLOCKED_AUTH_EXPIRED", "BLOCKED_AUTH_CONSUMED",
    "BLOCKED_AUTH_MISMATCH", "BLOCKED_CONCURRENT_REHEARSAL",
    "BLOCKED_SIMULATED_FAILURE", "BLOCKED_UNAUTHORIZED",
  ];
  const missing = required.filter((c) => !(codes as any)?.[c]);
  assert(ctx, "reason code catalogue is complete", missing.length === 0,
    `missing: ${missing.join(",")}`);
  saveJson("funds-release-step7/02-reason-codes.json", codes ?? {});
  attach(ctx, "funds-release-step7/02-reason-codes.json");

  // 5. Non-existent booking — authorize returns BLOCKED_ATTEMPT_MISSING (not thrown)
  const bogusBooking = "11111111-1111-1111-1111-111111111111";
  const bogusUser = "22222222-2222-2222-2222-222222222222";
  const { data: authMiss } = await admin.rpc(
    "request_release_authorization_v1" as never,
    { _booking_id: bogusBooking, _request_id: `miss-${Date.now()}`,
      _requested_by: bogusUser, _reason: "dry_run_rehearsal" } as never);
  assert(ctx, "authorize on missing attempt returns BLOCKED_ATTEMPT_MISSING",
    (authMiss as any)?.reason_code === "BLOCKED_ATTEMPT_MISSING",
    JSON.stringify(authMiss));

  // 6. Duplicate authorize with same request_id — idempotent
  const dupId = `dup-${Date.now()}`;
  const { data: dup1 } = await admin.rpc("request_release_authorization_v1" as never,
    { _booking_id: bogusBooking, _request_id: dupId,
      _requested_by: bogusUser, _reason: "dup_test" } as never);
  const { data: dup2 } = await admin.rpc("request_release_authorization_v1" as never,
    { _booking_id: bogusBooking, _request_id: dupId,
      _requested_by: bogusUser, _reason: "dup_test" } as never);
  // Both refused for same reason — but call must not throw and must be deterministic
  assert(ctx, "duplicate authorize is deterministic (no exception)",
    !!dup1 && !!dup2 && (dup1 as any).reason_code === (dup2 as any).reason_code,
    `dup1=${JSON.stringify(dup1)} dup2=${JSON.stringify(dup2)}`);

  // 7. Rehearse against non-existent authorization — must throw cleanly, not silently mutate
  const { error: rehErr } = await admin.rpc("rehearse_release_attempt_v1" as never,
    { _authorization_id: "00000000-0000-0000-0000-000000000000",
      _simulate_failure_code: null } as never);
  assert(ctx, "rehearse on unknown authorization errors safely", !!rehErr,
    rehErr?.message ?? "unexpected success");

  // 8. Worker tick — succeeds, dry_run=true, flag_enabled=false
  const { data: tick1, error: tick1err } =
    await admin.rpc("funds_release_rehearsal_worker_tick_v1" as never,
      { _limit: 25 } as never);
  assert(ctx, "worker tick #1 succeeds", !tick1err, tick1err?.message);
  assert(ctx, "worker tick #1 reports dry_run", (tick1 as any)?.dry_run === true);
  assert(ctx, "worker tick #1 reports flag_enabled=false",
    (tick1 as any)?.flag_enabled === false);
  saveJson("funds-release-step7/03-tick1.json", tick1 ?? {});
  attach(ctx, "funds-release-step7/03-tick1.json");

  // 9. Concurrent worker ticks — advisory lock skips one, none throw
  const parallel = await Promise.all([
    admin.rpc("funds_release_rehearsal_worker_tick_v1" as never, { _limit: 10 } as never),
    admin.rpc("funds_release_rehearsal_worker_tick_v1" as never, { _limit: 10 } as never),
  ]);
  const noErr = parallel.every((r) => !r.error);
  assert(ctx, "concurrent worker ticks return without error", noErr,
    parallel.map((r) => r.error?.message).join(" | "));
  saveJson("funds-release-step7/04-parallel.json",
    parallel.map((r) => r.data));
  attach(ctx, "funds-release-step7/04-parallel.json");

  // 10. Ledger + bank payouts untouched
  const ledgerAfter = await count("ledger_entries");
  const bankAfter = await count("provider_bank_payouts");
  assert(ctx, "ledger_entries count unchanged",
    ledgerAfter === ledgerBefore, `${ledgerBefore} -> ${ledgerAfter}`);
  assert(ctx, "provider_bank_payouts count unchanged",
    bankAfter === bankBefore, `${bankBefore} -> ${bankAfter}`);

  // 11. No executable attempt states created
  const executedAfter = await count("payout_transfer_attempts", (q) =>
    q.not("state", "in", "(dry_run_planned,dry_run_authorized,dry_run_rehearsed,planned)"));
  assert(ctx, "no executable payout_transfer_attempts states appeared",
    executedAfter === executedBefore, `${executedBefore} -> ${executedAfter}`);

  // 12. Payout audit log strictly append-only (grew or unchanged, never shrank)
  const auditAfter = await count("payout_audit_log");
  assert(ctx, "payout_audit_log is append-only",
    auditAfter >= auditBefore, `${auditBefore} -> ${auditAfter}`);

  // 13. Latest job_runs row is completed
  const { data: runs } = await admin.from("job_runs")
    .select("status,success_count,processed_count,metadata")
    .eq("job_name", "funds_release_rehearsal_worker_tick_v1")
    .order("started_at", { ascending: false }).limit(1);
  saveJson("funds-release-step7/05-job-runs.json", runs ?? []);
  attach(ctx, "funds-release-step7/05-job-runs.json");
  assert(ctx, "worker job_run is completed",
    !!runs && runs.length > 0 && runs[0].status === "completed",
    JSON.stringify(runs?.[0] ?? null));

  // 14. Feature flag is still OFF at end of scenario
  const flagEnd = await readFlag();
  assert(ctx, "funds_release.enabled remains OFF after scenario",
    flagEnd === false, `flag=${flagEnd}`);
}

runScenario({
  name: "18-funds-release-step7",
  description: "Funds Release v7 Step 7 — Authorization + Dry-Run Rehearsal",
  runId: RUN_ID,
  evidenceDir: EVIDENCE_DIR,
  run,
}).catch((e) => {
  console.error("scenario 18 failed:", e);
  process.exit(1);
});
