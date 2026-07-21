// RLS authorisation matrix for dynamic-pricing tables + RPCs.
// Exercises anon / authenticated-customer / provider / admin / service_role
// against every protected surface. Every row is asserted; any deviation fails.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config.js";
import { admin } from "../lib/supabase-admin.js";
import { runScenario, assert, saveJson, attach } from "../lib/reporter.js";

type Role = "anon" | "customer" | "provider" | "admin" | "service_role";

async function clientFor(role: Role): Promise<SupabaseClient> {
  if (role === "service_role") return admin;
  const c = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (role === "anon") return c;
  const emailMap: Record<Exclude<Role, "anon" | "service_role">, string> = {
    customer: `rc2-customer@${env.TEST_EMAIL_DOMAIN}`,
    provider: `rc2-provider@${env.TEST_EMAIL_DOMAIN}`,
    admin: `rc2-admin@${env.TEST_EMAIL_DOMAIN}`,
  };
  const { error } = await c.auth.signInWithPassword({
    email: emailMap[role as Exclude<Role, "anon" | "service_role">],
    password: env.TEST_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${role}: ${error.message}`);
  return c;
}

// Expectation matrix. `null` = expect any deny (RLS empty result OR 401/403).
const MATRIX = [
  { table: "pricing_calculations",         action: "select", role: "anon",         expectDeny: true },
  { table: "pricing_calculations",         action: "select", role: "customer",     expectDeny: true },
  { table: "pricing_calculations",         action: "select", role: "provider",     expectDeny: true },
  { table: "pricing_calculations",         action: "select", role: "admin",        expectDeny: true },
  { table: "pricing_calculations",         action: "select", role: "service_role", expectDeny: false },
  { table: "dynamic_pricing_config",       action: "select", role: "anon",         expectDeny: true },
  { table: "dynamic_pricing_config",       action: "select", role: "customer",     expectDeny: false }, // read allowed
  { table: "dynamic_pricing_config",       action: "insert",role: "customer",      expectDeny: true },
  { table: "dynamic_pricing_config",       action: "insert",role: "admin",         expectDeny: false },
  { table: "provider_pricing_settings",    action: "select", role: "anon",         expectDeny: true },
  { table: "provider_pricing_settings",    action: "select", role: "customer",     expectDeny: true },  // not owner
  { table: "provider_pricing_settings",    action: "select", role: "provider",     expectDeny: false }, // owner
  { table: "market_rate_thresholds",       action: "select", role: "anon",         expectDeny: false }, // public read
  { table: "market_rate_thresholds",       action: "insert",role: "customer",      expectDeny: true },
] as const;

async function probeTable(c: SupabaseClient, table: string, action: "select"|"insert") {
  if (action === "select") {
    const { data, error } = await c.from(table).select("*").limit(1);
    return { rows: data?.length ?? 0, error: error?.message ?? null };
  }
  const { error } = await c.from(table).insert({}).select();
  return { rows: 0, error: error?.message ?? "inserted (unexpected)" };
}

export async function scenarioPricingRlsMatrix() {
  return runScenario("13-pricing-rls-matrix", "RLS matrix — pricing tables/RPCs across 5 roles", async (ctx) => {
    const clients: Partial<Record<Role, SupabaseClient>> = {};
    for (const role of ["anon","customer","provider","admin","service_role"] as Role[]) {
      try { clients[role] = await clientFor(role); }
      catch (e) { assert(ctx, `sign-in ${role}`, false, (e as Error).message); }
    }
    const results: any[] = [];
    for (const row of MATRIX) {
      const c = clients[row.role as Role];
      if (!c) { assert(ctx, `${row.role} ${row.action} ${row.table}`, false, "no client"); continue; }
      const r = await probeTable(c, row.table, row.action);
      const denied = r.error !== null || (row.action === "select" && r.rows === 0 && row.role === "anon");
      const pass = row.expectDeny ? denied : !denied || r.rows > 0;
      results.push({ ...row, actual: r, denied, pass });
      assert(ctx, `${row.role} ${row.action} ${row.table} (expectDeny=${row.expectDeny})`, pass, JSON.stringify(r));
    }

    // RPC: lock_pricing_quote must be callable only by service_role (writer)
    // and rejected for other roles.
    for (const role of ["anon","customer","provider","admin","service_role"] as Role[]) {
      const c = clients[role]; if (!c) continue;
      const { error } = await c.rpc("lock_pricing_quote", {
        _quote_id: "00000000-0000-0000-0000-000000000000",
        _booking_id: "00000000-0000-0000-0000-000000000000",
        _fingerprint: "x", _customer_user_id: "00000000-0000-0000-0000-000000000000",
        _country_code: "DK", _currency: "DKK",
      });
      // service_role: expect a business error (not_found), not an auth error.
      const authDenied = error?.message?.match(/permission|denied|not allowed|RLS|jwt/i) != null;
      const shouldDeny = role !== "service_role";
      assert(ctx, `rpc lock_pricing_quote as ${role}`, shouldDeny ? authDenied : !authDenied, error?.message ?? "no error");
      results.push({ rpc: "lock_pricing_quote", role, error: error?.message ?? null });
    }

    saveJson("pricing/rls-matrix.json", results);
    attach(ctx, "pricing/rls-matrix.json");
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scenarioPricingRlsMatrix().then(() => process.exit(0));
}
