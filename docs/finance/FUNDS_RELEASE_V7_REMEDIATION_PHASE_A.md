# Funds Release v7 — Remediation Phase A + Phase B Manifest

**Status:** READ-ONLY audit + proposed migration manifest.
**Scope:** Production database inventory + reconstruction plan for
`supabase/migrations/`. Nothing has been modified: no production writes, no
migration files created, no feature flag changes, no Stripe calls, no cron
jobs registered.

---

## Executive summary

- Production **does** contain the full v7 Step 1–7 schema and RPCs, applied
  directly via the Lovable migration tool. **None** of those migrations were
  committed to `supabase/migrations/`, so a `supabase db push` to a clean
  staging project installs zero v7 objects.
- Production is inactive: the `funds_release.enabled` flag is `false`, no
  cron job schedules any v7 worker, no `stripe-webhook-v7` edge function is
  deployed, no `payout_transfer_attempts` / `payout_authorizations` /
  `booking_holds` / `release_eligibility_decisions` /
  `provider_bank_payouts` / `finance_payouts` rows exist, and
  `payout_audit_log` is empty.
- The only production data written by v7 is **one self-test ledger
  transaction** (`payment.captured.suspense` with event_id
  `pi_selftest_suspense:suspense`, 12 345 dkk, two balanced entries against
  `stripe.platform_balance` ↔ `stripe.unclassified_captured_funds`) plus
  **one rejected webhook envelope** in `stripe_webhook_events`
  (`webhook.rejected`). Neither represents Stripe money movement.
- RLS is `deny_all` on every v7 ledger / payout / stripe-ingest table; every
  v7 RPC is `SECURITY DEFINER` with EXECUTE revoked from
  `PUBLIC`/`anon`/`authenticated` (only `postgres`, `service_role`, and the
  local `sandbox_exec` psql role can call them).
- Scenario 18's schema assumptions are wrong (`release_authorization_requests`
  vs `payout_authorizations`, `release_rehearsal_attempts` vs
  `payout_transfer_attempts`, `feature_flags.key` vs `flag_key` +
  `scope='global'`). Corrections belong to Phase C, not Phase A.

---

## PHASE A — Production impact audit (read-only)

### A.1 Feature flag state

| Flag key                | Scope   | Enabled | Reason                                                                    |
|-------------------------|---------|---------|---------------------------------------------------------------------------|
| `funds_release.enabled` | global  | **false** | "v7 funds-release policy master switch. STAGING-ONLY, currently DISABLED." |

No other v7-related flags exist. Confirmed via
`select flag_key, scope, enabled, reason from feature_flags where flag_key like 'funds_release%'`.

### A.2 Scheduler state

- Extension `pg_cron` is installed.
- **Zero** cron jobs contain `release`, `payout`, `ledger`, or `rehearsal`
  in name or command.
- Neither `funds_release_worker_tick_v1` nor
  `funds_release_rehearsal_worker_tick_v1` is scheduled.

### A.3 Edge functions

- No `stripe-webhook-v7` directory exists under `supabase/functions/`.
- Existing Stripe-related functions (`stripe-webhook`,
  `stripe-connect-onboard`, `stripe-connect-status`, `stripe-public-key`,
  `stripe-status`) predate v7 and are not part of the v7 ingestion path.
- **No v7 edge function is deployed to production**, so the Step 4 report's
  "deployed `stripe-webhook-v7`" claim does not match the repository state.

### A.4 Tables (v7 scope) — schema owner & data state

| Table                              | Rows | Step | RLS         | Notes / data written                                             |
|------------------------------------|-----:|------|-------------|-------------------------------------------------------------------|
| `finance_accounts`                 |  19  | 1    | (catalogue) | Chart of accounts seed rows.                                     |
| `finance_event_catalogue`          |  23  | 1    | (catalogue) | Event type catalogue.                                            |
| `ledger_transactions`              |   1  | 1/2  | deny_all    | **1 self-test row** (see A.6).                                   |
| `ledger_entries`                   |   2  | 1/2  | deny_all    | 2 self-test entries balancing the row above.                     |
| `stripe_webhook_events`            |   1  | 4    | admin-read  | 1 `webhook.rejected` envelope; no Stripe funds movement.         |
| `stripe_refunds`                   |   0  | 4    | deny_all    | empty.                                                            |
| `stripe_refund_events`             |   0  | 4    | deny_all    | empty.                                                            |
| `stripe_source_transfer_events`    |   0  | 4    | deny_all    | empty.                                                            |
| `stripe_disputes`                  |   0  | 4    | admin-read  | empty (pre-existing table; v7 columns added).                    |
| `unclassified_balance_transactions`|   0  | 3/4  | deny_all    | empty.                                                            |
| `booking_bank_payout_attributions` |   0  | 3    | deny_all    | empty.                                                            |
| `provider_balance_accounts`        |   0  | 3    | deny_all    | empty.                                                            |
| `provider_balance_movements`       |   0  | 3    | deny_all    | empty.                                                            |
| `provider_credit_items`            |   0  | 3    | deny_all    | empty.                                                            |
| `provider_credit_allocations`      |   0  | 3    | deny_all    | empty.                                                            |
| `provider_debt_items`              |   0  | 3    | deny_all    | empty.                                                            |
| `provider_debt_allocations`        |   0  | 3    | deny_all    | empty.                                                            |
| `provider_bank_payouts`            |   0  | 3    | deny_all    | empty — **no payouts have been created**.                        |
| `booking_holds`                    |   0  | 5    | admin-read  | empty — **no holds placed**.                                     |
| `release_eligibility_decisions`    |   0  | 5    | admin-read  | empty — no decisions recorded.                                   |
| `payout_authorizations`            |   0  | 7    | deny_all    | empty — **no dual-control authorizations issued**.               |
| `payout_transfer_attempts`         |   0  | 7    | deny_all    | empty — **no transfer attempts, dry-run or otherwise, exist**.   |
| `payout_audit_log`                 |   0  | 7    | deny_all    | empty — **no audit events written**.                             |

Column shapes for the three tables that Scenario 18 misnamed:

- `payout_authorizations(id, request_id UNIQUE, requested_by, reason,
  booking_id, action, payload jsonb, status ∈ {issued, consumed, failed,
  expired}, issued_at, consumed_at, expires_at default now()+1h)`.
- `payout_transfer_attempts(id, booking_id, provider_user_id, attempt_scope,
  attempt_number ≥1, funding_mode transfer_funding_mode, funding_source_ref,
  amount_minor >0, currency lower(3), transfer_group, stripe_idempotency_key
  UNIQUE, stripe_transfer_id, state default 'planned', retry_count,
  last_error_code, last_error_message, eligibility_snapshot jsonb, timestamps)`.
- `ledger_transactions(id, event_type FK finance_event_catalogue, event_id,
  currency lower(3), booking_id, provider_user_id, memo, posted_at, source
  default 'internal', raw jsonb, payload_fingerprint,
  UNIQUE(event_type, event_id))`.

### A.5 Constraints, triggers, indexes (v7 scope)

Triggers detected on v7 tables:

| Table                            | Trigger                                | Purpose                                     |
|----------------------------------|----------------------------------------|---------------------------------------------|
| `ledger_transactions`            | `ledger_transactions_writer_guard`     | Step 2 — service-role/postgres/authorized only |
| `ledger_transactions`            | `ledger_transactions_no_update`        | Append-only                                 |
| `ledger_transactions`            | `ledger_transactions_no_delete`        | Append-only                                 |
| `ledger_transactions`            | `ledger_tx_event_enabled`              | Step 3 — event_type must be catalogued/enabled |
| `ledger_transactions`            | `ledger_tx_balance_check` (deferred)   | Step 2 — sum(debits)=sum(credits) at COMMIT |
| `ledger_entries`                 | `ledger_entries_writer_guard`          | Step 2 writer guard                         |
| `ledger_entries`                 | `ledger_entries_no_update` / `_no_delete` | Append-only                              |
| `ledger_entries`                 | `ledger_entries_currency_match`        | Currency must match parent transaction      |
| `ledger_entries`                 | `ledger_entry_balance_check` (deferred)| Companion to ledger_tx balance check       |
| `payout_audit_log`               | `payout_audit_log_no_update` / `_no_delete` | Append-only                          |
| `release_eligibility_decisions`  | `trg_red_no_update`                    | Append-only                                 |

All foreign keys use `ON DELETE RESTRICT` (verified on
`ledger_transactions`, `payout_authorizations`, `payout_transfer_attempts`).
Unique constraints observed: `ledger_transactions(event_type,event_id)`,
`payout_authorizations(request_id)`,
`payout_transfer_attempts(booking_id, attempt_scope, attempt_number)`,
`payout_transfer_attempts(stripe_idempotency_key)`. All standard indexes are
present on `booking_id`, `provider_user_id`, `posted_at`, `state`.

### A.6 Production self-test rows (only rows written by v7)

| Table                   | Rows | Content                                                                                                    |
|-------------------------|-----:|-------------------------------------------------------------------------------------------------------------|
| `ledger_transactions`   |   1  | `id 06a08500-…`, `event_type payment.captured.suspense`, `event_id pi_selftest_suspense:suspense`, `amount 12345 dkk`, `booking_id NULL`, `provider_user_id NULL`, `source stripe`. |
| `ledger_entries`        |   2  | `stripe.platform_balance debit 12345 dkk` + `stripe.unclassified_captured_funds credit 12345 dkk`.         |
| `stripe_webhook_events` |   1  | `stripe_event_id rejected-2755ca6d-…`, `event_type webhook.rejected` — envelope rejected before processing.|

**No Stripe API call, transfer, payout, hold, authorization, rehearsal
attempt, or provider fund movement is represented by these rows.** They are
in-database self-tests posted by the Step 2/4 migration verification blocks.
They can either be kept for parity or removed by a targeted DELETE in a
Phase B migration on staging only; recommendation is to **NOT reproduce
them on staging** — migration self-tests should run and roll back inside
the migration transaction (Phase B item M-02 covers this).

### A.7 RLS policies (v7 scope)

- `deny_all` FOR ALL to `{anon, authenticated, service_role}` on every
  ledger, payout, stripe-ingest, provider-balance, and unclassified table.
- `booking_holds`: `holds_admin_read` (SELECT, admins only) +
  `holds_no_direct_write` (deny_all writes).
- `release_eligibility_decisions`: `red_admin_read` + `red_no_direct_write`.
- `stripe_webhook_events` retains pre-v7 admin/employee read policies.
- `stripe_disputes` retains pre-v7 customer/provider/admin read policies.

All writes into these tables are only reachable through `SECURITY DEFINER`
functions guarded by `assert_ledger_writer_authorized()` /
`begin_ledger_write()` and the `ledger_writer_guard` trigger.

### A.8 Functions / RPCs (v7 scope) — presence & lockdown

All present with `SECURITY DEFINER` unless noted, `search_path` pinned:

| Function                                        | Step | Purpose                                             | Executable in prod?              |
|-------------------------------------------------|-----:|-----------------------------------------------------|-----------------------------------|
| `_ledger_payload_fingerprint(jsonb)`            | 3    | Idempotency fingerprint helper (IMMUTABLE)          | Helper only.                      |
| `_ledger_normalize_entries(jsonb)`              | 3    | Entry normalizer (IMMUTABLE)                        | Helper only.                      |
| `assert_ledger_writer_authorized()`             | 2    | Raise unless role ∈ {service_role, postgres, allowlisted} | Guard, not fund-moving.     |
| `begin_ledger_write()`                          | 2    | Sets per-tx GUC to permit ledger writer trigger     | Guard.                            |
| `ledger_writer_guard()` (trigger fn)            | 2    | Enforces writer guard on inserts                    | Guard.                            |
| `ledger_entry_currency_match()` (trigger fn)    | 1    | FX guard                                            | Guard.                            |
| `ledger_event_enabled_check()` (trigger fn)     | 3    | Enforces enabled event types                        | Guard.                            |
| `validate_ledger_transaction_balance()`         | 2    | Deferred CONSTRAINT TRIGGER: balanced at COMMIT     | Guard.                            |
| `reject_ledger_mutation()` (trigger fn)         | 1    | Append-only                                         | Guard.                            |
| `reject_release_decision_mutation()`            | 5    | Append-only for release_eligibility_decisions       | Guard.                            |
| `post_ledger_transaction_v1(jsonb)`             | 3    | Authoritative ledger writer (idempotent)            | Executable but flag-gated.        |
| `classify_booking_payment_flow_v1(uuid)`        | 3    | Booking classifier (read-only)                      | Read-only.                        |
| `get_source_transfer_capacity_v1(...)`          | 3    | Mode A capacity read                                | Read-only.                        |
| `check_provider_payout_readiness_v1(uuid)`      | 5    | Readiness probe (STABLE)                            | Read-only.                        |
| `evaluate_booking_release_eligibility_v1(uuid)` | 5    | Decision engine (dry-run only)                      | Writes decision row; no funds.    |
| `release_booking_hold_v1(uuid)`                 | 5    | Hold release helper                                 | Writes to `booking_holds` only.   |
| `plan_pending_releases_v1()`                    | 6    | Planner (dry-run)                                   | Writes decision rows; no funds.   |
| `reconcile_provider_payout_readiness_v1()`      | 6    | Readiness reconciler (dry-run)                      | No funds movement.                |
| `funds_release_worker_tick_v1()`                | 6    | Dry-run orchestrator                                | Flag-gated; refuses when OFF.     |
| `request_release_authorization_v1(...)`         | 7    | Dual-control issue authorization                    | Flag-gated.                       |
| `rehearse_release_attempt_v1(uuid,text)`        | 7    | Dry-run rehearsal                                   | Flag-gated; refuses when OFF.     |
| `funds_release_rehearsal_worker_tick_v1()`      | 7    | Rehearsal orchestrator                              | Flag-gated.                       |
| `funds_release_max_retries_v1()`                | 6    | Constant helper                                     | Read-only.                        |
| `funds_release_reason_codes_v1()`               | 6    | Constant helper                                     | Read-only.                        |

Grants (from `pg_proc.proacl`) for every executable v7 RPC listed above:
`postgres=X`, `service_role=X`, `sandbox_exec=X` — **no
`PUBLIC`, `anon`, or `authenticated` EXECUTE**. Confirmed by direct
inspection.

### A.9 Confirmation matrix

| Requirement                                                    | Status                                                                 |
|-----------------------------------------------------------------|------------------------------------------------------------------------|
| `funds_release.enabled` = false in production                   | ✅ confirmed (`enabled = f`, `scope='global'`).                        |
| No cron/scheduler for v7                                        | ✅ confirmed via `cron.job` (no matching entries).                     |
| No Stripe Transfer API call occurred                            | ✅ `payout_transfer_attempts` empty; no `stripe_source_transfer_events`.|
| No payout or funds release occurred                             | ✅ `provider_bank_payouts`=0, `finance_payouts`=0, audit log empty.    |
| No executable transfer attempt exists                           | ✅ `payout_transfer_attempts` = 0 rows.                                |
| Self-test rows identified                                       | ✅ 1 ledger tx + 2 entries + 1 rejected webhook (A.6).                 |
| Rollback safety                                                 | Objects can remain inactive indefinitely — RLS deny-all, flag OFF, no cron, no edge function. **Recommendation: keep production objects in place**; rebuild parity on staging via Phase B/D. |

**Conclusion:** Production surface for v7 is present but fully inactive.
No production data has moved money. The remediation risk is only in
divergence between production and the migration folder — not in production
behavior.

---

## PHASE B — Proposed migration manifest (for review only)

All migrations to be authored under `supabase/migrations/` with UTC
timestamps in the sequence below. Each is derived from production's actual
schema; no alternate object names introduced.

| # | Proposed filename (timestamp illustrative) | v7 Step | Creates / installs |
|---|-------------------------------------------|--------:|--------------------|
| M-01 | `20260722_090000_v7_step1_finance_catalogues.sql` | 1 | `finance_accounts`, `finance_event_catalogue`, seed rows, extensions (`pgcrypto` if not present), enum `transfer_funding_mode`. |
| M-02 | `20260722_090100_v7_step1_ledger_and_stripe_tables.sql` | 1 | `ledger_transactions`, `ledger_entries`, `stripe_webhook_events` (v7 columns only if pre-existing), `stripe_refunds`, `stripe_refund_events`, `stripe_source_transfer_events`, `unclassified_balance_transactions`, `booking_bank_payout_attributions`, indexes, unique constraints, FK RESTRICT. Grants + `deny_all` RLS. **Self-tests run inside a subtransaction that is ROLLED BACK** so no rows persist. |
| M-03 | `20260722_090200_v7_step1_provider_balance_and_credit.sql` | 1 | `provider_balance_accounts`, `provider_balance_movements`, `provider_credit_items`, `provider_credit_allocations`, `provider_debt_items`, `provider_debt_allocations`, `provider_bank_payouts`. Grants + deny_all RLS. |
| M-04 | `20260722_090300_v7_step2_ledger_safeguards.sql` | 2 | `assert_ledger_writer_authorized`, `begin_ledger_write`, `ledger_writer_guard` trigger fn + `ledger_transactions_writer_guard` / `ledger_entries_writer_guard` triggers, append-only reject triggers, `ledger_entries_currency_match` trigger + fn, deferred `validate_ledger_transaction_balance` CONSTRAINT TRIGGER on both tables. In-migration self-test verifying (a) unauthorized insert is blocked, (b) unbalanced txn fails at COMMIT — wrapped in `BEGIN…ROLLBACK`. |
| M-05 | `20260722_090400_v7_step3_classification_and_ingestion.sql` | 3 | Helpers `_ledger_payload_fingerprint`, `_ledger_normalize_entries`; RPCs `classify_booking_payment_flow_v1`, `post_ledger_transaction_v1`, `get_source_transfer_capacity_v1`, `ledger_event_enabled_check` trigger fn + trigger on `ledger_transactions`. Revoke EXECUTE from PUBLIC, anon, authenticated. |
| M-06 | `20260722_090500_v7_step4_stripe_ingest_rpcs.sql` | 4 | Ingest RPCs for payments/refunds/transfers (names verbatim from `pg_proc`); privilege lockdown identical to M-05. **No edge function is created here** — Step 4's `stripe-webhook-v7` will be filed separately under `supabase/functions/stripe-webhook-v7/` in a follow-up commit and is not part of Phase B unless explicitly approved. |
| M-07 | `20260722_090600_v7_step5_release_eligibility.sql` | 5 | `booking_holds` + policies (`holds_admin_read`, `holds_no_direct_write`), `release_eligibility_decisions` + policies (`red_admin_read`, `red_no_direct_write`), `trg_red_no_update` + `reject_release_decision_mutation`, RPCs `check_provider_payout_readiness_v1`, `evaluate_booking_release_eligibility_v1`, `release_booking_hold_v1`. Revoke EXECUTE from PUBLIC/anon/authenticated. |
| M-08 | `20260722_090700_v7_step6_workers.sql` | 6 | `payout_audit_log` (append-only triggers), constants `funds_release_max_retries_v1`, `funds_release_reason_codes_v1`, RPCs `plan_pending_releases_v1`, `reconcile_provider_payout_readiness_v1`, `funds_release_worker_tick_v1`. Grants revoked from PUBLIC. **No cron registered.** |
| M-09 | `20260722_090800_v7_step7_dual_control_and_rehearsal.sql` | 7 | `payout_authorizations` + `deny_all` policy, `payout_transfer_attempts` (+ unique on `stripe_idempotency_key`), RPCs `request_release_authorization_v1`, `rehearse_release_attempt_v1`, `funds_release_rehearsal_worker_tick_v1`. All flag-gated: refuse to execute while `funds_release.enabled = false`. Grants revoked from PUBLIC. |
| M-10 | `20260722_090900_v7_feature_flag_seed.sql` | cross-cutting | Insert `feature_flags(flag_key='funds_release.enabled', scope='global', enabled=false, reason='v7 master switch — DISABLED')` if not present. Idempotent (`ON CONFLICT DO NOTHING`). |

**Determinism & safety guarantees for each migration file:**

1. Every `CREATE TABLE` in `public` includes `GRANT` statements immediately
   before `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `CREATE POLICY`,
   per repo rule.
2. Each file uses `CREATE …` (not `CREATE OR REPLACE`) for tables and
   `IF NOT EXISTS` only for extensions/indexes; RPCs use
   `CREATE OR REPLACE FUNCTION` with fixed `search_path` and
   `SECURITY DEFINER` where production has it.
3. No production-specific IDs, no seeded booking IDs, no self-test rows
   persisted.
4. Prerequisite checks: each migration `RAISE EXCEPTION` if a dependency
   (e.g. `finance_event_catalogue` for M-05) is missing.
5. `funds_release.enabled` is written as `false` in M-10 and is NOT toggled
   anywhere else.
6. **No cron registration, no edge-function deployment, no Stripe SDK
   call, and no fund-moving logic is executable at any point in the chain.**

---

## PHASE C — Scenario 18 corrections (spec only, not applied)

Confirmed corrections required (to be implemented in Phase C after
approval; not touching migrations or app code):

- Replace `release_authorization_requests` → `payout_authorizations`.
- Replace `release_rehearsal_attempts` → `payout_transfer_attempts`.
- Feature-flag query: `.eq('flag_key', 'funds_release.enabled').eq('scope', 'global')`.
- Add **existence preconditions** for every required v7 table
  (`ledger_transactions`, `ledger_entries`, `booking_holds`,
  `release_eligibility_decisions`, `payout_authorizations`,
  `payout_transfer_attempts`, `payout_audit_log`) and every required RPC.
  A missing object must **fail** the assertion — not be reported as
  "state_safe (absent)". This directly closes the current false-positive on
  "state_safe" when tables don't exist.
- Retain all 14 assertions; the current "state_safe if absent" logic is
  replaced by strict existence checks + empty-state checks.

---

## PHASE D — Deployment gate (awaiting explicit approval)

Not executed. Once M-01…M-10 and the Phase C harness update are approved:

1. `supabase db push` on staging project ref (must differ from
   `qfjgifubavuomwvroahy`).
2. Run in-migration self-tests (all inside `BEGIN…ROLLBACK`).
3. Run corrected Scenario 18 → 14/14 required.
4. Print `flag_key='funds_release.enabled'` in both environments to
   confirm `enabled = false`.
5. Confirm zero rows in every v7 write-target table on staging **and**
   unchanged counts on production.

**Stop here.** Awaiting explicit approval before authoring any migration
file, editing Scenario 18, or deploying to staging.
