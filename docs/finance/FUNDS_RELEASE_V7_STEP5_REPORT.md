# Funds Release v7 — Step 5 Report

**Scope:** Authoritative eligibility decision engine. **No** transfers, **no** payouts,
**no** Stripe API calls, **no** cron. `funds_release.enabled` remains **OFF**.

---

## 1. Files & Objects Changed

### Migration (single consolidated file)
`supabase/migrations/…_funds_release_v7_step5_eligibility_engine.sql`

### New database types
- `public.booking_hold_type` — `complaint | dispute | refund | cancellation | manual | admin_block`
- `public.booking_hold_status` — `active | released | expired`

### New tables
| Table | Purpose | Writes |
|---|---|---|
| `public.booking_holds` | Hold lifecycle (create / release, actor, reason, expiry) | Only via `create_booking_hold_v1` / `release_booking_hold_v1` |
| `public.release_eligibility_decisions` | Append-only audit of every eligibility evaluation | Only via `evaluate_booking_release_eligibility_v1` |

Both tables:
- RLS ENABLED
- Read: admin, support, and the booking's own customer / provider
- Write via API: **`USING (false) WITH CHECK (false)`** — categorically denied
- `release_eligibility_decisions` UPDATE blocked by `trg_red_no_update` trigger (append-only)
- Booking-cascade DELETE permitted for lifecycle cleanup

### New SECURITY DEFINER functions (all revoked from `PUBLIC`, `anon`, `authenticated`; granted only to `service_role`)
| Function | Returns | Purpose |
|---|---|---|
| `check_provider_payout_readiness_v1(uuid)` | `jsonb` | Provider payout readiness with deterministic failure codes |
| `evaluate_booking_release_eligibility_v1(uuid, uuid, text)` | `jsonb` | Authoritative eligibility decision; writes audit row |
| `create_booking_hold_v1(uuid, booking_hold_type, text, uuid, text, timestamptz, jsonb)` | `uuid` | Admin creates a hold, writes `admin_audit_log` entry |
| `release_booking_hold_v1(uuid, uuid, text, text)` | `void` | Admin releases a hold, writes `admin_audit_log` entry |

### New triggers
- `trg_red_no_update` on `release_eligibility_decisions` — enforces append-only for UPDATE.

---

## 2. Eligibility Decision Table

| Decision | Meaning | Trigger |
|---|---|---|
| `eligible` | All rules passed | `failed_rules == []` |
| `not_eligible` | Recoverable / time-based reasons | Only `pending`-severity reasons present |
| `blocked` | Terminal / manual block | Any of: `ADMIN_BLOCKED`, `ALREADY_TRANSFERRED`, `TRANSFER_ATTEMPT_SUCCEEDED`, `PAYOUT_STATUS_TERMINAL`, `FULLY_REFUNDED`, `BOOKING_CANCELLED`, `PAYMENT_FLOW_INCOMPATIBLE`, any hold, provider readiness fatal |

---

## 3. Rule Matrix (machine-readable codes)

**Booking-level (blocking):**
`BOOKING_CANCELLED`, `ALREADY_TRANSFERRED`, `TRANSFER_ATTEMPT_SUCCEEDED`,
`PAYOUT_STATUS_TERMINAL`, `PAYMENT_FLOW_INCOMPATIBLE`, `FULLY_REFUNDED`,
`ACTIVE_DISPUTE`.

**Booking-level (pending / time-based):**
`BOOKING_NOT_COMPLETED`, `HOLD_NOT_ELAPSED` (with `remaining_seconds`),
`FUNDS_RELEASE_AT_MISSING`, `PAYMENT_NOT_CAPTURED`,
`PARTIAL_REFUND_RECORDED`, `PENDING_REFUND_REQUEST`.

**Hold-level (blocking):**
`ADMIN_BLOCKED`, `COMPLAINT_HOLD_ACTIVE`, `DISPUTE_HOLD_ACTIVE`,
`REFUND_HOLD_ACTIVE`, `CANCELLATION_HOLD_ACTIVE`, `MANUAL_HOLD_ACTIVE`.

**Provider readiness (blocking / fatal):**
`PROVIDER_PROFILE_MISSING`, `PROVIDER_ID_UNRESOLVED`, `PROVIDER_SUSPENDED`,
`PROVIDER_INACTIVE`, `PROVIDER_PAYOUT_FROZEN`, `PROVIDER_NOT_STRIPE_CONNECTED`,
`PROVIDER_CHARGES_DISABLED`, `PROVIDER_PAYOUTS_DISABLED`,
`PROVIDER_KYC_INCOMPLETE`, `PROVIDER_STRIPE_DISABLED`,
`PROVIDER_REQUIREMENTS_DUE`.

Every reason is a JSON object: `{ code, severity, meta? }`.

---

## 4. Release Scheduling

`funds_release_at` on `bookings` is the authoritative release timestamp
(populated at booking capture time by Step 3). The engine returns:

- `scheduled_release_at` — the timestamp value.
- `remaining_hold_seconds` — `0` if elapsed, positive integer if not.
- `active_holds[]` — snapshot of blocking holds with their own `expires_at`.

Extended holds are represented as additional rows in `booking_holds`;
permanently blocked bookings carry an `admin_block` hold or a terminal-blocking
reason code. **No worker executes anything in Step 5.**

---

## 5. Audit Tables Used

| Table | Written by |
|---|---|
| `release_eligibility_decisions` | Every call to `evaluate_booking_release_eligibility_v1` |
| `admin_audit_log` | Every `create_booking_hold_v1` and `release_booking_hold_v1` call |
| `booking_holds` | Hold lifecycle (create/release), fully auditable via row itself |

---

## 6. Tests Executed (in-migration)

**Privilege matrix — passed:**
- `funds_release.enabled == false` ✅
- `evaluate_booking_release_eligibility_v1` — no `authenticated`, no `anon`, only `service_role` ✅
- `check_provider_payout_readiness_v1` — locked ✅
- `create_booking_hold_v1` / `release_booking_hold_v1` — locked ✅

**Functional matrix — 5 scenarios passed:**
1. Booking completed + past hold but no provider profile → `not_eligible` / `blocked` ✅
2. `admin_block` hold present → `blocked` ✅
3. Hold released → still `not_eligible` (missing profile) ✅
4. Booking with `destination_charge_v1` (incompatible flow) → `blocked` ✅
5. Booking set to `pending` + future `funds_release_at` → `not_eligible` with
   `BOOKING_NOT_COMPLETED` and `HOLD_NOT_ELAPSED` reasons present ✅

Booking-cascade cleanup removes synthetic holds and decisions;
`admin_audit_log` rows are intentionally retained (append-only).

---

## 7. Verification (per Step 5 gates)

| Gate | Status |
|---|---|
| No Stripe transfers executed | ✅ (no code path exists) |
| No payout execution | ✅ |
| No cron execution | ✅ |
| No automatic release | ✅ |
| `funds_release.enabled = false` | ✅ (self-test asserted) |
| No production deployment | ✅ (migration only, not enabled) |
| Eligibility engine cannot move funds | ✅ (engine returns JSON; does not touch ledger, payouts, or Stripe) |

---

## 8. Remaining Risks

- **Provider UUID vs. text.** `bookings.provider_id` is `TEXT`; the engine
  best-effort casts to UUID and returns `PROVIDER_ID_UNRESOLVED` otherwise.
  A future migration should tighten this at write time.
- **`ready` field in provider-readiness snapshot** is preserved but the engine
  currently trusts flags on `provider_profiles`. Reconciliation with Stripe
  is the Step 6 job (checker), not Step 5.
- **Idempotency of evaluation.** Multiple calls emit multiple audit rows by
  design (audit trail of every decision). Consumers should read the latest
  row for the current state.

---

## 9. Explicit Confirmations

- ❌ **No production deployment.**
- ❌ **No transfers created.**
- ❌ **No payouts created.**
- ❌ **No funds released.**
- ❌ **No Stripe Transfer API calls.**
- ✅ **Feature flag `funds_release.enabled` still OFF.**

Step 5 complete. Standing by for **explicit approval before Step 6**.
