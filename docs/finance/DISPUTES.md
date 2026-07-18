# Task 5 — Stripe Disputes & Chargebacks

## Architecture

Stripe emits `charge.dispute.*` events → `stripe-webhook` verifies the
signature, and for any dispute type delegates to
`_shared/disputes.ts::handleDisputeEvent`. That helper:

1. Resolves the booking chain (charge → payment_intent → booking → provider/customer users).
2. Upserts a `stripe_disputes` row keyed by `stripe_dispute_id` (fully idempotent).
3. Sets `funds_withdrawn_at` / `funds_reinstated_at` / `closed_at + outcome` per event type.
4. Fans out notifications via `_shared/notify.ts` (in-app + email/push queue).
5. Writes a `finance_reconciliation_alerts` row when funds are withdrawn so the daily
   reconcile job knows to reduce provider settlement.

Evidence flow:

```
provider UI  ──► dispute-evidence-upload ──► dispute-evidence bucket + dispute_evidence row
admin UI     ──► dispute-evidence-submit ──► Stripe Files API + disputes.update
                                             marks each row submitted_to_stripe_at
```

Monitoring:

`dispute-monitor` runs daily at 04:15 UTC via `pg_cron` and on-demand from admin UI.
It writes to `dispute_alerts` (unique per `dispute_id, code`) and notifies providers
about deadlines.

## Database changes

| Table                | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `stripe_disputes`    | One row per Stripe dispute (id, amount, reason, status, outcome, deadline) |
| `dispute_evidence`   | Files + notes uploaded per dispute; tracks Stripe submission audit trail |
| `dispute_alerts`     | Deadline & ratio alerts, resolvable by admins                            |
| `dispute-evidence`   | Private storage bucket for evidence files                                |

## Security review

- All three tables have RLS enabled + policies:
  - Admin/super_admin: full read.
  - Provider: read own disputes and evidence, insert evidence for own disputes only.
  - Customer: read own disputes.
  - Only `service_role` can insert `stripe_disputes` or mark funds movements.
- Storage bucket is **private**; SELECT/INSERT scoped to `<user_id>/…` folder or admins.
- `dispute-evidence-url` re-checks ownership before signing a 5-minute URL.
- `dispute-evidence-submit` is admin-only via `requireRole(["admin"])`.

## Finance integration

- Refund/credit note flow is untouched.
- `funds_withdrawn` creates a `finance_reconciliation_alerts` row (`dispute_funds_withdrawn`) so
  reconcile sees the balance debit and provider settlement is adjusted in the next run.
- `funds_reinstated` is stored on the dispute row; the alert is auto-resolvable by admin.

## Monitoring alerts

| Alert code                     | Severity                | Trigger                                                       |
| ------------------------------ | ----------------------- | ------------------------------------------------------------- |
| `deadline_approaching`         | warning / critical <24h | Open dispute with `evidence_due_by` within 72h                |
| `chargeback_ratio_exceeded`    | warning ≥0.75% / crit ≥1% | Platform 30-day dispute:charge ratio exceeds Stripe threshold |
| `dispute_funds_withdrawn`      | warning                 | Stripe pulled funds from platform balance                     |

## Regression testing

- Booking cancel/refund/credit-note paths: **untouched**. Dispute handler is a new
  `if (event.type.startsWith("charge.dispute."))` branch that returns early; refund and
  transfer branches unchanged.
- Existing `stripe_webhook_events` audit still logs dispute events (with `dispute_id`).
- No changes to `bookings.payment_status` on dispute events (industry practice: dispute
  status lives on its own row, refund status only updates on actual refund).

## Verification

- `code--exec` tsgo pass expected (new files self-contained; only nav-config gained
  `AlertTriangle`).
- Manual QA:
  1. Trigger `charge.dispute.created` via Stripe CLI → row appears, provider gets in-app
     notification, evidence page shows countdown.
  2. Provider uploads PDF → row in `dispute_evidence`, file in bucket under their user
     folder (verified private).
  3. Admin clicks "Send til Stripe" → files uploaded to Stripe, `submitted_to_stripe_at`
     stamped, dispute status → `under_review`.
  4. `charge.dispute.closed` (won) → outcome recorded, provider notified.
  5. `dispute-monitor` on-demand run computes ratio and creates deadline alerts.
