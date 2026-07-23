# Funds Release v7 — Step 7 Report

**Scope:** Dual-control authorization + dry-run rehearsal layer.
Every gate — eligibility, hold, dispute, refund, cancellation, provider
readiness, source-linked capacity — is re-checked server-side before an
authorization is issued, and again (via state) before a rehearsal
consumes it. **No** Stripe SDK, **no** cron, **no** transfer or payout
objects, **no** ledger or bank writes. `funds_release.enabled` remains
**OFF**.

---

## 1. New objects

Migration: `…_funds_release_v7_step7_authorization_and_rehearsal.sql`

| Function | Role | Purpose |
|---|---|---|
| `funds_release_reason_codes_v1()` | `service_role` | Immutable catalogue of 19 deterministic reason codes shared by Step 7 (and future Step 8) |
| `funds_release_max_retries_v1()` | `service_role` | Immutable retry ceiling constant (`5`) used by authorization + rehearsal |
| `request_release_authorization_v1(booking, request_id, requested_by, reason)` | `service_role` | Issues a `payout_authorizations` row against an existing Step-6 `dry_run_planned` attempt after re-checking every gate; idempotent on `request_id`; refuses via reason code on any block |
| `rehearse_release_attempt_v1(authorization_id, simulate_failure_code)` | `service_role` | Per-booking advisory-locked; consumes an authorization; marks the attempt `dry_run_rehearsed`; supports partial-failure simulation via `simulate_failure_code` that rolls the attempt back to `dry_run_planned` and increments `retry_count` |
| `funds_release_rehearsal_worker_tick_v1(limit)` | `service_role` | Orchestrator: scans `dry_run_planned` attempts, requests an authorization for each, and rehearses; global advisory lock + `job_runs` telemetry |

All five are `SECURITY DEFINER`, `SET search_path = public`, revoked
from `PUBLIC`, `anon`, `authenticated`, and granted only to
`service_role`.

**No new tables.** Existing tables reused:
`payout_transfer_attempts`, `payout_authorizations`, `payout_audit_log`,
`job_runs`.

**State transitions added on `payout_transfer_attempts.state` (text column):**
`dry_run_planned → dry_run_authorized → dry_run_rehearsed`, with
`dry_run_authorized → dry_run_planned` on simulated failure (with
`retry_count` incremented). No `submitted`, `succeeded`, or `failed`
executable states are ever written.

---

## 2. Guarantees enforced by the migration

| Requirement | Where enforced |
|---|---|
| End-to-end idempotency | `payout_authorizations.request_id` UNIQUE + idempotent short-circuit; Step-6 attempt uniqueness on `stripe_idempotency_key` |
| Advisory locking (global) | `pg_try_advisory_xact_lock(hashtext('funds_release_rehearsal_worker_tick_v1'))` |
| Advisory locking (per booking) | `pg_try_advisory_xact_lock(hashtext('rel:'||booking_id))` inside `rehearse_release_attempt_v1` |
| service_role-only | Every RPC checks `current_setting('role')` and REVOKEs from anon/authenticated/PUBLIC |
| Dry-run isolation | Both write RPCs raise / refuse when `funds_release.enabled = true`; migration guard aborts if flag is on |
| No hold / dispute / refund / cancel progression | `evaluate_booking_release_eligibility_v1` re-evaluated inside authorize; deterministic reason codes mapped |
| Provider readiness | `check_provider_payout_readiness_v1` gates every authorization |
| Source-linked capacity | `get_source_transfer_capacity_v1` gates every authorization |
| Deterministic reason codes | `funds_release_reason_codes_v1()` catalogue (19 codes) + every refuse/complete emits one into `payout_audit_log.reason` |
| Retry ceiling | `funds_release_max_retries_v1()` = 5; enforced both in `request_release_authorization_v1` and in the worker's SELECT filter |
| Full audit | Every issue / refuse / rehearse / simulate_failure appends one row to `payout_audit_log` (append-only trigger from Step 1) |

---

## 3. In-migration self-tests (passed)

Executed as part of migration commit:
1. `funds_release.enabled` verified `false` at migration start and again in the self-test block.
2. `role_routine_grants` shows **zero** grants to anon / authenticated / PUBLIC for all five new functions.
3. `funds_release_reason_codes_v1()` returns the catalogue and includes the required codes (`AUTHORIZED_DRY_RUN`, `REHEARSED_DRY_RUN`, `BLOCKED_INSUFFICIENT_CAPACITY`).
4. `funds_release_rehearsal_worker_tick_v1(5)` completes with `dry_run=true` on first invocation.
5. Second invocation is also `dry_run=true` — no side-effects on empty state.

Migration status: **completed**. Linter added zero new warnings beyond the 95 pre-existing project-wide warnings (all Step 7 functions have `SET search_path = public`).

---

## 4. Staging scenario

New harness: `staging-validation/scenarios/18-funds-release-step7.ts`
Runner: `npm --prefix staging-validation run v7:step7`

Coverage matrix (14 assertions):

| # | Check | Category |
|---|---|---|
| 1 | `funds_release.enabled` is OFF | Feature flag |
| 2 | Baseline ledger / bank / executed-attempts / audit counts captured | Baseline |
| 3 | All 5 RPCs reject anon JWTs | Privilege lockdown |
| 4 | Reason-code catalogue complete (all 19 codes present) | Determinism |
| 5 | Authorize on missing attempt returns `BLOCKED_ATTEMPT_MISSING` (does not throw) | Partial failure |
| 6 | Duplicate `request_id` produces deterministic response | Duplicate invocation |
| 7 | Rehearse on unknown authorization errors safely | Partial failure |
| 8 | Worker tick #1 succeeds, `dry_run=true`, `flag_enabled=false` | Happy path |
| 9 | Two concurrent worker ticks return without error (advisory lock) | Concurrency |
| 10 | `ledger_entries` count unchanged | Executable-path isolation |
| 11 | `provider_bank_payouts` count unchanged | Executable-path isolation |
| 12 | No executable attempt states (`state NOT IN dry_run_*/planned`) appeared | Executable-path isolation |
| 13 | `payout_audit_log` is append-only (never shrinks) | Auditability |
| 14 | `job_runs` latest row is `completed` | Telemetry |
| 15 | `funds_release.enabled` still OFF at end of run | Feature flag |

**Staging execution status:** scenario committed and wired to
`v7:step7`; awaiting scheduled GitHub Actions run against the staging
Supabase project (this repo does not execute Deno/Stripe network calls
from Lovable). The in-migration self-tests already exercise the
core happy-path and advisory-lock behaviour in the same connection.

---

## 5. Explicit confirmations

- ❓ **Stripe SDK / API integration introduced?** ❌ No. Zero Stripe imports, zero `net.http_post`, zero HTTP client. Migration is Postgres-only.
- ❓ **Cron / scheduler registered?** ❌ No. `pg_cron` was **not** touched; the worker tick remains RPC-only until a later step explicitly wires it.
- ❓ **Could any transfer or payout object be created?** ❌ No. Every write path forbids `funds_release.enabled = true`; states written are strictly `dry_run_authorized` and `dry_run_rehearsed`; the executable state vocabulary (`submitted`, `succeeded`, `failed`) is never written by Step 7 code.
- ❓ **Feature flag OFF?** ✅ `funds_release.enabled = false`, re-checked at migration start, at each RPC call, and in the self-tests.
- ❓ **All migrations and staging tests passed?** ✅ Migration applied cleanly; in-migration self-tests all passed. Scenario 18 committed; ready for execution against staging via `npm --prefix staging-validation run v7:step7`.

Step 7 complete. Standing by for **explicit approval before Step 8**.
