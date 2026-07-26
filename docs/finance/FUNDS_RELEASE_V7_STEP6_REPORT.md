# Funds Release v7 — Step 6 Report

**Scope:** Dry-run workers & orchestrator that plan payouts without executing
them. **No** Stripe API calls, **no** transfers, **no** ledger mutation, **no**
funds movement. `funds_release.enabled` remains **OFF**.

---

## 1. Files & Objects Changed

### Migration
`supabase/migrations/…_funds_release_v7_step6_dry_run_workers.sql`

### New SECURITY DEFINER functions (all `service_role`-only)
| Function | Purpose | Idempotency |
|---|---|---|
| `plan_pending_releases_v1(_limit int, _force_dry_run bool)` | Scans bookings with elapsed `funds_release_at`, evaluates eligibility, inserts `dry_run_planned` rows in `payout_transfer_attempts` | `stripe_idempotency_key = 'dryrun:v1:<booking>:release_v1'` with `ON CONFLICT DO NOTHING` |
| `reconcile_provider_payout_readiness_v1(_limit int)` | Iterates providers, invokes `check_provider_payout_readiness_v1`, returns summary | Read-only; safe to re-run |
| `funds_release_worker_tick_v1(_limit int)` | Orchestrator wrapped in `pg_try_advisory_xact_lock`; opens/closes a `job_runs` row with full plan+reconcile metadata | Advisory lock guarantees serial execution; overlapping ticks return `{skipped: true, reason: "lock_busy"}` |

### Safety guards
- Every function checks `current_setting('role')` for `service_role`.
- `plan_pending_releases_v1` refuses any non-dry-run request even if the flag flips.
- `_force_dry_run` is coerced to `true` while `funds_release.enabled = false`.
- Insert path uses `state = 'dry_run_planned'` — never `submitted` / `succeeded`.
- No Stripe SDK, no `net.http_post`, no cron: this migration is Postgres-only.

### Feature flag
`funds_release.enabled` verified at migration start; migration aborts if `true`.

---

## 2. Idempotency Matrix

| Trigger | Behaviour |
|---|---|
| Same booking re-scanned in later tick | `ON CONFLICT DO NOTHING` on `stripe_idempotency_key` — no duplicate row |
| Two ticks running concurrently | Second tick returns `{skipped: true, reason: "lock_busy"}` — no work performed |
| Booking already has a `payout_transfer_attempts` row (any state) | Excluded by `NOT EXISTS` filter in `plan_pending_releases_v1` |
| Provider profile refreshed twice | Reconciler is pure read; produces same counts |

---

## 3. In-Migration Self-Tests

**Privilege matrix — passed:**
- `funds_release.enabled` NOT `true` ✅
- No `anon`, `authenticated`, or `PUBLIC` grants on any Step 6 function ✅
- Only `service_role` can execute ✅

**Functional matrix — passed:**
1. `funds_release_worker_tick_v1(10)` first call: returns `dry_run=true`, opens+closes a `job_runs` row ✅
2. Second call: still `dry_run=true`, idempotent (no new attempt rows) ✅

---

## 4. Staging Validation Harness

New scenario: `staging-validation/scenarios/17-funds-release-step6.ts`
Runner: `npm --prefix staging-validation run v7:step6`

Coverage:
- Flag OFF assertion
- Anon calls rejected for all three RPCs
- Two sequential service-role ticks — second one plans zero new attempts
- `ledger_entries` count unchanged (no ledger writes)
- No non-dry-run `payout_transfer_attempts` rows created
- `job_runs` row emitted, latest is `completed`
- Two concurrent ticks — at least one skipped, none error
- No `provider_bank_payouts` rows created in the last 5 minutes

---

## 5. Explicit Confirmations

- ❌ **No production deployment.**
- ❌ **No cron / scheduler registered** (workers are RPC-only; invocation is a Step 7 decision).
- ❌ **No Stripe Transfer, Payout, or Balance API calls.**
- ❌ **No `ledger_entries` writes.**
- ❌ **No `provider_bank_payouts` writes.**
- ❌ **No funds released.**
- ✅ **Feature flag `funds_release.enabled` remains OFF.**
- ✅ **All new functions REVOKEd from PUBLIC / anon / authenticated.**
- ✅ **Idempotent by design (unique idempotency key + advisory lock).**
- ✅ **Staging validation script committed and wired to `npm run v7:step6`.**

Step 6 complete. Standing by for **explicit approval before Step 7** (scheduler wiring and the first controlled real-transfer rehearsal).
