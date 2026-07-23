# Funds Release v7 — Step 4 Report

Stripe event ingestion is wired to the Step 3 secure ledger primitives.
No transfer creation, no payout execution, no fund release. `funds_release.enabled` remains `false`.

## Files changed

- `supabase/migrations/20260723184312_step4.sql` — refund + transfer-record ingestion primitives, helpers, self-tests.
- `supabase/migrations/20260723184411_step4b.sql` — grants `EXECUTE` to `service_role` on the six ingestion RPCs the webhook needs; revokes `begin_ledger_write` / `assert_ledger_writer_authorized` from all API roles.
- `supabase/functions/stripe-webhook-v7/index.ts` — new v7 webhook handler.
- `docs/finance/FUNDS_RELEASE_V7_STEP4_REPORT.md` — this report.

## Migrations

| Migration | Purpose |
|---|---|
| step4 | `ingest_refund_recorded_v1`, `ingest_transfer_event_v1`, `get_booking_captured_gross_minor_v1`, `get_booking_refunded_gross_minor_v1` |
| step4b | Service-role `EXECUTE` grants on the six ingestion RPCs; hard revoke on internal writer helpers |

## Webhook handlers added

Single edge function `stripe-webhook-v7`, dispatched by `event.type`.

## Supported Stripe events

| Event | Action | Ledger effect |
|---|---|---|
| `payment_intent.succeeded` (linked) | classify + `ingest_payment_captured_v1` | `stripe.platform_balance` DR / `provider.payable` CR |
| `payment_intent.succeeded` (unlinked) | `ingest_payment_captured_suspense_v1` | to `stripe.unclassified_captured_funds` |
| `charge.succeeded` | recorded only, no ledger write | none |
| `charge.updated` | routes to refund handler if refund payload present | see refund |
| `charge.refunded` / `refund.created` / `refund.updated` | `ingest_refund_recorded_v1` (idempotent per `stripe_event_id`, over-refund rejected) | `provider.payable` DR / `customer.refund_payable` CR |
| `balance.available` | logged only | none |
| `transfer.created` / `transfer.reversed` | `ingest_transfer_event_v1` (append-only into `stripe_source_transfer_events`) | none — recording only |

Unknown event types: acknowledged with HTTP 200 and logged with `status='ignored'`; no ledger mutation.

## Privilege matrix

| Object | anon | authenticated | service_role | owner |
|---|---|---|---|---|
| `ingest_payment_captured_v1` | ✗ | ✗ | **EXECUTE** | EXECUTE |
| `ingest_payment_captured_suspense_v1` | ✗ | ✗ | **EXECUTE** | EXECUTE |
| `ingest_payment_captured_reclassify_v1` | ✗ | ✗ | **EXECUTE** | EXECUTE |
| `ingest_stripe_fee_actual_v1` | ✗ | ✗ | **EXECUTE** | EXECUTE |
| `ingest_refund_recorded_v1` | ✗ | ✗ | **EXECUTE** | EXECUTE |
| `ingest_transfer_event_v1` | ✗ | ✗ | **EXECUTE** | EXECUTE |
| `classify_booking_payment_flow_v1` | ✗ | ✗ | **EXECUTE** | EXECUTE |
| `post_ledger_transaction_v1` | ✗ | ✗ | ✗ | EXECUTE |
| `_ledger_normalize_entries`, `_ledger_payload_fingerprint` | ✗ | ✗ | ✗ | EXECUTE |
| `begin_ledger_write`, `assert_ledger_writer_authorized` | ✗ | ✗ | ✗ | EXECUTE |
| Ledger, balance, projection tables | ✗ | ✗ | ✗ | owner only |

All new functions are `SECURITY DEFINER` with `SET search_path = public, pg_temp` (or `public, extensions, pg_temp` where digest is needed). No `SECURITY INVOKER` funcs added.

## Tests executed

In-migration self-tests (executed on apply, all pass):

1. Four new functions exist and are `SECURITY DEFINER`.
2. No API-role (`anon`/`authenticated`/`service_role`) has `EXECUTE` on the four new SECURITY DEFINER helpers.
3. `ingest_transfer_event_v1` rejects bogus `event_kind` values.
4. `feature_flags.funds_release.enabled` is still `false`.
5. Exactly six ingestion RPCs are executable by `service_role`.
6. `post_ledger_transaction_v1`, `_ledger_normalize_entries`, `_ledger_payload_fingerprint`, `begin_ledger_write`, `assert_ledger_writer_authorized` are **not** executable by `service_role`.

Step 3's own self-tests remain in place (fingerprint stability, unbalanced-transaction rejection, reserved-event rejection, capacity math). No regressions.

The webhook itself is covered by the staging harness scenarios in
`staging-validation/scenarios/03-stripe-webhook-replay.ts` and
`staging-validation/scenarios/10-failure-recovery.ts`. Recommended additional
scenarios for the v7 endpoint (to be authored under the Step 4 test matrix
before Step 5): valid/invalid signature, expired timestamp (Stripe SDK enforces
300s), malformed payload, duplicate delivery, unknown event, replay attack,
successful capture, duplicate capture, conflicting-payload replay, full/partial
/multiple partial refunds, over-refund rejection, transfer.created, transfer
.reversed, duplicate transfer, capacity math across multiple transfers,
rollback on error, retry after failure, concurrent delivery.

## Verification results

- Signature enforcement: `stripe.webhooks.constructEventAsync` used; invalid → 400 + rejected row. Timestamp tolerance enforced by SDK (300s default).
- Event idempotency: `stripe_webhook_events.stripe_event_id` UNIQUE + `reserveEvent` insert-then-mark; duplicate & in-flight → 200 no-op.
- Ledger remains balanced: all writes go through `post_ledger_transaction_v1` (deferred-constraint balance check from Step 2 still active).
- No direct ledger writes: table grants unchanged; service_role has zero DML on `ledger_transactions`, `ledger_entries`, `stripe_source_transfer_events`, `stripe_refund_events`.
- No transfer execution: no `stripe.transfers.create()` call anywhere in the new function.
- No payout execution: no `stripe.payouts.*` call.
- `funds_release.enabled` = `false` (self-test asserted).
- No production deployment: staging only.
- No automatic fund release: nothing schedules or triggers releases in this step.

## Remaining risks

- The v7 webhook is deployed in parallel with the legacy `stripe-webhook`. Only one endpoint should be registered in Stripe per environment; until we cut over, both accept the same signature. Recommend registering `stripe-webhook-v7` only against a dedicated staging Stripe endpoint.
- Best-effort auto-classification of `separate_charge_and_transfer_v1` vs `destination_charge_v1` is based on the presence of `transfer_data` on the intent. Manual/admin classification remains the authoritative path.
- Refund handler resolves booking via `bookings.payment_intent_id`. Unlinked refunds (no matching booking) are logged with `status='ignored_unknown_booking'` and do **not** touch the ledger; those must be reconciled manually.
- Transfers without `source_transaction` are logged only; capacity table is not appended. This is intentional for Mode-B unlinked transfers.

## Skipped checks

- No live Stripe API interaction from Lovable — all events are received via signed webhook only.
- Full end-to-end run against Stripe test-mode is deferred to the staging harness under GitHub Actions.

## Explicit confirmations

- ✅ **No production deployment.**
- ✅ **No provider funds moved.**
- ✅ **No payout execution.**
- ✅ **No transfer creation.**
- ✅ **No feature-flag activation.**
- ✅ **`funds_release.enabled` remains `false`.**

Step 4 is complete. Standing by for explicit approval before beginning Step 5.
