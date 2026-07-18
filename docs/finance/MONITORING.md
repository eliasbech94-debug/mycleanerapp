# Production Monitoring — Notifications, Audit, Reconciliation

## Notifications (customer + provider)

All cancellation/refund/credit-note events fan out through
`_shared/notify.ts` on three channels:

| Channel  | Storage                        | Delivery                                     |
| -------- | ------------------------------ | -------------------------------------------- |
| in_app   | `customer_notifications`       | Rendered in the in-app inbox immediately     |
| email    | `notification_outbox` (queued) | Picked up by future email worker             |
| push     | `notification_outbox` (queued) | Picked up by future push worker              |

All rows are idempotent via a stable `dedupe_key` and a unique
`(user_id, channel, dedupe_key)` index. Re-invoking the same edge function
never duplicates a notification.

### Customer events
- `booking.cancelled` — sent when a booking is cancelled by any actor.
- `refund.initiated` — sent when `booking-cancel` triggers a Stripe refund.
- `refund.completed` — sent when the refund settles and the credit note is issued.
- `credit_note.available` — sent alongside refund completion.

### Provider events
- `booking.cancelled.provider` — sent when a booking they own is cancelled.
- `refund.completed.provider` — sent when a refund settles.
- `settlement.adjusted` — sent when the settlement statement is
  recomputed by `credit-note-issue`.
- `credit_note.issued.provider` — sent when the platform issues a credit
  note for their booking.

## Immutable admin audit log

Every cancellation and refund writes one row to `admin_audit_log`:

- `actor_user_id`, `actor_role`
- `action` (e.g. `booking.cancelled`, `credit_note.issued`)
- `previous_state` and `new_state` snapshots
- `refund_amount`, `currency`, `stripe_refund_id`, `stripe_payment_intent_id`
- `ip_address` (from `x-forwarded-for` / `x-real-ip`)
- `user_agent`
- Free-form `metadata` (reason code, policy snapshot, credit note number, …)

Immutability is enforced by trigger `admin_audit_no_update`, which raises
on any `UPDATE` or `DELETE`, and by RLS: only admins can read, only
`service_role` can insert (from edge functions).

## Finance reconciliation

`finance-reconcile` runs daily at 03:15 UTC via `pg_cron` and scans the
last 30 days of bookings. For every captured/refunded booking it verifies
the full artifact chain and writes alerts (upsert on
`(booking_id, code)`) when something is missing:

| Alert code                       | Severity | Meaning                                             |
| -------------------------------- | -------- | --------------------------------------------------- |
| `missing_payment_intent`         | critical | Captured booking with no Stripe PaymentIntent id    |
| `missing_platform_fee_invoice`   | error    | No platform fee invoice for a captured booking      |
| `missing_settlement`             | error    | No provider settlement statement                    |
| `settlement_refund_mismatch`     | warning  | Settlement refund ≠ booking refund                  |
| `missing_credit_note`            | error    | Refunded booking has no credit note                 |
| `missing_payout`                 | warning  | Settlement >7 days old, no payout linked            |

Run history is kept in `finance_reconciliation_runs` (bookings scanned,
alerts created, per-code summary). Alerts can be manually resolved by
admins by setting `resolved_at` / `resolved_by`.

To run on demand:

```bash
curl -X POST https://<project>.supabase.co/functions/v1/finance-reconcile \
  -H "Authorization: Bearer <admin-jwt>" \
  -d '{"hours_back": 720}'
```
