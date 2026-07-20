// Idempotent seed. Creates (or refreshes) rc2-customer, rc2-provider, rc2-admin.
// Uses service-role admin API. Safe to re-run.
import { admin } from "../lib/supabase-admin.js";
import { env } from "../config.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";

interface SeedUser { email: string; password: string; user_id: string; role: "customer" | "provider" | "admin"; }

async function upsertUser(email: string, role: SeedUser["role"]): Promise<SeedUser> {
  const password = env.TEST_PASSWORD;
  // Look up existing.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list?.users.find((u) => u.email === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { rc2_seed: true, role },
    });
    if (created.error) throw new Error(`createUser ${email}: ${created.error.message}`);
    user = created.data.user!;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  }
  // Role: profiles + user_roles.
  await admin.from("profiles").upsert({ id: user.id, email, full_name: `RC2 ${role}` }, { onConflict: "id" });
  await admin.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role" });
  return { email, password, user_id: user.id, role };
}

export interface SeedResult {
  customer: SeedUser;
  provider: SeedUser;
  admin: SeedUser;
}

export async function seed(): Promise<SeedResult> {
  const domain = env.TEST_EMAIL_DOMAIN;
  const customer = await upsertUser(`rc2-customer@${domain}`, "customer");
  const provider = await upsertUser(`rc2-provider@${domain}`, "provider");
  const adm = await upsertUser(`rc2-admin@${domain}`, "admin");
  const out = { customer, provider, admin: adm };
  return out;
}

export async function scenarioSeed() {
  return runScenario("01-seed", "Seed customer / provider / admin (idempotent)", async (ctx) => {
    const s = await seed();
    saveJson("seed/users.json", { customer: redact(s.customer), provider: redact(s.provider), admin: redact(s.admin) });
    attach(ctx, "seed/users.json");
    assert(ctx, "customer user id", !!s.customer.user_id);
    assert(ctx, "provider user id", !!s.provider.user_id);
    assert(ctx, "admin user id", !!s.admin.user_id);
  });
}

function redact(u: SeedUser) { return { email: u.email, user_id: u.user_id, role: u.role }; }

// Allow direct execution for manual seeding.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().then((s) => { console.log(JSON.stringify(s, null, 2)); }).catch((e) => { console.error(e); process.exit(1); });
}
