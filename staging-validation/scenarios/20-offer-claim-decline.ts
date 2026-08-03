/**
 * Scenario 20 — PR-2 / PR-2b Atomic offer claim + decline (direct-provider mode)
 *
 * Coverage
 *   A. Happy path claim (incl. authoritative duration rule echoed back)
 *   B. Wrong provider forbidden
 *   C. Customer role cannot claim/decline
 *   D. Winner double-retry is idempotent
 *   E. Competing offer in direct mode is forbidden / superseded
 *   F. Time-overlap blocked → slot_conflict
 *   G. 30-minute buffer semantics (11:30 blocked, 12:00 allowed)
 *   H. Decline path + idempotency
 *   I. Invalid interval → structured `invalid_interval` (no raw SQL error)
 *   J. Ineligible provider rejected
 *   K. Service-specific minimum duration (standard 90, after-party 120)
 *   L. Every implemented eligibility gate, negatively tested
 *   M. TRUE PARALLEL CONCURRENCY — two simultaneous connections, same offer
 *   Z. Fixture teardown proof
 *
 * Authenticated calls are simulated with `SET LOCAL role authenticated` plus
 * request.jwt.claims. Requires a role with DDL-free write access (service/postgres).
 */
import { execSync, spawn } from "node:child_process";
import { env } from "../config.js";
import { logAssertion } from "../lib/reporter.js";

const CONN = env.STAGING_PG_CONN;
const S = "scenario-20";
const TAG = "pr2-test";

function sql<T = any>(query: string): T[] {
  const out = execSync(
    `psql "${CONN}" -A -t -X -c "select coalesce(json_agg(t), '[]'::json) from (${query.replace(/"/g, '\\"')}) t;"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  return JSON.parse(out || "[]") as T[];
}

function exec(query: string): void {
  execSync(`psql "${CONN}" -X -v ON_ERROR_STOP=1 -c "${query.replace(/"/g, '\\"')}"`, { stdio: ["ignore", "ignore", "inherit"] });
}

function callAs(userId: string, query: string): any {
  const script = `BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';
SELECT json_agg(t) AS r FROM (${query}) t;
COMMIT;`;
  const out = execSync(`psql "${CONN}" -A -t -X -f -`, { encoding: "utf8", input: script }).trim();
  const lines = out.split("\n").filter(Boolean);
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

const claim = (uid: string, offerId: string) =>
  callAs(uid, `SELECT public.claim_booking_offer_v1('${offerId}') AS r`)?.[0]?.r ?? null;
const decline = (uid: string, offerId: string) =>
  callAs(uid, `SELECT public.decline_booking_offer_v1('${offerId}') AS r`)?.[0]?.r ?? null;
const count = (q: string) => sql<{ n: number }>(q)[0].n;

const U = {
  customer:  "20000000-0000-0000-0000-000000000001",
  provider1: "20000000-0000-0000-0000-000000000002",
  provider2: "20000000-0000-0000-0000-000000000003",
  provider3: "20000000-0000-0000-0000-000000000004",
};

function cleanup(): void {
  exec(`
    DELETE FROM public.notification_outbox WHERE related_booking_id IN (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.admin_audit_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.booking_slot_locks WHERE booking_id IN (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.provider_offers WHERE booking_id IN (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.bookings WHERE notes='${TAG}';
    DELETE FROM public.provider_profiles WHERE user_id IN ('${U.provider1}','${U.provider2}','${U.provider3}');
    DELETE FROM public.user_roles WHERE user_id IN ('${U.customer}','${U.provider1}','${U.provider2}','${U.provider3}');
    DELETE FROM auth.users WHERE id IN ('${U.customer}','${U.provider1}','${U.provider2}','${U.provider3}');
  `);
}

function seed(): void {
  for (const [key, id] of Object.entries(U)) {
    exec(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
          VALUES ('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
                  'pr2-${key}@test.mycleaner.dk', crypt('x', gen_salt('bf')), now(), now(), now())
          ON CONFLICT (id) DO NOTHING;`);
  }
  exec(`INSERT INTO public.user_roles (user_id, role) VALUES
        ('${U.customer}','customer'),('${U.provider1}','provider'),('${U.provider2}','provider'),('${U.provider3}','provider')
        ON CONFLICT DO NOTHING;`);
  exec(`
    ALTER TABLE public.provider_profiles DISABLE TRIGGER USER;
    INSERT INTO public.provider_profiles
      (user_id, provider_slug, display_name, base_country_code, status, hourly_rate,
       service_categories, approved_at, terms_accepted_at)
    VALUES
      ('${U.provider1}','pr2-prov1','PR2 Provider 1','DK','active',300, ARRAY['cleaning','after_party_cleaning'], now(), now()),
      ('${U.provider2}','pr2-prov2','PR2 Provider 2','DK','active',300, ARRAY['cleaning'], now(), now()),
      ('${U.provider3}','pr2-prov3','PR2 Provider 3','DK','draft', 300, ARRAY['cleaning'], NULL, NULL)
    ON CONFLICT (user_id) DO UPDATE SET status=EXCLUDED.status;
    ALTER TABLE public.provider_profiles ENABLE TRIGGER USER;
  `);
}

function makeBooking(
  providerId: string,
  opts: { date: string; slot: string; hours: number; service?: string; country?: string },
): { bookingId: string; offerId: string } {
  const service = opts.service ?? "cleaning";
  const country = opts.country ?? "DK";
  const rows = sql<{ booking_id: string; offer_id: string }>(`
    WITH b AS (
      INSERT INTO public.bookings
        (customer_user_id, provider_id, provider_name, service, hours, booking_date, slot,
         address, customer_pays, provider_gets, currency, status, timezone, country_code,
         assignment_mode, requested_provider_id, dispatch_status, notes)
      VALUES
        ('${U.customer}','${providerId}','PR2 Provider','${service}', ${opts.hours}, '${opts.date}','${opts.slot}',
         'Testvej 1, 1000 København', 30000, 25000, 'DKK','pending','Europe/Copenhagen','${country}',
         'direct_provider','${providerId}','awaiting_provider','${TAG}')
      RETURNING id
    ), o AS (
      INSERT INTO public.provider_offers (booking_id, provider_user_id, offer_status)
      SELECT id, '${providerId}', 'pending' FROM b RETURNING id, booking_id
    )
    SELECT booking_id::text, id::text AS offer_id FROM o`);
  return { bookingId: rows[0].booking_id, offerId: rows[0].offer_id };
}

/** Fire N claims on the same offer from N independent connections, started together. */
function parallelClaim(uid: string, offerId: string, n = 2): Promise<{ out: string; err: string }[]> {
  const script = `BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
SELECT pg_sleep(0.3);
SELECT public.claim_booking_offer_v1('${offerId}')::text;
COMMIT;`;
  const run = () => new Promise<{ out: string; err: string }>((resolve) => {
    const p = spawn("psql", [CONN, "-A", "-t", "-X", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => resolve({ out: out.trim(), err: err.trim() }));
    p.stdin.end(script);
  });
  return Promise.all(Array.from({ length: n }, run));
}

export async function run(): Promise<void> {
  cleanup();
  try {
    seed();

    // ── A. Happy path + D. replay ───────────────────────────────────────
    const a = makeBooking(U.provider1, { date: "2099-06-01", slot: "09:00", hours: 2 });
    const rA = claim(U.provider1, a.offerId);
    logAssertion(S, "A_happy_status", rA?.status === "assigned", JSON.stringify(rA));
    const b = sql<any>(`SELECT assigned_provider_id::text, provider_id, status::text, dispatch_status::text FROM public.bookings WHERE id='${a.bookingId}'`)[0];
    logAssertion(S, "A_assigned_provider", b.assigned_provider_id === U.provider1);
    logAssertion(S, "A_legacy_provider_id_sync", b.provider_id === U.provider1);
    logAssertion(S, "A_dispatch_assigned", b.dispatch_status === "assigned");
    logAssertion(S, "A_status_accepted", b.status === "accepted");
    logAssertion(S, "A_one_active_lock", count(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE booking_id='${a.bookingId}' AND status='active'`) === 1);
    logAssertion(S, "A_offer_accepted", sql<any>(`SELECT offer_status::text FROM public.provider_offers WHERE id='${a.offerId}'`)[0].offer_status === "accepted");
    const outboxA = count(`SELECT count(*)::int AS n FROM public.notification_outbox WHERE related_booking_id='${a.bookingId}'`);
    logAssertion(S, "A_outbox_records", outboxA === 2, `n=${outboxA}`);
    logAssertion(S, "A_audit_record", count(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE booking_id='${a.bookingId}' AND action='booking.offer_accepted'`) === 1);
    logAssertion(S, "A_rule_source", String(rA?.rule_source ?? "").startsWith("service_duration_rules:cleaning"), String(rA?.rule_source));
    logAssertion(S, "A_min_max_minutes", rA?.min_minutes === 90 && rA?.max_minutes === 600, `${rA?.min_minutes}/${rA?.max_minutes}`);

    const rD = claim(U.provider1, a.offerId);
    logAssertion(S, "D_replay_status", rD?.status === "assigned" && rD?.replay === true, JSON.stringify(rD));
    logAssertion(S, "D_still_one_lock", count(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE booking_id='${a.bookingId}' AND status='active'`) === 1);
    logAssertion(S, "D_no_dup_audit", count(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE booking_id='${a.bookingId}' AND action='booking.offer_accepted'`) === 1);
    logAssertion(S, "D_no_dup_outbox", count(`SELECT count(*)::int AS n FROM public.notification_outbox WHERE related_booking_id='${a.bookingId}'`) === outboxA);

    // ── B. Wrong provider ───────────────────────────────────────────────
    {
      const x = makeBooking(U.provider1, { date: "2099-06-02", slot: "09:00", hours: 2 });
      logAssertion(S, "B_wrong_provider_forbidden", claim(U.provider2, x.offerId)?.status === "forbidden");
    }

    // ── C. Customer role ────────────────────────────────────────────────
    {
      const x = makeBooking(U.provider1, { date: "2099-06-03", slot: "09:00", hours: 2 });
      logAssertion(S, "C_customer_claim_forbidden", ["forbidden", "not_found"].includes(claim(U.customer, x.offerId)?.status));
      logAssertion(S, "C_customer_decline_forbidden", ["forbidden", "not_found"].includes(decline(U.customer, x.offerId)?.status));
    }

    // ── F/G. Overlap + 30-minute buffer ─────────────────────────────────
    {
      const clash = makeBooking(U.provider1, { date: "2099-06-01", slot: "11:00", hours: 2 });
      logAssertion(S, "F_overlap_slot_conflict", claim(U.provider1, clash.offerId)?.status === "slot_conflict");
      const buf = makeBooking(U.provider1, { date: "2099-06-01", slot: "11:30", hours: 1.5 });
      logAssertion(S, "G_buffer_11_30_blocked", claim(U.provider1, buf.offerId)?.status === "slot_conflict");
      const ok = makeBooking(U.provider1, { date: "2099-06-01", slot: "12:00", hours: 1.5 });
      logAssertion(S, "G_buffer_12_00_allowed", claim(U.provider1, ok.offerId)?.status === "assigned");
    }

    // ── E. Competing offer in direct mode ───────────────────────────────
    {
      const x = makeBooking(U.provider1, { date: "2099-06-05", slot: "10:00", hours: 2 });
      const o2 = sql<{ id: string }>(`INSERT INTO public.provider_offers (booking_id, provider_user_id, offer_status)
        VALUES ('${x.bookingId}','${U.provider2}','pending') RETURNING id::text`)[0].id;
      logAssertion(S, "E_direct_mode_other_offer_forbidden", claim(U.provider2, o2)?.status === "forbidden");
      logAssertion(S, "E_winner_assigned", claim(U.provider1, x.offerId)?.status === "assigned");
      logAssertion(S, "E_late_already_assigned", ["already_assigned", "forbidden"].includes(claim(U.provider2, o2)?.status));
      logAssertion(S, "E_other_offer_closed", ["superseded", "expired", "declined"].includes(
        sql<any>(`SELECT offer_status::text FROM public.provider_offers WHERE id='${o2}'`)[0].offer_status));
    }

    // ── H. Decline ──────────────────────────────────────────────────────
    {
      const x = makeBooking(U.provider1, { date: "2099-06-06", slot: "09:00", hours: 2 });
      logAssertion(S, "H_decline_ok", decline(U.provider1, x.offerId)?.status === "declined");
      const row = sql<any>(`SELECT assigned_provider_id, dispatch_status::text FROM public.bookings WHERE id='${x.bookingId}'`)[0];
      logAssertion(S, "H_not_assigned", row.assigned_provider_id === null);
      logAssertion(S, "H_dispatch_unfulfilled", row.dispatch_status === "unfulfilled");
      logAssertion(S, "H_no_slot_lock", count(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE booking_id='${x.bookingId}'`) === 0);
      const again = decline(U.provider1, x.offerId);
      logAssertion(S, "H_decline_idempotent", again?.status === "declined" && again?.replay === true);
    }

    // ── I. Invalid intervals return structured status ───────────────────
    for (const [name, opts] of [
      ["I_bad_start_15",      { date: "2099-07-01", slot: "09:15", hours: 2 }],
      ["I_bad_duration_75",   { date: "2099-07-02", slot: "09:00", hours: 1.25 }],
      ["I_too_long_11h",      { date: "2099-07-03", slot: "09:00", hours: 11 }],
    ] as const) {
      const x = makeBooking(U.provider1, opts);
      const res = claim(U.provider1, x.offerId);
      logAssertion(S, name, res?.status === "invalid_interval", JSON.stringify(res));
    }

    // ── J. Ineligible provider ──────────────────────────────────────────
    {
      const x = makeBooking(U.provider3, { date: "2099-08-01", slot: "09:00", hours: 2 });
      logAssertion(S, "J_ineligible_rejected", claim(U.provider3, x.offerId)?.status === "provider_ineligible");
    }

    // ── K. Service-specific minimum duration ────────────────────────────
    {
      const ap90 = makeBooking(U.provider1, { date: "2099-09-01", slot: "09:00", hours: 1.5, service: "after_party_cleaning" });
      const k1 = claim(U.provider1, ap90.offerId);
      logAssertion(S, "K_afterparty_90_rejected", k1?.status === "invalid_interval" && k1?.min_minutes === 120, JSON.stringify(k1));
      const ap120 = makeBooking(U.provider1, { date: "2099-09-02", slot: "09:00", hours: 2, service: "after_party_cleaning" });
      const k2 = claim(U.provider1, ap120.offerId);
      logAssertion(S, "K_afterparty_120_allowed", k2?.status === "assigned" && k2?.min_minutes === 120, JSON.stringify(k2));
      const std60 = makeBooking(U.provider1, { date: "2099-09-03", slot: "09:00", hours: 1 });
      const k3 = claim(U.provider1, std60.offerId);
      logAssertion(S, "K_standard_60_rejected", k3?.status === "invalid_interval" && k3?.min_minutes === 90, JSON.stringify(k3));
      const std90 = makeBooking(U.provider1, { date: "2099-09-04", slot: "09:00", hours: 1.5 });
      logAssertion(S, "K_standard_90_allowed", claim(U.provider1, std90.offerId)?.status === "assigned");
    }

    // ── L. Eligibility gates, negatively tested ─────────────────────────
    const gates: [string, string, string][] = [
      ["L_status_paused",       `UPDATE public.provider_profiles SET status='paused' WHERE user_id='${U.provider2}'`, "status_not_active"],
      ["L_suspended",           `UPDATE public.provider_profiles SET status='active', suspended_at=now() WHERE user_id='${U.provider2}'`, "suspended_or_blocked"],
      ["L_not_approved",        `UPDATE public.provider_profiles SET suspended_at=NULL, approved_at=NULL WHERE user_id='${U.provider2}'`, "not_approved"],
      ["L_terms_missing",       `UPDATE public.provider_profiles SET approved_at=now(), terms_accepted_at=NULL WHERE user_id='${U.provider2}'`, "terms_not_accepted"],
      ["L_service_not_offered", `UPDATE public.provider_profiles SET terms_accepted_at=now(), service_categories=ARRAY['garden'] WHERE user_id='${U.provider2}'`, "service_not_offered"],
      ["L_country_not_served",  `UPDATE public.provider_profiles SET service_categories=ARRAY['cleaning'], base_country_code='SE' WHERE user_id='${U.provider2}'`, "country_not_served"],
      ["L_identity_rejected",   `UPDATE public.provider_profiles SET base_country_code='DK', identity_status='rejected' WHERE user_id='${U.provider2}'`, "identity_not_verified"],
    ];
    let day = 10;
    for (const [name, mutation, reason] of gates) {
      exec(`ALTER TABLE public.provider_profiles DISABLE TRIGGER USER; ${mutation}; ALTER TABLE public.provider_profiles ENABLE TRIGGER USER;`);
      const x = makeBooking(U.provider2, { date: `2099-10-${String(day++).padStart(2, "0")}`, slot: "09:00", hours: 2 });
      const res = claim(U.provider2, x.offerId);
      logAssertion(S, name, res?.status === "provider_ineligible" && res?.reason === reason, JSON.stringify(res));
    }
    exec(`ALTER TABLE public.provider_profiles DISABLE TRIGGER USER;
          UPDATE public.provider_profiles SET identity_status=NULL WHERE user_id='${U.provider2}';
          ALTER TABLE public.provider_profiles ENABLE TRIGGER USER;`);
    {
      const x = makeBooking(U.provider2, { date: "2099-10-30", slot: "09:00", hours: 2 });
      logAssertion(S, "L_all_gates_pass_when_eligible", claim(U.provider2, x.offerId)?.status === "assigned");
    }

    // ── M. TRUE PARALLEL CONCURRENCY ────────────────────────────────────
    {
      const x = makeBooking(U.provider1, { date: "2099-11-01", slot: "09:00", hours: 2 });
      const out = await parallelClaim(U.provider1, x.offerId, 2);
      const payloads = out.map((o) => {
        const line = o.out.split("\n").map((s) => s.trim()).filter((s) => s.startsWith("{")).pop();
        try { return line ? JSON.parse(line) : { raw: o.out, err: o.err }; } catch { return { raw: o.out, err: o.err }; }
      });
      const fresh = payloads.filter((p: any) => p.status === "assigned" && p.replay === false);
      const replays = payloads.filter((p: any) => (p.status === "assigned" && p.replay === true) || p.status === "already_assigned");
      logAssertion(S, "M_both_calls_returned", payloads.length === 2, JSON.stringify(payloads));
      logAssertion(S, "M_exactly_one_fresh_assignment", fresh.length === 1, JSON.stringify(payloads));
      logAssertion(S, "M_competitor_idempotent_replay", replays.length === 1, JSON.stringify(payloads));
      logAssertion(S, "M_one_active_lock", count(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE booking_id='${x.bookingId}' AND status='active'`) === 1);
      logAssertion(S, "M_one_audit_event", count(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE booking_id='${x.bookingId}' AND action='booking.offer_accepted'`) === 1);
      logAssertion(S, "M_two_outbox_no_dupes", count(`SELECT count(*)::int AS n FROM public.notification_outbox WHERE related_booking_id='${x.bookingId}'`) === 2);
      const leaked = out.some((o) => /23P01|exclusion constraint|SQL state|conflicting key/i.test(`${o.out} ${o.err}`));
      logAssertion(S, "M_no_raw_sql_details_leaked", !leaked, out.map((o) => o.err).join(" | ").slice(0, 200));
    }
  } finally {
    cleanup();
    const leftovers = {
      bookings: count(`SELECT count(*)::int AS n FROM public.bookings WHERE notes='${TAG}'`),
      locks: count(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE provider_user_id IN ('${U.provider1}','${U.provider2}','${U.provider3}')`),
      offers: count(`SELECT count(*)::int AS n FROM public.provider_offers WHERE provider_user_id IN ('${U.provider1}','${U.provider2}','${U.provider3}')`),
      profiles: count(`SELECT count(*)::int AS n FROM public.provider_profiles WHERE user_id IN ('${U.provider1}','${U.provider2}','${U.provider3}')`),
      users: count(`SELECT count(*)::int AS n FROM auth.users WHERE id IN ('${U.customer}','${U.provider1}','${U.provider2}','${U.provider3}')`),
    };
    logAssertion(S, "Z_fixtures_removed", Object.values(leftovers).every((v) => v === 0), JSON.stringify(leftovers));
  }
}

// Allow direct execution: `tsx scenarios/20-offer-claim-decline.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(() => {
    // reporter writes evidence; exit code handled by the harness runner
  }).catch((e) => { console.error(e); process.exit(1); });
}
