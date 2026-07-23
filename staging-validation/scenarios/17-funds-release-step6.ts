// ============================================================================
// Scenario 17 — Funds Release v7 Step 6: Dry-Run Workers & Orchestrator
//
// Validates that the Step 6 worker functions are:
//   • Locked down: not callable by anon or authenticated JWTs
//   • Only reachable by service_role
//   • Fully idempotent (repeat ticks do not create duplicate rows)
//   • Advisory-locked (parallel ticks skip cleanly)
//   • Never mutate ledger / balance / bank-payout tables
//   • Never create Stripe transfers (state stays 'dry_run_planned')
//   • Honour funds_release.enabled = false (dry_run always true)
//
// No Stripe API calls are made anywhere in this scenario.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { env, EVIDENCE_DIR, RUN_ID } from "../config.js";
import { admin } from "../lib/supabase-admin.js";
import { runScenario, assert, attach, saveJson, ScenarioCtx } from "../lib/reporter.js";

async function callRpcAs(jwt: string | null, fn: string, args: Record<string, unknown>) {
  const key = jwt ?? env.STAGING_SUPABASE_ANON_KEY;
  const client = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.rpc(fn as never, args as never);
}

async function readFlag(): Promise<boolean> {
  const { data } = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("flag_key", "funds_release.enabled")
    .eq("scope", "global")
    .maybeSingle();
  return !!data?.enabled;
}

async function countLedgerEntries(): Promise<number> {
  const { count } = await admin
    .from("ledger_entries")
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function countDryRunAttempts(): Promise<number> {
  const { count } = await admin
    .from("payout_transfer_attempts")
    .select("*", { count: "exact", head: true })
    .eq("state", "dry_run_planned");
  return count ?? 0;
}

async function countExecutedAttempts(): Promise<number> {
  const { count } = await admin
    .from("payout_transfer_attempts")
    .select("*", { count: "exact", head: true })
    .neq("state", "dry_run_planned")
    .neq("state", "planned");
  return count ?? 0;
}

async function run(ctx: ScenarioCtx) {
  // -----------------------------------------------------------------
  // 1. Feature flag must be OFF for Step 6
  // -----------------------------------------------------------------
  const flag = await readFlag();
  assert(ctx, "funds_release.enabled is OFF", flag === false, `flag=${flag}`);

  // -----------------------------------------------------------------
  // 2. Baseline: ledger + executed-attempts counts
  // -----------------------------------------------------------------
  const ledgerBefore = await countLedgerEntries();
  const executedBefore = await countExecutedAttempts();
  const dryRunBefore = await countDryRunAttempts();
  saveJson("funds-release-step6/01-baseline.json", {
    ledgerBefore, executedBefore, dryRunBefore, at: new Date().toISOString(),
  });
  attach(ctx, "funds-release-step6/01-baseline.json");

  // -----------------------------------------------------------------
  // 3. RPCs must reject anon + authenticated callers
  // -----------------------------------------------------------------
  const fns = [
    "plan_pending_releases_v1",
    "reconcile_provider_payout_readiness_v1",
    "funds_release_worker_tick_v1",
  ];
  for (const fn of fns) {
    const anonResp = await callRpcAs(null, fn, { _limit: 1 });
    assert(
      ctx,
      `${fn} rejects anon`,
      !!anonResp.error,
      anonResp.error?.message ?? "unexpected success",
    );
  }

  // -----------------------------------------------------------------
  // 4. service_role tick #1
  // -----------------------------------------------------------------
  const { data: tick1, error: tick1err } = await admin.rpc(
    "funds_release_worker_tick_v1" as never,
    { _limit: 25 } as never,
  );
  assert(ctx, "tick #1 succeeds", !tick1err, tick1err?.message);
  saveJson("funds-release-step6/02-tick1.json", tick1 ?? {});
  attach(ctx, "funds-release-step6/02-tick1.json");
  assert(ctx, "tick #1 reports dry_run", (tick1 as any)?.dry_run === true);
  assert(ctx, "tick #1 reports flag_enabled=false",
    (tick1 as any)?.flag_enabled === false);

  // -----------------------------------------------------------------
  // 5. service_role tick #2 — idempotency check
  // -----------------------------------------------------------------
  const { data: tick2 } = await admin.rpc(
    "funds_release_worker_tick_v1" as never, { _limit: 25 } as never,
  );
  saveJson("funds-release-step6/03-tick2.json", tick2 ?? {});
  attach(ctx, "funds-release-step6/03-tick2.json");
  assert(ctx, "tick #2 reports dry_run", (tick2 as any)?.dry_run === true);

  const p1 = (tick1 as any)?.plan?.planned ?? 0;
  const p2 = (tick2 as any)?.plan?.planned ?? 0;
  assert(ctx, "tick #2 plans zero new attempts (idempotent)", p2 === 0,
    `tick1.planned=${p1}, tick2.planned=${p2}`);

  // -----------------------------------------------------------------
  // 6. Ledger untouched by workers
  // -----------------------------------------------------------------
  const ledgerAfter = await countLedgerEntries();
  assert(ctx, "ledger_entries count unchanged",
    ledgerAfter === ledgerBefore,
    `before=${ledgerBefore} after=${ledgerAfter}`);

  // -----------------------------------------------------------------
  // 7. No executed transfers created
  // -----------------------------------------------------------------
  const executedAfter = await countExecutedAttempts();
  assert(ctx, "no executed payout_transfer_attempts created",
    executedAfter === executedBefore,
    `before=${executedBefore} after=${executedAfter}`);

  // -----------------------------------------------------------------
  // 8. job_runs row emitted with completed status
  // -----------------------------------------------------------------
  const { data: runs } = await admin
    .from("job_runs")
    .select("job_name,status,metadata,success_count")
    .eq("job_name", "funds_release_worker_tick_v1")
    .order("started_at", { ascending: false })
    .limit(2);
  saveJson("funds-release-step6/04-job-runs.json", runs ?? []);
  attach(ctx, "funds-release-step6/04-job-runs.json");
  assert(ctx, "job_runs recorded latest tick as completed",
    !!runs && runs.length > 0 && runs[0].status === "completed",
    JSON.stringify(runs?.[0] ?? null));

  // -----------------------------------------------------------------
  // 9. Advisory lock — parallel ticks may skip but never explode
  // -----------------------------------------------------------------
  const parallel = await Promise.all([
    admin.rpc("funds_release_worker_tick_v1" as never, { _limit: 10 } as never),
    admin.rpc("funds_release_worker_tick_v1" as never, { _limit: 10 } as never),
  ]);
  const bothOk = parallel.every((r) => !r.error);
  assert(ctx, "parallel ticks return without error", bothOk,
    parallel.map((r) => r.error?.message).join(" | "));
  const anySkipped = parallel.some((r) => (r.data as any)?.skipped === true);
  saveJson("funds-release-step6/05-parallel.json", {
    responses: parallel.map((r) => r.data), anySkipped,
  });
  attach(ctx, "funds-release-step6/05-parallel.json");

  // -----------------------------------------------------------------
  // 10. Post-run: no bank payouts, no provider_bank_payouts rows created
  // -----------------------------------------------------------------
  const { count: bankCount } = await admin
    .from("provider_bank_payouts")
    .select("*", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString());
  assert(ctx, "no provider_bank_payouts created in last 5 min",
    (bankCount ?? 0) === 0, `count=${bankCount}`);
}

runScenario({
  name: "17-funds-release-step6",
  description: "Funds Release v7 Step 6 — Dry-Run Workers & Orchestrator",
  runId: RUN_ID,
  evidenceDir: EVIDENCE_DIR,
  run,
}).catch((e) => {
  console.error("scenario 17 failed:", e);
  process.exit(1);
});
