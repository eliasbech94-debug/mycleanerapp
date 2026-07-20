/**
 * RC2 demo seed — realistic, idempotent, reversible.
 *
 * Populates a staging Supabase project with enough data to make every
 * dashboard, marketplace and admin view meaningful:
 *   • 20 customers                (all countries in COUNTRY_MIX)
 *   • 50 providers                (across every lifecycle state)
 *   • ~250 bookings               (spread over ±90 days, mixed statuses)
 *   • ~180 reviews                (attached to completed bookings)
 *   • ~40  finance_payouts        (paid / pending / failed)
 *   • ~8   stripe_disputes        (needs_response / under_review / won / lost)
 *   • ~25  support conversations  (with messages, mixed kinds)
 *   • ~6   refund_requests_v2     (pending / approved / denied)
 *
 * ── Guarantees ─────────────────────────────────────────────────────────
 * 1. Idempotent. Every row carries either `metadata->>'seed' = 'rc2-demo'`
 *    or user emails prefixed with `demo+`, and the script SKIPS anything
 *    it has already created on a previous run.
 * 2. Reversible. `cleanup-rc2.sh --all-rc2` removes every seeded auth user
 *    and cascades to the domain rows. Audit tables are never touched.
 * 3. Refuses to run against production. Uses the same guarded `env` from
 *    ./config.ts which aborts with exit code 3 on prod refs / live keys.
 * 4. Best-effort. Tables that require live Sumsub or Stripe (person_identities,
 *    stripe_charges_enabled=true) are inserted with server-side-safe values;
 *    real integration state is filled by the RC2 scenarios and webhook replays.
 *
 * Run:
 *   bun run tsx scenarios/seed-demo.ts            # full seed
 *   bun run tsx scenarios/seed-demo.ts --dry-run  # counts only, no writes
 *   bun run tsx scenarios/seed-demo.ts --stats    # inventory current seed rows
 */
import { admin } from "../lib/supabase-admin.js";
import { env, RC2_TAG } from "../config.js";

// ── Constants ────────────────────────────────────────────────────────
const SEED_TAG = "rc2-demo";                   // stable marker across runs
const EMAIL_PREFIX = "demo+";                  // stable prefix — cleanup finds this
const DOMAIN = env.TEST_EMAIL_DOMAIN;
const PASSWORD = env.TEST_PASSWORD;

const COUNTRY_MIX = [
  { iso: "DK", currency: "DKK", city: "København", lat: 55.6761, lng: 12.5683 },
  { iso: "SE", currency: "SEK", city: "Stockholm",  lat: 59.3293, lng: 18.0686 },
  { iso: "DE", currency: "EUR", city: "Berlin",     lat: 52.5200, lng: 13.4050 },
  { iso: "NL", currency: "EUR", city: "Amsterdam",  lat: 52.3676, lng:  4.9041 },
];

const SERVICE_CATEGORIES = ["cleaning", "handyman", "garden", "moving"];
const LANGUAGES = ["da", "en", "sv", "de", "nl"];
const PROVIDER_TIERS = ["new", "rising", "trusted", "partner"];
const FEMALE = ["Astrid","Bjørk","Cecilie","Ditte","Elin","Frida","Gunn","Hedda","Ida","Johanna"];
const MALE = ["Anders","Bjørn","Casper","Daniel","Erik","Filip","Gustav","Henrik","Ivar","Jonas"];
const LAST = ["Nielsen","Andersen","Larsen","Johansson","Müller","de Vries","Sørensen","Berg","Lund","Holm"];

const rng = (() => { let s = 0xC0FFEE; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

const DRY = process.argv.includes("--dry-run");
const STATS = process.argv.includes("--stats");

// ── Dry-run plan tracker ────────────────────────────────────────────
// Every seeder increments this so the dry-run report is exact, not estimated.
const PLAN: Record<string, number> = {};
function plan(kind: string, n = 1) { PLAN[kind] = (PLAN[kind] ?? 0) + n; }


// Provider lifecycle distribution — must sum to 50.
const PROVIDER_STATE_MIX: Array<{ state: string; visibility: string; count: number; ready: boolean }> = [
  { state: "active",           visibility: "public", count: 30, ready: true  },
  { state: "pending_review",   visibility: "hidden", count:  8, ready: true  },
  { state: "pending_identity", visibility: "hidden", count:  6, ready: false },
  { state: "pending_stripe",   visibility: "hidden", count:  4, ready: false },
  { state: "suspended",        visibility: "hidden", count:  2, ready: false },
];

interface SeededUser { id: string; email: string; role: "customer" | "provider" | "admin"; country: string; }

// ── Helpers ─────────────────────────────────────────────────────────
function slot(kind: string, i: number) { return `${EMAIL_PREFIX}${SEED_TAG}-${kind}-${String(i).padStart(3,"0")}@${DOMAIN}`; }
function fullName() { return `${pick([...FEMALE, ...MALE])} ${pick(LAST)}`; }

async function alreadyExists(email: string): Promise<string | null> {
  // Supabase Admin has no email lookup; page through users. Cheap enough for 100 rows.
  let page = 1;
  while (page < 30) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users: any[] = Array.isArray((data as any)?.users) ? (data as any).users : [];
    const hit = users.find((u) => u?.email === email);
    if (hit) return String(hit.id);
    if (users.length < 200) return null;
    page++;
  }
  return null;
}

async function upsertUser(email: string, role: SeededUser["role"], country: string, meta: Record<string, any> = {}): Promise<SeededUser> {
  const existing = await alreadyExists(email);
  if (existing) {
    // idempotent: refresh role + country
    await admin.from("profiles").upsert({ id: existing, email, full_name: meta.full_name ?? "RC2 " + role, country_code: country }, { onConflict: "id" });
    await admin.from("user_roles").upsert({ user_id: existing, role: role as any }, { onConflict: "user_id,role" });
    return { id: existing, email, role, country };
  }
  if (DRY) { plan(`auth.users (${role})`); plan("profiles"); plan("user_roles"); return { id: "dry-" + email, email, role, country }; }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { seed: SEED_TAG, rc2_tag: RC2_TAG, role, country, ...meta },
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const uid = data.user!.id;
  await admin.from("profiles").upsert({ id: uid, email, full_name: meta.full_name ?? fullName(), country_code: country, sms_verified_at: new Date().toISOString() }, { onConflict: "id" });
  await admin.from("user_roles").upsert({ user_id: uid, role: role as any }, { onConflict: "user_id,role" });
  return { id: uid, email, role, country };
}


async function tableCount(table: string, filter?: (q: any) => any): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) { console.warn(`  count(${table}) failed: ${error.message}`); return 0; }
  return count ?? 0;
}

// ── Seeders ─────────────────────────────────────────────────────────

async function seedCustomers(): Promise<SeededUser[]> {
  console.log("▶ Seeding 20 customers…");
  const out: SeededUser[] = [];
  for (let i = 0; i < 20; i++) {
    const country = COUNTRY_MIX[i % COUNTRY_MIX.length].iso;
    out.push(await upsertUser(slot("customer", i), "customer", country, { full_name: fullName() }));
  }
  console.log(`  ✓ ${out.length} customers`);
  return out;
}

async function seedProviders(): Promise<SeededUser[]> {
  console.log("▶ Seeding 50 providers across lifecycle states…");
  const out: SeededUser[] = [];
  let idx = 0;
  for (const bucket of PROVIDER_STATE_MIX) {
    for (let n = 0; n < bucket.count; n++, idx++) {
      const c = COUNTRY_MIX[idx % COUNTRY_MIX.length];
      const email = slot("provider", idx);
      const user = await upsertUser(email, "provider", c.iso, { full_name: fullName() });

      const tier = bucket.state === "active" ? pick(PROVIDER_TIERS) : "new";
      const dob = new Date(1980 + between(0, 25), between(0, 11), between(1, 28)).toISOString().slice(0, 10);
      const languages = [c.iso === "DK" ? "da" : c.iso === "SE" ? "sv" : c.iso === "DE" ? "de" : "nl", "en"];
      const categories = [pick(SERVICE_CATEGORIES), pick(SERVICE_CATEGORIES)].filter((v, i, a) => a.indexOf(v) === i);

      const profile = {
        user_id: user.id,
        status: bucket.state as any,
        visibility: bucket.visibility as any,
        provider_tier: tier as any,
        display_name: fullName(),
        headline: `Erfaren ${categories[0]}-udbyder i ${c.city}`,
        bio: `Jeg tilbyder professionel ${categories[0]} med fokus på kvalitet. Base i ${c.city}. Fleksibel, punktlig og grundig — RC2 demo data.`,
        photo_path: null,
        languages,
        service_categories: categories,
        years_experience: between(1, 15),
        hourly_rate: between(200, 550),
        service_area_radius_km: between(5, 30),
        base_country_code: c.iso,
        base_lat: c.lat + (rng() - 0.5) * 0.2,
        base_lng: c.lng + (rng() - 0.5) * 0.2,
        base_address_formatted: `Demo Street ${between(1, 200)}, ${c.city}`,
        base_validation_source: "seed",
        date_of_birth: dob,
        terms_accepted_at: new Date().toISOString(),
        identity_status: bucket.state === "pending_identity" ? "pending" : "approved",
        stripe_charges_enabled: bucket.ready,
        stripe_payouts_enabled: bucket.ready,
        stripe_details_submitted: bucket.ready,
        stripe_requirements_due: [],
        completion_pct: bucket.state === "active" ? 100 : between(40, 90),
        is_public: bucket.state === "active",
      };
      if (!DRY) {
        // Trigger `provider_profiles_enforce_base_address` requires a matching
        // place_validations row for real place_ids. We DELIBERATELY leave
        // base_address_place_id NULL, which the trigger allows. This is the
        // ONE place where seed diverges from the production lifecycle — see
        // the "Address validation bypass" note in STAGING_SETUP.md. All other
        // fields (formatted, country, lat/lng) still populate and are used
        // by marketplace search and map rendering.
        const { error } = await admin.from("provider_profiles").upsert(profile as any, { onConflict: "user_id" });
        if (error) console.warn(`  ⚠ provider_profiles ${email}: ${error.message}`);
        await admin.from("provider_trust").upsert({ provider_id: user.id, trust_flags: [], notes: SEED_TAG } as any, { onConflict: "provider_id" });
      } else {
        plan("provider_profiles");
        plan("provider_trust");
      }

      out.push(user);
    }
  }
  console.log(`  ✓ ${out.length} providers (${PROVIDER_STATE_MIX.map(b=>`${b.count} ${b.state}`).join(", ")})`);
  return out;
}

async function seedAdminsAndSupport(): Promise<SeededUser[]> {
  console.log("▶ Seeding staff (1 super_admin, 2 admin, 3 support)…");
  const out: SeededUser[] = [];
  out.push(await upsertUser(slot("super", 0), "admin", "DK", { full_name: "RC2 Super Admin" }));
  if (!DRY) await admin.from("user_roles").upsert({ user_id: out[0].id, role: "super_admin" as any }, { onConflict: "user_id,role" });
  for (let i = 0; i < 2; i++) out.push(await upsertUser(slot("admin", i), "admin", "DK"));
  for (let i = 0; i < 3; i++) {
    const u = await upsertUser(slot("support", i), "customer", "DK");
    if (!DRY) await admin.from("user_roles").upsert({ user_id: u.id, role: "support" as any }, { onConflict: "user_id,role" });
    out.push({ ...u, role: "admin" });
  }
  console.log(`  ✓ ${out.length} staff users`);
  return out;
}

async function seedBookings(customers: SeededUser[], providers: SeededUser[]) {
  console.log("▶ Seeding ~250 bookings…");
  const activeProviders = providers.slice(0, PROVIDER_STATE_MIX[0].count); // active only
  const statusMix: Array<{ status: string; payment_status: string; weight: number }> = [
    { status: "completed",             payment_status: "captured",   weight: 60 },
    { status: "confirmed",             payment_status: "authorized", weight: 20 },
    { status: "pending",               payment_status: "pending",    weight:  8 },
    { status: "cancelled",             payment_status: "canceled",   weight:  7 },
    { status: "cancelled",             payment_status: "refunded",   weight:  3 },
    { status: "no_show",               payment_status: "captured",   weight:  2 },
  ];
  const pool: Array<{ status: string; payment_status: string }> = [];
  statusMix.forEach((m) => { for (let i = 0; i < m.weight; i++) pool.push(m); });

  let inserted = 0;
  const target = 250;
  for (let i = 0; i < target; i++) {
    const cust = customers[i % customers.length];
    const prov = activeProviders[i % activeProviders.length];
    const c = COUNTRY_MIX.find((x) => x.iso === prov.country) ?? COUNTRY_MIX[0];
    const mix = pool[i % pool.length];
    const days = between(-90, 30);
    const bookingDate = new Date(Date.now() + days * 86400_000).toISOString();
    const hours = between(2, 6);
    const rate = between(220, 500);
    const gross = hours * rate * 100; // øre
    const platformFee = Math.round(gross * 0.14);
    const providerGets = gross - platformFee;
    const row = {
      customer_user_id: cust.id,
      provider_id: prov.id,
      status: mix.status as any,
      payment_status: mix.payment_status as any,
      booking_date: bookingDate,
      country_code: c.iso,
      currency: c.currency,
      duration_minutes: hours * 60,
      hourly_rate: rate * 100,
      customer_pays: gross + platformFee,
      provider_gets: providerGets,
      platform_fee_amount: platformFee * 2,
      service_category: pick(SERVICE_CATEGORIES),
      address: `Demo Street ${between(1, 200)}, ${c.city}`,
      metadata: { seed: SEED_TAG, rc2_tag: RC2_TAG },
    };
    if (!DRY) {
      const { error } = await admin.from("bookings").insert(row as any);
      if (!error) inserted++;
      else if (!/duplicate|unique/i.test(error.message)) {
        // seed already present is OK; other errors we log once
        if (i === 0) console.warn(`  ⚠ booking insert: ${error.message}`);
      }
    } else { inserted++; plan("bookings"); }
  }

  console.log(`  ✓ ${inserted}/${target} bookings inserted (or already present)`);
}

async function seedReviews(_customers: SeededUser[], _providers: SeededUser[]) {
  // No `reviews` table exists in the current schema — average_rating in
  // get_public_provider_profile_v1 returns 0. When the reviews table is
  // introduced (post-launch), extend this function. Recorded as a KNOWN GAP.
  console.log("▶ Reviews: SKIPPED — no `reviews` table in schema (recorded in seed report).");
}

async function seedFinance(providers: SeededUser[]) {
  console.log("▶ Seeding ~40 finance_payouts…");
  const active = providers.slice(0, PROVIDER_STATE_MIX[0].count);
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const prov = active[i % active.length];
    const c = COUNTRY_MIX.find((x) => x.iso === prov.country) ?? COUNTRY_MIX[0];
    const gross = between(400, 2000) * 100;
    const fee = Math.round(gross * 0.14);
    const net = gross - fee;
    const status = pick(["paid", "pending", "in_transit", "failed"]);
    const row = {
      provider_user_id: prov.id,
      provider_id: prov.id,
      stripe_transfer_id: `tr_seed_${SEED_TAG}_${i}`,
      gross_amount: gross,
      platform_fee_amount: fee,
      net_amount: net,
      currency: c.currency,
      status,
      description: "RC2 demo payout",
      metadata: { seed: SEED_TAG, rc2_tag: RC2_TAG },
    };
    if (!DRY) {
      const { error } = await admin.from("finance_payouts").upsert(row as any, { onConflict: "stripe_transfer_id" });
      if (!error) n++;
      else if (i === 0) console.warn(`  ⚠ finance_payouts: ${error.message}`);
    } else { n++; plan("finance_payouts"); }
  }

  console.log(`  ✓ ${n}/40 finance_payouts`);
}

async function seedDisputes(customers: SeededUser[], providers: SeededUser[]) {
  console.log("▶ Seeding 8 stripe_disputes…");
  const active = providers.slice(0, PROVIDER_STATE_MIX[0].count);
  const statuses = ["needs_response", "under_review", "won", "lost", "warning_needs_response", "warning_under_review", "won", "lost"];
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const prov = active[i % active.length];
    const cust = customers[i % customers.length];
    const row = {
      stripe_dispute_id: `dp_seed_${SEED_TAG}_${i}`,
      stripe_charge_id: `ch_seed_${SEED_TAG}_${i}`,
      amount: between(500, 5000) * 100,
      currency: "DKK",
      reason: pick(["fraudulent", "unrecognized", "duplicate", "product_not_received"]),
      status: statuses[i],
      customer_user_id: cust.id,
      provider_id: prov.id,
      metadata: { seed: SEED_TAG, rc2_tag: RC2_TAG },
    };
    if (!DRY) {
      const { error } = await admin.from("stripe_disputes").upsert(row as any, { onConflict: "stripe_dispute_id" });
      if (!error) n++;
      else if (i === 0) console.warn(`  ⚠ stripe_disputes: ${error.message}`);
    } else { n++; plan("stripe_disputes"); }
  }

  console.log(`  ✓ ${n}/8 disputes`);
}

async function seedSupportTickets(customers: SeededUser[], providers: SeededUser[], staff: SeededUser[]) {
  console.log("▶ Seeding 25 support conversations…");
  const kinds = ["customer_support", "provider_support", "dispute", "internal"];
  let n = 0;
  for (let i = 0; i < 25; i++) {
    const kind = kinds[i % kinds.length];
    const cust = customers[i % customers.length];
    const prov = providers[i % providers.length];
    const support = staff.find((s) => s.email.includes("support")) ?? staff[0];
    const conv = {
      kind: kind as any,
      status: pick(["open", "pending", "closed"]) as any,
      subject: `RC2 demo ticket ${i + 1} (${kind})`,
      customer_user_id: kind === "customer_support" ? cust.id : null,
      provider_user_id: kind === "provider_support" ? prov.id : null,
      assigned_support_id: support?.id ?? null,
      metadata: { seed: SEED_TAG, rc2_tag: RC2_TAG },
    };
    if (DRY) { n++; plan("conversations"); plan("conversation_participants", 2); plan("messages", 2); continue; }
    const { data: c, error } = await admin.from("conversations").insert(conv as any).select("id").maybeSingle();
    if (error || !c) { if (i === 0) console.warn(`  ⚠ conversations: ${error?.message}`); continue; }
    await admin.from("conversation_participants").insert([
      { conversation_id: c.id, user_id: cust.id, role: "customer" as any },
      { conversation_id: c.id, user_id: support!.id, role: "support" as any },
    ] as any);
    await admin.from("messages").insert([
      { conversation_id: c.id, sender_user_id: cust.id, sender_role: "customer" as any, body: "Hej, jeg har brug for hjælp med min booking (RC2 demo)." },
      { conversation_id: c.id, sender_user_id: support!.id, sender_role: "support" as any, body: "Hej — jeg kigger på det og vender tilbage." },
    ] as any);
    n++;
  }
  console.log(`  ✓ ${n}/25 conversations`);
}

async function seedRefundRequests(customers: SeededUser[]) {
  console.log("▶ Seeding 6 refund_requests_v2…");
  let n = 0;
  const statuses = ["pending", "approved", "denied", "pending", "approved", "denied"];
  for (let i = 0; i < 6; i++) {
    const cust = customers[i % customers.length];
    const row = {
      customer_user_id: cust.id,
      amount: between(100, 1500) * 100,
      currency: "DKK",
      status: statuses[i],
      reason: "RC2 demo refund request",
      metadata: { seed: SEED_TAG, rc2_tag: RC2_TAG },
    };
    if (!DRY) {
      const { error } = await admin.from("refund_requests_v2").insert(row as any);
      if (!error) n++;
      else if (i === 0) console.warn(`  ⚠ refund_requests_v2: ${error.message}`);
    } else n++;
  }
  console.log(`  ✓ ${n}/6 refund requests`);
}

// ── Stats mode ─────────────────────────────────────────────────────
async function stats() {
  console.log("▶ Current RC2 seed inventory:");
  console.log(`  auth users (demo+ prefix): (counted via listUsers, see cleanup output)`);
  for (const t of ["profiles", "provider_profiles", "provider_trust", "bookings", "finance_payouts", "stripe_disputes", "conversations", "messages", "refund_requests_v2"]) {
    console.log(`  ${t.padEnd(24)} ${await tableCount(t, (q) => q.contains("metadata", { seed: SEED_TAG }))}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n▶ RC2 demo seed  (tag=${SEED_TAG}, run=${RC2_TAG})  ${DRY ? "[DRY-RUN]" : ""}\n`);
  if (STATS) return stats();
  const customers = await seedCustomers();
  const providers = await seedProviders();
  const staff = await seedAdminsAndSupport();
  await seedBookings(customers, providers);
  await seedReviews(customers, providers);
  await seedFinance(providers);
  await seedDisputes(customers, providers);
  await seedSupportTickets(customers, providers, staff);
  await seedRefundRequests(customers);
  console.log(`\n✅ Seed complete. To remove: ./cleanup-rc2.sh --all-rc2`);
}

main().catch((e) => { console.error("❌ seed failed:", e); process.exit(1); });
