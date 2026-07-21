// staging-validation/verify-phase1.ts
//
// Read-only verifier for the Phase 1 staging bootstrap.
//
// Uses `psql` (shelled out with STAGING_PG_CONN) so no additional npm
// dependency is required. Also uses @supabase/supabase-js for a Data-API
// smoke test and (optionally) the Supabase Management API for edge-function
// and secret-name inventories.
//
// Writes:
//   docs/staging/PHASE1_REPORT.md
//   staging-validation/artifacts/phase1-report.json
//
// Every check returns PASS | FAIL | BLOCKED | MANUAL_VERIFICATION_REQUIRED.
// Overall verdict is PASS only when every REQUIRED check is PASS.
// This script performs NO writes to the staging database.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { readdir, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PROD_REF = "qfjgifubavuomwvroahy";
const PROD_HOSTS = ["mycleaner.dk", "www.mycleaner.dk", "mycleanerapp.lovable.app"];

type Status = "PASS" | "FAIL" | "BLOCKED" | "MANUAL_VERIFICATION_REQUIRED";
interface Check {
  id: string;
  title: string;
  status: Status;
  required: boolean;
  detail?: string;
  data?: unknown;
}

const checks: Check[] = [];
const push = (c: Check) => { checks.push(c); logCheck(c); };
function logCheck(c: Check) {
  const badge = { PASS: "✅", FAIL: "❌", BLOCKED: "⛔", MANUAL_VERIFICATION_REQUIRED: "🔎" }[c.status];
  const req = c.required ? "" : " (optional)";
  console.log(`${badge} [${c.status}] ${c.id} — ${c.title}${req}`);
  if (c.detail) console.log(`     ${c.detail}`);
}

// ── Env guard ─────────────────────────────────────────────────────────────
const url = process.env.STAGING_SUPABASE_URL ?? "";
const service = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? "";
const pgConn = process.env.STAGING_PG_CONN ?? "";

if (!url || !service || !pgConn) {
  console.error("❌ Missing STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY / STAGING_PG_CONN in staging-validation/.env");
  process.exit(2);
}
if (url.includes(PROD_REF) || pgConn.includes(PROD_REF)) {
  console.error(`⛔ Refusing to run: staging config references the production project ref (${PROD_REF}).`);
  process.exit(3);
}
for (const bad of PROD_HOSTS) {
  if (url.toLowerCase().includes(bad) || pgConn.toLowerCase().includes(bad)) {
    console.error(`⛔ Refusing to run: staging config references production host '${bad}'.`);
    process.exit(3);
  }
}
push({
  id: "guard.production_ref",
  title: "Staging config does not reference the production project ref",
  status: "PASS",
  required: true,
  detail: `Configured host: ${new URL(url).host}`,
});

// ── psql check ────────────────────────────────────────────────────────────
try {
  execSync("psql --version", { stdio: "ignore" });
} catch {
  push({
    id: "tool.psql",
    title: "psql CLI available on PATH",
    status: "BLOCKED",
    required: true,
    detail: "psql is required to run schema checks. Install PostgreSQL client tools and re-run.",
  });
  await finalize();
  process.exit(1);
}

// ── Repo inventory ────────────────────────────────────────────────────────
const repoRoot = resolve(process.cwd(), process.cwd().endsWith("staging-validation") ? ".." : ".");
const migrationsDir = join(repoRoot, "supabase/migrations");
const functionsDir = join(repoRoot, "supabase/functions");
const secretsExample = join(repoRoot, "staging.secrets.example");

async function listMigrationFiles(): Promise<string[]> {
  if (!existsSync(migrationsDir)) return [];
  return (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
}
async function listLocalFunctions(): Promise<string[]> {
  if (!existsSync(functionsDir)) return [];
  const entries = await readdir(functionsDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name).sort();
}
async function requiredSecretNames(): Promise<string[]> {
  if (!existsSync(secretsExample)) return [];
  const raw = await readFile(secretsExample, "utf8");
  const names: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const m = s.match(/^([A-Z][A-Z0-9_]*)=/);
    if (m) names.push(m[1]);
  }
  return names.sort();
}

// ── psql helper (shell-quoted, JSON-agg) ──────────────────────────────────
type Row = Record<string, unknown>;
function q<T = Row>(sql: string): T[] {
  const inner = sql.replace(/"/g, '\\"');
  const cmd = `psql "${pgConn}" -A -t -X -c "select coalesce(json_agg(t), '[]'::json) from (${inner}) t"`;
  const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return JSON.parse(out || "[]") as T[];
}

async function main() {
  // ── Connectivity: Postgres ─────────────────────────────────────────────
  try {
    const r = q<{ v: string }>("select split_part(version(), ',', 1) as v");
    push({
      id: "conn.postgres",
      title: "Postgres connection (STAGING_PG_CONN)",
      status: "PASS", required: true, detail: r[0]?.v,
    });
  } catch (e) {
    push({ id: "conn.postgres", title: "Postgres connection", status: "FAIL", required: true, detail: (e as Error).message.slice(0, 300) });
    return finalize();
  }

  // ── Connectivity: Data API ─────────────────────────────────────────────
  try {
    const sb = createClient(url, service, { auth: { persistSession: false } });
    const { error } = await sb.from("profiles").select("id", { count: "exact", head: true });
    if (error) throw error;
    push({ id: "conn.data_api", title: "PostgREST Data API reachable (service role)", status: "PASS", required: true });
  } catch (e) {
    push({ id: "conn.data_api", title: "PostgREST Data API reachable", status: "FAIL", required: true, detail: (e as Error).message });
  }

  // ── Migrations ─────────────────────────────────────────────────────────
  const localMigrations = await listMigrationFiles();
  try {
    const applied = q<{ version: string }>(
      `select version from supabase_migrations.schema_migrations order by version`
    );
    const appliedVersions = new Set(applied.map((r) => r.version));
    const missing = localMigrations
      .map((f) => f.match(/^(\d+)/)?.[1] ?? "")
      .filter((v) => v && !appliedVersions.has(v));
    push({
      id: "migrations.applied",
      title: "All local migrations applied to staging",
      status: missing.length === 0 ? "PASS" : "FAIL",
      required: true,
      detail: `local=${localMigrations.length}  applied=${applied.length}  missing=${missing.length}`,
      data: { missing, appliedCount: applied.length, localCount: localMigrations.length },
    });
  } catch (e) {
    push({
      id: "migrations.applied",
      title: "All local migrations applied to staging",
      status: "FAIL", required: true,
      detail: `Could not read supabase_migrations.schema_migrations: ${(e as Error).message.slice(0, 300)}`,
    });
  }

  // ── Critical tables ────────────────────────────────────────────────────
  const criticalTables = [
    "profiles", "user_roles", "provider_profiles", "provider_trust",
    "bookings", "conversations", "messages", "customer_addresses",
    "country_configs", "legal_documents", "user_legal_acceptances",
    "finance_payouts", "finance_statements", "stripe_disputes",
    "person_identities", "identity_account_links", "identity_webhook_events",
    "sms_verifications", "place_validations",
  ];
  const tableRows = q<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE'`
  );
  const tableSet = new Set(tableRows.map((r) => r.table_name));
  const missingTables = criticalTables.filter((t) => !tableSet.has(t));
  push({
    id: "schema.critical_tables",
    title: "Critical public tables exist",
    status: missingTables.length === 0 ? "PASS" : "FAIL",
    required: true,
    detail: `present=${criticalTables.length - missingTables.length}/${criticalTables.length}  missing=${JSON.stringify(missingTables)}`,
    data: { missing: missingTables, totalPublicTables: tableRows.length },
  });

  // ── RLS enabled ────────────────────────────────────────────────────────
  const rlsRows = q<{ table_name: string; rls: boolean }>(
    `select c.relname as table_name, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`
  );
  const rlsDisabled = rlsRows.filter((r) => !r.rls).map((r) => r.table_name);
  push({
    id: "rls.enabled",
    title: "RLS enabled on every public table",
    status: rlsDisabled.length === 0 ? "PASS" : "FAIL",
    required: true,
    detail: rlsDisabled.length ? `Tables without RLS: ${rlsDisabled.join(", ")}` : `${rlsRows.length} tables checked`,
    data: { rlsDisabled },
  });

  // ── Policy inventory ───────────────────────────────────────────────────
  const policyRows = q<{ tablename: string; n: number }>(
    `select tablename, count(*)::int as n
       from pg_policies where schemaname='public'
      group by tablename order by tablename`
  );
  const totalPolicies = policyRows.reduce((s, r) => s + Number(r.n), 0);
  const tablesWithoutPolicies = tableRows
    .map((t) => t.table_name)
    .filter((t) => !policyRows.some((p) => p.tablename === t));
  push({
    id: "rls.policies_inventory",
    title: "Every public table has at least one RLS policy",
    status: tablesWithoutPolicies.length === 0 ? "PASS" : "FAIL",
    required: true,
    detail: `policies=${totalPolicies}  tables_missing_policies=${tablesWithoutPolicies.length}`,
    data: { tablesWithoutPolicies, byTable: policyRows },
  });

  // ── RPC inventory ──────────────────────────────────────────────────────
  const funcRows = q<{ name: string; args: string; ret: string }>(
    `select p.proname as name,
            pg_get_function_arguments(p.oid) as args,
            pg_get_function_result(p.oid) as ret
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f'
      order by p.proname`
  );
  const funcNames = new Set(funcRows.map((r) => r.name));
  const requiredRpcs = [
    "has_role", "is_admin_only", "is_support_agent",
    "get_public_provider_profile_v1", "list_favorite_providers_v1",
    "toggle_favorite_provider_v1", "reconcile_provider_status",
    "admin_provider_action", "refresh_provider_score_tier",
    "calc_provider_completion", "get_published_country_config",
  ];
  const missingRpcs = requiredRpcs.filter((n) => !funcNames.has(n));
  push({
    id: "rpc.inventory",
    title: "Required RPCs exist in public schema",
    status: missingRpcs.length === 0 ? "PASS" : "FAIL",
    required: true,
    detail: `total_public_functions=${funcRows.length}  missing_required=${JSON.stringify(missingRpcs)}`,
    data: { missing: missingRpcs, total: funcRows.length },
  });

  // ── RPC signature spot check ───────────────────────────────────────────
  const sigSpotCheck = [
    { name: "has_role", mustContain: ["_user_id", "_role"] },
    { name: "get_public_provider_profile_v1", mustContain: ["_slug"] },
    { name: "admin_provider_action", mustContain: ["_target_user_id", "_action"] },
  ];
  const sigProblems: string[] = [];
  for (const s of sigSpotCheck) {
    const row = funcRows.find((r) => r.name === s.name);
    if (!row) { sigProblems.push(`${s.name}: not found`); continue; }
    for (const arg of s.mustContain) {
      if (!row.args.includes(arg)) sigProblems.push(`${s.name}: missing arg ${arg}`);
    }
  }
  push({
    id: "rpc.signatures",
    title: "RPC signatures match expected argument names",
    status: sigProblems.length === 0 ? "PASS" : "FAIL",
    required: true,
    detail: sigProblems.length ? sigProblems.join("; ") : "spot-checked has_role, get_public_provider_profile_v1, admin_provider_action",
    data: { sigProblems },
  });

  // ── Storage buckets ────────────────────────────────────────────────────
  const bucketRows = q<{ id: string; public: boolean }>(
    `select id, public from storage.buckets order by id`
  );
  const expectedBuckets = ["avatars", "chat-attachments", "receipts", "identity-artifacts", "legal-documents"];
  const bucketNames = new Set(bucketRows.map((r) => r.id));
  const missingBuckets = expectedBuckets.filter((b) => !bucketNames.has(b));
  push({
    id: "storage.buckets",
    title: "Expected storage buckets exist",
    status: missingBuckets.length === 0 ? "PASS" : "FAIL",
    required: true,
    detail: `present=${bucketRows.map((r) => r.id).join(", ") || "(none)"}  missing=${JSON.stringify(missingBuckets)}`,
    data: { present: bucketRows, missing: missingBuckets },
  });

  // ── Extensions ─────────────────────────────────────────────────────────
  const extRows = q<{ extname: string; extversion: string }>(
    `select extname, extversion from pg_extension order by extname`
  );
  const extSet = new Set(extRows.map((r) => r.extname));
  const requiredExts = ["pgcrypto", "pgjwt", "uuid-ossp"];
  const missingExts = requiredExts.filter((e) => !extSet.has(e));
  push({
    id: "extensions.required",
    title: "Required Postgres extensions installed",
    status: missingExts.length === 0 ? "PASS" : "FAIL",
    required: true,
    detail: `installed=${extRows.length}  missing=${JSON.stringify(missingExts)}`,
    data: { installed: extRows, missing: missingExts },
  });

  // ── Edge functions (via Management API if token present) ───────────────
  const localFns = await listLocalFunctions();
  const projectRef = new URL(url).host.split(".")[0];
  const mgmtToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!mgmtToken) {
    push({
      id: "functions.inventory",
      title: "Edge Functions deployed to staging",
      status: "MANUAL_VERIFICATION_REQUIRED", required: true,
      detail: `Set SUPABASE_ACCESS_TOKEN (personal access token) to enable API check, OR run: supabase functions list --project-ref ${projectRef}  and confirm all ${localFns.length} local functions are listed.`,
      data: { localCount: localFns.length, localFns },
    });
  } else {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
        headers: { Authorization: `Bearer ${mgmtToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const deployed = await res.json() as Array<{ slug: string }>;
      const deployedNames = new Set(deployed.map((d) => d.slug));
      const missingFns = localFns.filter((f) => !deployedNames.has(f));
      push({
        id: "functions.inventory",
        title: "Every local Edge Function is deployed to staging",
        status: missingFns.length === 0 ? "PASS" : "FAIL",
        required: true,
        detail: `local=${localFns.length}  deployed=${deployed.length}  missing=${JSON.stringify(missingFns)}`,
        data: { missing: missingFns },
      });
    } catch (e) {
      push({
        id: "functions.inventory",
        title: "Every local Edge Function is deployed to staging",
        status: "BLOCKED", required: true,
        detail: `Management API call failed: ${(e as Error).message}`,
      });
    }
  }

  // ── Required secret names (names only) ─────────────────────────────────
  const requiredSecrets = await requiredSecretNames();
  if (!mgmtToken) {
    push({
      id: "secrets.names",
      title: "Required secret names configured on staging (names only)",
      status: "MANUAL_VERIFICATION_REQUIRED", required: true,
      detail: `${requiredSecrets.length} names expected. Verify with: supabase secrets list --project-ref ${projectRef}  (values are masked).`,
      data: { required: requiredSecrets },
    });
  } else {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
        headers: { Authorization: `Bearer ${mgmtToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json() as Array<{ name: string }>;
      const have = new Set(rows.map((r) => r.name));
      const missing = requiredSecrets.filter((n) => !have.has(n));
      push({
        id: "secrets.names",
        title: "Required secret names present on staging (values never read)",
        status: missing.length === 0 ? "PASS" : "FAIL",
        required: true,
        detail: `required=${requiredSecrets.length}  present_on_project=${rows.length}  missing=${JSON.stringify(missing)}`,
        data: { missing },
      });
    } catch (e) {
      push({
        id: "secrets.names",
        title: "Required secret names present on staging",
        status: "BLOCKED", required: true,
        detail: `Management API call failed: ${(e as Error).message}`,
      });
    }
  }

  // ── Auth providers (proxy) ─────────────────────────────────────────────
  try {
    const rows = q<{ provider: string; n: number }>(
      `select provider, count(*)::int as n from auth.identities group by provider order by provider`
    );
    push({
      id: "auth.providers_seen",
      title: "Auth providers visible via auth.identities (inventory proxy)",
      status: "MANUAL_VERIFICATION_REQUIRED", required: true,
      detail: rows.length
        ? `Seen: ${rows.map((r) => `${r.provider}(${r.n})`).join(", ")}. Confirm full config manually (email confirmations, HIBP, Google/Apple, URL allowlist).`
        : "No identities yet. Confirm provider configuration manually in the staging Supabase dashboard.",
      data: { rows },
    });
  } catch (e) {
    push({
      id: "auth.providers_seen",
      title: "Auth providers inventory",
      status: "BLOCKED", required: false,
      detail: `Could not read auth.identities: ${(e as Error).message.slice(0, 200)}`,
    });
  }

  // ── Manual reminders (required, not auto-resolvable) ───────────────────
  push({
    id: "manual.auth_url_allowlist",
    title: "Auth → URL Configuration contains staging + fallback + localhost",
    status: "MANUAL_VERIFICATION_REQUIRED", required: true,
    detail: "Verify in the staging Supabase dashboard: Authentication → URL Configuration.",
  });
  push({
    id: "manual.storage_policies",
    title: "Storage bucket RLS policies match production",
    status: "MANUAL_VERIFICATION_REQUIRED", required: true,
    detail: "Bucket rows are covered above; policies on storage.objects should be reviewed against migrations.",
  });
  push({
    id: "manual.rls_regression",
    title: "scripts/rls-regression.sql passes against staging",
    status: "MANUAL_VERIFICATION_REQUIRED", required: true,
    detail: `Run locally: psql "$STAGING_PG_CONN" -f scripts/rls-regression.sql`,
  });

  await finalize();
}

async function finalize() {
  const counts: Record<Status, number> = { PASS: 0, FAIL: 0, BLOCKED: 0, MANUAL_VERIFICATION_REQUIRED: 0 };
  for (const c of checks) counts[c.status]++;

  const requiredNotPass = checks.filter((c) => c.required && c.status !== "PASS");
  const verdict: Status =
    requiredNotPass.length === 0 ? "PASS"
    : requiredNotPass.some((c) => c.status === "FAIL") ? "FAIL"
    : "BLOCKED";

  const cwd = process.cwd();
  const inStaging = cwd.endsWith("staging-validation");
  const artifactsDir = inStaging ? "artifacts" : "staging-validation/artifacts";
  const docsDir = inStaging ? "../docs/staging" : "docs/staging";
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const jsonPath = join(artifactsDir, "phase1-report.json");
  const mdPath = join(docsDir, "PHASE1_REPORT.md");
  const now = new Date().toISOString();

  await writeFile(jsonPath, JSON.stringify({
    generatedAt: now,
    stagingHost: new URL(url).host,
    verdict, counts, checks,
  }, null, 2));

  const rows = checks.map((c) => {
    const badge = { PASS: "✅ PASS", FAIL: "❌ FAIL", BLOCKED: "⛔ BLOCKED", MANUAL_VERIFICATION_REQUIRED: "🔎 MANUAL" }[c.status];
    const detail = (c.detail ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    return `| \`${c.id}\` | ${badge} | ${c.required ? "yes" : "no"} | ${c.title} | ${detail} |`;
  }).join("\n");

  const manualBlock = checks
    .filter((c) => c.required && c.status === "MANUAL_VERIFICATION_REQUIRED")
    .map((c) => `- **${c.id}** — ${c.title}\n  ${c.detail ?? ""}`)
    .join("\n") || "_(none — every required check was answered automatically)_";

  const md = `# Phase 1 verification report

Generated: ${now}
Staging host: \`${new URL(url).host}\`

## Verdict

**${verdict}**

- PASS: ${counts.PASS}
- FAIL: ${counts.FAIL}
- BLOCKED: ${counts.BLOCKED}
- MANUAL_VERIFICATION_REQUIRED: ${counts.MANUAL_VERIFICATION_REQUIRED}

> The verdict is PASS only when every required check is PASS. Any required
> FAIL / BLOCKED / MANUAL check downgrades the verdict.

## Checks

| ID | Status | Required | Title | Detail |
|---|---|---|---|---|
${rows}

## Remaining manual actions

${manualBlock}

## Artifacts

- JSON: \`staging-validation/artifacts/phase1-report.json\`
- Markdown: \`docs/staging/PHASE1_REPORT.md\` (this file)

_Report is fully re-generated on each run; no in-place edits._
`;
  await writeFile(mdPath, md);

  console.log(`\nWrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`\nOverall verdict: ${verdict}`);
  process.exit(verdict === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-phase1 crashed:", e);
  process.exit(1);
});
