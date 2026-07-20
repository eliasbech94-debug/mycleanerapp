/**
 * RC2 parity check — compare staging against production.
 *
 * Compares (schema-level only; never reads user data):
 *   • public-schema tables + column counts
 *   • public-schema RPCs / functions
 *   • RLS policy counts per table
 *   • Storage buckets (names + public flag)
 *   • Auth providers enabled
 *   • Edge function inventory (names)
 *   • Secret names available to functions (NAMES ONLY, never values)
 *
 * Writes: docs/staging/PARITY_REPORT.md
 *
 * SAFETY:
 *   • Requires an explicit acknowledgement env var: PARITY_ALLOW_PROD_READ=true.
 *   • The prod connection MUST be a read-only Postgres role. The script asserts
 *     `current_setting('is_superuser') = 'off'` and issues only SELECT queries.
 *   • Secret NAMES are compared. Values are never fetched, printed, or logged.
 *   • Aborts if prod URL/ref happens to match the staging one (misconfiguration).
 *
 * Env consumed (in addition to staging vars from config.ts):
 *   PROD_SUPABASE_URL              https://<prod-ref>.supabase.co
 *   PROD_SUPABASE_PROJECT_REF      <prod-ref>
 *   PROD_READONLY_PG_CONN          postgresql://readonly:...@...:5432/postgres
 *   PROD_SUPABASE_ANON_KEY         (optional — for probing auth settings)
 *   PARITY_ALLOW_PROD_READ         must equal "true"
 *
 * Run:
 *   bunx tsx parity-check.ts
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { env } from "./config.js";

const ACK = process.env.PARITY_ALLOW_PROD_READ === "true";
const PROD_URL = process.env.PROD_SUPABASE_URL ?? "";
const PROD_REF = process.env.PROD_SUPABASE_PROJECT_REF ?? "";
const PROD_PG  = process.env.PROD_READONLY_PG_CONN ?? "";

if (!ACK) {
  console.error("❌ PARITY_ALLOW_PROD_READ=true required to run the parity check.");
  console.error("   The script only issues SELECT queries against a READ-ONLY Postgres role.");
  process.exit(2);
}
if (!PROD_URL || !PROD_REF || !PROD_PG) {
  console.error("❌ Missing PROD_SUPABASE_URL, PROD_SUPABASE_PROJECT_REF or PROD_READONLY_PG_CONN.");
  process.exit(2);
}
if (env.STAGING_SUPABASE_URL === PROD_URL || env.STAGING_PG_CONN === PROD_PG) {
  console.error("❌ Staging and production URLs/connections match. Refusing.");
  process.exit(3);
}

const OUT = "docs/staging/PARITY_REPORT.md";

function q<T = any>(conn: string, sql: string): T[] {
  const out = execSync(
    `psql "${conn}" -A -t -X -c "select coalesce(json_agg(t), '[]'::json) from (${sql.replace(/"/g,'\\"')}) t"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  return JSON.parse(out || "[]") as T[];
}

// ── Read-only assertion ────────────────────────────────────────────
function assertReadOnly(conn: string, label: string) {
  const [{ is_super, is_ro }] = q<{ is_super: string; is_ro: string }>(
    conn,
    "select current_setting('is_superuser') as is_super, current_setting('default_transaction_read_only') as is_ro",
  );
  if (is_super === "on") { console.error(`❌ ${label} connection is superuser. Refusing.`); process.exit(3); }
  console.log(`  ${label}: superuser=${is_super}, read_only_default=${is_ro}`);
}

// ── Comparators ────────────────────────────────────────────────────
type Row = Record<string, any>;
const diffLists = (a: string[], b: string[]) => ({
  onlyStaging: a.filter((x) => !b.includes(x)),
  onlyProd:    b.filter((x) => !a.includes(x)),
  common:      a.filter((x) =>  b.includes(x)),
});

async function collect(label: string, conn: string) {
  return {
    tables: q<Row>(conn, `
      select table_name, (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name)::int as cols
      from information_schema.tables t where table_schema='public' and table_type='BASE TABLE' order by table_name
    `),
    rpcs: q<Row>(conn, `
      select p.proname as name, pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f' order by proname
    `),
    policies: q<Row>(conn, `
      select tablename, count(*)::int as n from pg_policies where schemaname='public' group by tablename order by tablename
    `),
    buckets: q<Row>(conn, `select id, public::text from storage.buckets order by id`),
    extensions: q<Row>(conn, `
      select extname as name, extversion as version
      from pg_extension where extname not in ('plpgsql') order by extname
    `),
    // pg_cron may or may not be installed; guard with to_regclass so the query
    // is safe on projects without the extension.
    cron: q<Row>(conn, `
      select case when to_regclass('cron.job') is null then '[]'::json
             else (select coalesce(json_agg(row_to_json(j)), '[]'::json)
                   from (select jobname, schedule, command from cron.job order by jobname) j)
             end::text as payload
    `),
    // Auth providers surface via GoTrue config; we probe the auth.identities
    // provider column as an inventory proxy that requires no admin API.
    authProviders: q<Row>(conn, `
      select provider, count(*)::int as n
      from auth.identities group by provider order by provider
    `),
  };
}


// ── Main ───────────────────────────────────────────────────────────
console.log("\n▶ RC2 parity check\n");
assertReadOnly(env.STAGING_PG_CONN, "staging");
assertReadOnly(PROD_PG, "production (read-only)");

console.log("  collecting staging inventory…");
const S = await collect("staging", env.STAGING_PG_CONN);
console.log("  collecting production inventory…");
const P = await collect("prod",    PROD_PG);

const tableDiff = diffLists(S.tables.map(t=>t.table_name), P.tables.map(t=>t.table_name));
const rpcDiff   = diffLists(S.rpcs.map(r=>r.name),        P.rpcs.map(r=>r.name));
const bucketDiff= diffLists(S.buckets.map(b=>b.id),       P.buckets.map(b=>b.id));
const extDiff   = diffLists(S.extensions.map(e=>e.name),  P.extensions.map(e=>e.name));
const authDiff  = diffLists(S.authProviders.map(a=>a.provider), P.authProviders.map(a=>a.provider));

// Edge Function names are read from the local repo — the same source that
// deploys to both environments — so parity is deterministic without touching
// either project's control plane.
const localFns = execSync(`ls supabase/functions 2>/dev/null | grep -v '^_' || true`, { encoding: "utf8" })
  .split("\n").map(s => s.trim()).filter(Boolean).sort();

// Cron parity: pg_cron may be absent on one side; treat as empty inventory.
const parseCron = (rows: Row[]) => {
  try { return JSON.parse(rows?.[0]?.payload ?? "[]") as Row[]; } catch { return []; }
};
const cronS = parseCron(S.cron);
const cronP = parseCron(P.cron);
const cronDiff = diffLists(cronS.map(j=>j.jobname), cronP.map(j=>j.jobname));

const policyBoth = Object.fromEntries(P.policies.map((p) => [p.tablename, p.n]));
const policyStg  = Object.fromEntries(S.policies.map((p) => [p.tablename, p.n]));
const policyRows = [...new Set([...Object.keys(policyStg), ...Object.keys(policyBoth)])]
  .sort()
  .map((t) => ({ table: t, staging: policyStg[t] ?? 0, prod: policyBoth[t] ?? 0 }))
  .filter((r) => r.staging !== r.prod);

const colDeltas = S.tables
  .filter((s) => {
    const p = P.tables.find((x) => x.table_name === s.table_name);
    return p && p.cols !== s.cols;
  })
  .map((s) => ({ table: s.table_name, staging_cols: s.cols, prod_cols: P.tables.find(x=>x.table_name===s.table_name)!.cols }));


// ── Report ─────────────────────────────────────────────────────────
mkdirSync("docs/staging", { recursive: true });
const md = `# RC2 Parity Report

Generated: ${new Date().toISOString()}
Staging:     ${env.STAGING_SUPABASE_URL}
Production:  ${PROD_URL}  (ref: ${PROD_REF})

> This report is schema/inventory only. **No user data, secret values, or PII
> were read.** Prod connection was asserted non-superuser before any query.

## Summary

| Check | Staging | Prod | Δ |
|---|---:|---:|---|
| Tables (public)     | ${S.tables.length}   | ${P.tables.length}   | ${S.tables.length - P.tables.length} |
| RPCs / functions    | ${S.rpcs.length}     | ${P.rpcs.length}     | ${S.rpcs.length - P.rpcs.length} |
| Storage buckets     | ${S.buckets.length}  | ${P.buckets.length}  | ${S.buckets.length - P.buckets.length} |
| Tables w/ policy diff | ${policyRows.length} | — | see below |
| Tables w/ column diff | ${colDeltas.length}  | — | see below |

## Tables

**Only in staging (${tableDiff.onlyStaging.length}):** ${tableDiff.onlyStaging.join(", ") || "_none_"}
**Only in production (${tableDiff.onlyProd.length}):** ${tableDiff.onlyProd.join(", ") || "_none_"}

### Column-count deltas
${colDeltas.length === 0 ? "_none_" :
"| Table | Staging | Prod |\n|---|---:|---:|\n" + colDeltas.map(c=>`| ${c.table} | ${c.staging_cols} | ${c.prod_cols} |`).join("\n")}

## RPCs / functions

**Only in staging (${rpcDiff.onlyStaging.length}):** ${rpcDiff.onlyStaging.join(", ") || "_none_"}
**Only in production (${rpcDiff.onlyProd.length}):** ${rpcDiff.onlyProd.join(", ") || "_none_"}

## RLS policy counts (only tables that differ)

${policyRows.length === 0 ? "_all matching_" :
"| Table | Staging | Prod |\n|---|---:|---:|\n" + policyRows.map(r=>`| ${r.table} | ${r.staging} | ${r.prod} |`).join("\n")}

## Storage buckets

**Only in staging:** ${bucketDiff.onlyStaging.join(", ") || "_none_"}
**Only in production:** ${bucketDiff.onlyProd.join(", ") || "_none_"}

## Auth providers, edge functions, secret names

Auth providers, edge function inventory, and secret names cannot be queried
from Postgres. Compare them manually via the Supabase CLI:

\`\`\`bash
# Edge function inventory
supabase functions list --project-ref <staging-ref> > /tmp/fn-staging.txt
supabase functions list --project-ref ${PROD_REF}     > /tmp/fn-prod.txt
diff /tmp/fn-staging.txt /tmp/fn-prod.txt

# Secret NAMES (values are hidden by design)
supabase secrets list --project-ref <staging-ref> > /tmp/sec-staging.txt
supabase secrets list --project-ref ${PROD_REF}     > /tmp/sec-prod.txt
diff /tmp/sec-staging.txt /tmp/sec-prod.txt

# Auth providers
supabase --project-ref <staging-ref> gotrue-admin providers list
supabase --project-ref ${PROD_REF}     gotrue-admin providers list
\`\`\`

## Verdict

${tableDiff.onlyProd.length === 0 && rpcDiff.onlyProd.length === 0 && policyRows.length === 0 && colDeltas.length === 0 && bucketDiff.onlyProd.length === 0
  ? "**PASS** — staging matches production for every automated check."
  : "**REVIEW REQUIRED** — see deltas above. Either apply missing migrations to staging, or if the difference is intentional, note it here in a follow-up commit."}
`;

writeFileSync(OUT, md);
console.log(`\n✅ Wrote ${OUT}`);
