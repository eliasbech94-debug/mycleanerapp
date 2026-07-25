/**
 * Scenario 20 — PR-2 Atomic offer claim + decline (direct-provider mode)
 *
 * Covers requirements A–J of PR-2:
 *   A. Happy path claim
 *   B. Wrong provider forbidden
 *   C. Customer role cannot successfully claim/decline
 *   D. Winner double-retry is idempotent
 *   E. Concurrent claim: exactly one assignment
 *   F. Time-overlap blocked → slot_conflict
 *   G. 30-minute buffer semantics (11:30 blocked, 12:00 allowed)
 *   H. Decline path + idempotency
 *   I. Invalid interval rejections
 *   J. Legacy provider_id remains synchronized
 *
 * All authenticated calls are simulated via psql with LOCAL role authenticated
 * and request.jwt.claims set to the target user_id. Service-role behaviour is
 * exercised separately.
 */
import { execSync } from "node:child_process";
import { env } from "../config.js";
import { logAssertion } from "../lib/reporter.js";

const CONN = env.STAGING_PG_CONN;

/** Run SQL as service_role (bypasses RLS + auth), return rows. */
function sql<T = any>(query: string): T[] {
  const out = execSync(
    `psql "${CONN}" -A -t -X -c "select coalesce(json_agg(t), '[]'::json) from (${query.replace(/"/g, '\\"')}) t;"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  return JSON.parse(out || "[]") as T[];
}

/** Run SQL impersonating an authenticated user via JWT claims. */
function callAs(userId: string, query: string): any {
  const wrapped = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';
    SELECT json_agg(t) AS r FROM (${query}) t;
    COMMIT;
  `;
  const out = execSync(
    `psql "${CONN}" -A -t -X <<'EOSQL'\n${wrapped}\nEOSQL\n`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: "/bin/bash" },
  ).trim();
  // Last non-empty line is the aggregated JSON
  const lines = out.split("\n").filter(Boolean);
  const last = lines[lines.length - 1] ?? "null";
  try { return JSON.parse(last); } catch { return null; }
}

function exec(query: string): void {
  execSync(`psql "${CONN}" -X -c "${query.replace(/"/g, '\\"')}"`, { stdio: "ignore" });
}

const S = "scenario-20";
const TAG = "pr2-test";

// Deterministic UUIDs for this scenario
const U = {
  customer:  "20000000-0000-0000-0000-000000000001",
  provider1: "20000000-0000-0000-0000-000000000002",
  provider2: "20000000-0000-0000-0000-000000000003",
  provider3: "20000000-0000-0000-0000-000000000004", // ineligible
};

function cleanup(): void {
  exec(`
    DELETE FROM public.notification_outbox WHERE payload->>'tag'='${TAG}' OR related_booking_id IN
      (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.admin_audit_log WHERE metadata->>'tag'='${TAG}' OR booking_id IN
      (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.booking_slot_locks WHERE booking_id IN
      (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.provider_offers WHERE booking_id IN
      (SELECT id FROM public.bookings WHERE notes='${TAG}');
    DELETE FROM public.bookings WHERE notes='${TAG}';
    DELETE FROM public.provider_profiles WHERE user_id IN
      ('${U.provider1}','${U.provider2}','${U.provider3}');
    DELETE FROM public.user_roles WHERE user_id IN
      ('${U.customer}','${U.provider1}','${U.provider2}','${U.provider3}');
    DELETE FROM auth.users WHERE id IN
      ('${U.customer}','${U.provider1}','${U.provider2}','${U.provider3}');
  `);
}

function seed(): void {
  // Users
  for (const [key, id] of Object.entries(U)) {
    exec(`
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      VALUES ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'pr2-${key}@test.mycleaner.dk', crypt('x', gen_salt('bf')), now(), now(), now())
      ON CONFLICT (id) DO NOTHING;
    `);
  }
  exec(`
    INSERT INTO public.user_roles (user_id, role) VALUES
      ('${U.customer}', 'customer'),
      ('${U.provider1}', 'provider'),
      ('${U.provider2}', 'provider'),
      ('${U.provider3}', 'provider')
    ON CONFLICT DO NOTHING;
  `);
  // Providers 1 & 2 active, 3 draft (ineligible)
  exec(`
    ALTER TABLE public.provider_profiles DISABLE TRIGGER trg_provider_profiles_enforce_base_address;
    ALTER TABLE public.provider_profiles DISABLE TRIGGER trg_provider_profiles_min_age;
    ALTER TABLE public.provider_profiles DISABLE TRIGGER trg_provider_profiles_block_privileged;
    INSERT INTO public.provider_profiles (user_id, provider_slug, display_name, base_country_code, status, hourly_rate)
    VALUES
      ('${U.provider1}', 'pr2-prov1', 'PR2 Provider 1', 'DK', 'active', 300),
      ('${U.provider2}', 'pr2-prov2', 'PR2 Provider 2', 'DK', 'active', 300),
      ('${U.provider3}', 'pr2-prov3', 'PR2 Provider 3', 'DK', 'draft',  300)
    ON CONFLICT (user_id) DO UPDATE SET status=EXCLUDED.status;
    ALTER TABLE public.provider_profiles ENABLE TRIGGER trg_provider_profiles_block_privileged;
    ALTER TABLE public.provider_profiles ENABLE TRIGGER trg_provider_profiles_min_age;
    ALTER TABLE public.provider_profiles ENABLE TRIGGER trg_provider_profiles_enforce_base_address;
  `);
}

/** Create a direct-provider booking targeting `providerId` with an offer. */
function makeBooking(providerId: string, opts: { date: string; slot: string; hours: number }): { bookingId: string; offerId: string } {
  const rows = sql<{ booking_id: string; offer_id: string }>(`
    WITH b AS (
      INSERT INTO public.bookings
        (customer_user_id, provider_id, provider_name, service, hours, booking_date, slot,
         address, customer_pays, provider_gets, currency, status, timezone, country_code,
         assignment_mode, requested_provider_id, dispatch_status, notes)
      VALUES
        ('${U.customer}', '${providerId}', 'PR2 Provider', 'cleaning',
         ${opts.hours}, '${opts.date}', '${opts.slot}',
         'Testvej 1, 1000 København', 30000, 25000, 'DKK', 'pending',
         'Europe/Copenhagen', 'DK', 'direct_provider', '${providerId}', 'awaiting_provider', '${TAG}')
      RETURNING id
    ), o AS (
      INSERT INTO public.provider_offers (booking_id, provider_user_id, offer_status)
      SELECT id, '${providerId}', 'pending' FROM b
      RETURNING id, booking_id
    )
    SELECT booking_id::text, id::text AS offer_id FROM o
  `);
  return { bookingId: rows[0].booking_id, offerId: rows[0].offer_id };
}

export async function run(): Promise<void> {
  cleanup();
  try {
    seed();

    // ── A. Happy path ────────────────────────────────────────────────────
    {
      const { bookingId, offerId } = makeBooking(U.provider1, { date: "2099-06-01", slot: "09:00", hours: 2 });
      const res = callAs(U.provider1, `SELECT public.claim_booking_offer_v1('${offerId}') AS r`);
      const r = res?.[0]?.r;
      logAssertion(S, "A_happy_status", r?.status === "assigned", JSON.stringify(r));
      const b = sql(`SELECT assigned_provider_id::text, provider_id, status::text, dispatch_status::text FROM public.bookings WHERE id='${bookingId}'`)[0];
      logAssertion(S, "A_assigned_provider", b.assigned_provider_id === U.provider1);
      logAssertion(S, "A_legacy_provider_id_sync", b.provider_id === U.provider1, `legacy=${b.provider_id}`);
      logAssertion(S, "A_dispatch_assigned", b.dispatch_status === "assigned");
      logAssertion(S, "A_status_accepted", b.status === "accepted");
      const locks = sql(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE booking_id='${bookingId}' AND status='active'`)[0];
      logAssertion(S, "A_one_active_lock", locks.n === 1, `n=${locks.n}`);
      const offer = sql(`SELECT offer_status::text FROM public.provider_offers WHERE id='${offerId}'`)[0];
      logAssertion(S, "A_offer_accepted", offer.offer_status === "accepted");
      const outbox = sql(`SELECT count(*)::int AS n FROM public.notification_outbox WHERE related_booking_id='${bookingId}'`)[0];
      logAssertion(S, "A_outbox_records", outbox.n >= 2, `n=${outbox.n}`);
      const audit = sql(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE booking_id='${bookingId}' AND action='booking.offer_accepted'`)[0];
      logAssertion(S, "A_audit_record", audit.n === 1);

      // D. Double retry by winner
      const res2 = callAs(U.provider1, `SELECT public.claim_booking_offer_v1('${offerId}') AS r`);
      const r2 = res2?.[0]?.r;
      logAssertion(S, "D_replay_status", r2?.status === "assigned" && r2?.replay === true, JSON.stringify(r2));
      const locks2 = sql(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE booking_id='${bookingId}' AND status='active'`)[0];
      logAssertion(S, "D_still_one_lock", locks2.n === 1);
      const audit2 = sql(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE booking_id='${bookingId}' AND action='booking.offer_accepted'`)[0];
      logAssertion(S, "D_no_dup_audit", audit2.n === 1);
      const outbox2 = sql(`SELECT count(*)::int AS n FROM public.notification_outbox WHERE related_booking_id='${bookingId}'`)[0];
      logAssertion(S, "D_no_dup_outbox", outbox2.n === outbox.n);
    }

    // ── B. Wrong provider ────────────────────────────────────────────────
    {
      const { offerId } = makeBooking(U.provider1, { date: "2099-06-02", slot: "09:00", hours: 2 });
      const res = callAs(U.provider2, `SELECT public.claim_booking_offer_v1('${offerId}') AS r`);
      logAssertion(S, "B_wrong_provider_forbidden", res?.[0]?.r?.status === "forbidden", JSON.stringify(res?.[0]?.r));
    }

    // ── C. Customer cannot claim/decline ─────────────────────────────────
    {
      const { offerId } = makeBooking(U.provider1, { date: "2099-06-03", slot: "09:00", hours: 2 });
      const rc = callAs(U.customer, `SELECT public.claim_booking_offer_v1('${offerId}') AS r`);
      logAssertion(S, "C_customer_claim_forbidden", ["forbidden","not_found"].includes(rc?.[0]?.r?.status), JSON.stringify(rc?.[0]?.r));
      const rd = callAs(U.customer, `SELECT public.decline_booking_offer_v1('${offerId}') AS r`);
      logAssertion(S, "C_customer_decline_forbidden", ["forbidden","not_found"].includes(rd?.[0]?.r?.status), JSON.stringify(rd?.[0]?.r));
    }

    // ── F/G. Time overlap + buffer ───────────────────────────────────────
    {
      // Provider1 already has 09:00–11:00 assigned lock from test A on 2099-06-01
      // Buffer means anything starting < 11:30 on same provider is blocked.
      const clash = makeBooking(U.provider1, { date: "2099-06-01", slot: "11:00", hours: 2 });
      const rClash = callAs(U.provider1, `SELECT public.claim_booking_offer_v1('${clash.offerId}') AS r`);
      logAssertion(S, "F_overlap_slot_conflict", rClash?.[0]?.r?.status === "slot_conflict", JSON.stringify(rClash?.[0]?.r));

      const buffer = makeBooking(U.provider1, { date: "2099-06-01", slot: "11:30", hours: 1 });
      const rBuf = callAs(U.provider1, `SELECT public.claim_booking_offer_v1('${buffer.offerId}') AS r`);
      logAssertion(S, "G_buffer_11_30_blocked", rBuf?.[0]?.r?.status === "slot_conflict", JSON.stringify(rBuf?.[0]?.r));

      const ok = makeBooking(U.provider1, { date: "2099-06-01", slot: "12:00", hours: 1 });
      const rOk = callAs(U.provider1, `SELECT public.claim_booking_offer_v1('${ok.offerId}') AS r`);
      logAssertion(S, "G_buffer_12_00_allowed", rOk?.[0]?.r?.status === "assigned", JSON.stringify(rOk?.[0]?.r));
    }

    // ── E. Concurrent claim (two offers to same booking must yield one assignment) ──
    {
      // Force multi-offer scenario: manually add a second offer to same booking targeting provider2.
      // We keep assignment_mode=direct_provider (requested=provider1). Provider2's offer should
      // still be closed as superseded when provider1 claims. If provider2 tries first, they must
      // be rejected with 'forbidden' since booking.requested_provider_id != provider2.
      const { bookingId, offerId: o1 } = makeBooking(U.provider1, { date: "2099-06-05", slot: "10:00", hours: 2 });
      const o2 = sql<{ id: string }>(`
        INSERT INTO public.provider_offers (booking_id, provider_user_id, offer_status)
        VALUES ('${bookingId}', '${U.provider2}', 'pending')
        RETURNING id::text
      `)[0].id;

      const rWrong = callAs(U.provider2, `SELECT public.claim_booking_offer_v1('${o2}') AS r`);
      logAssertion(S, "E_direct_mode_other_offer_forbidden", rWrong?.[0]?.r?.status === "forbidden", JSON.stringify(rWrong?.[0]?.r));

      const rWin = callAs(U.provider1, `SELECT public.claim_booking_offer_v1('${o1}') AS r`);
      logAssertion(S, "E_winner_assigned", rWin?.[0]?.r?.status === "assigned");

      // After assignment, provider2 retry must be 'already_assigned'
      const rLate = callAs(U.provider2, `SELECT public.claim_booking_offer_v1('${o2}') AS r`);
      logAssertion(S, "E_late_already_assigned", ["already_assigned","forbidden"].includes(rLate?.[0]?.r?.status), JSON.stringify(rLate?.[0]?.r));

      const o2Row = sql(`SELECT offer_status::text FROM public.provider_offers WHERE id='${o2}'`)[0];
      logAssertion(S, "E_other_offer_closed", ["superseded","expired","declined"].includes(o2Row.offer_status), `status=${o2Row.offer_status}`);
    }

    // ── H. Decline ───────────────────────────────────────────────────────
    {
      const { bookingId, offerId } = makeBooking(U.provider1, { date: "2099-06-06", slot: "09:00", hours: 2 });
      const r = callAs(U.provider1, `SELECT public.decline_booking_offer_v1('${offerId}') AS r`);
      logAssertion(S, "H_decline_ok", r?.[0]?.r?.status === "declined", JSON.stringify(r?.[0]?.r));
      const b = sql(`SELECT assigned_provider_id, dispatch_status::text FROM public.bookings WHERE id='${bookingId}'`)[0];
      logAssertion(S, "H_not_assigned", b.assigned_provider_id === null);
      logAssertion(S, "H_dispatch_unfulfilled", b.dispatch_status === "unfulfilled", `got ${b.dispatch_status}`);
      const locks = sql(`SELECT count(*)::int AS n FROM public.booking_slot_locks WHERE booking_id='${bookingId}'`)[0];
      logAssertion(S, "H_no_slot_lock", locks.n === 0);
      const r2 = callAs(U.provider1, `SELECT public.decline_booking_offer_v1('${offerId}') AS r`);
      logAssertion(S, "H_decline_idempotent", r2?.[0]?.r?.status === "declined" && r2?.[0]?.r?.replay === true);
    }

    // ── I. Invalid interval ──────────────────────────────────────────────
    for (const [name, opts] of [
      ["I_bad_start_15",   { date: "2099-07-01", slot: "09:15", hours: 2 }],
      ["I_bad_duration",   { date: "2099-07-02", slot: "09:00", hours: 1.25 }],
      ["I_too_long",       { date: "2099-07-03", slot: "09:00", hours: 11 }],
    ] as const) {
      const { offerId } = makeBooking(U.provider1, opts);
      let threw = false;
      try {
        callAs(U.provider1, `SELECT public.claim_booking_offer_v1('${offerId}') AS r`);
      } catch { threw = true; }
      logAssertion(S, name, threw, "expected validate_booking_interval to raise");
    }

    // ── J. Ineligible provider ───────────────────────────────────────────
    {
      const { offerId } = makeBooking(U.provider3, { date: "2099-08-01", slot: "09:00", hours: 2 });
      const r = callAs(U.provider3, `SELECT public.claim_booking_offer_v1('${offerId}') AS r`);
      logAssertion(S, "J_ineligible_rejected", r?.[0]?.r?.status === "provider_ineligible", JSON.stringify(r?.[0]?.r));
    }
  } finally {
    cleanup();
  }
}
