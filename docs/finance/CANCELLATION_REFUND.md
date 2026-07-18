# Cancellation, Refund & Credit-Note Workflow

Task 4 architecture. Covers customer / provider / admin cancellations, partial
& full refunds, automatic platform credit notes, and settlement-statement
reconciliation. **Stripe is the source of truth** — the database mirrors
Stripe via webhook, never the other way around.

## Workflow diagram

```
                   ┌───────────────────────────────┐
                   │  Client (Customer / Provider) │
                   │  or Admin dashboard           │
                   └──────────────┬────────────────┘
                                  │ POST /booking-cancel
                                  │ { booking_id, reason_code,
                                  │   idempotency_key, refund_amount? }
                                  ▼
        ┌─────────────────────────────────────────────┐
        │  booking-cancel (edge fn)                   │
        │  1. authenticate + authorize (RBAC)         │
        │  2. compute cancellation policy snapshot    │
        │  3. upsert refund_requests(idempotency_key) │
        │  4. Stripe action:                          │
        │       • authorized → paymentIntents.cancel  │
        │       • captured   → refunds.create         │
        │         (with Idempotency-Key header)       │
        │  5. update booking + insert audit row       │
        └────────────────────┬────────────────────────┘
                             │ Stripe async
                             ▼
                ┌────────────────────────────┐
                │  Stripe → refund.updated   │
                │  charge.refunded           │
                └────────────┬───────────────┘
                             │ webhook
                             ▼
        ┌─────────────────────────────────────────────┐
        │  stripe-webhook                             │
        │  • recomputes booking.refund_amount from    │
        │    ALL succeeded refunds on the charge      │
        │  • updates payment_status                   │
        │  • fires credit-note-issue (non-blocking)   │
        └────────────────────┬────────────────────────┘
                             ▼
        ┌─────────────────────────────────────────────┐
        │  credit-note-issue                          │
        │  • idempotent per (invoice, refund_id)      │
        │  • pro-rata reverses platform-fee invoice   │
        │  • allocates fresh credit-note number       │
        │  • renders PDF → invoices bucket            │
        │  • recalculates provider_settlement_statement│
        └─────────────────────────────────────────────┘
```

## Database changes

| Table | Purpose |
|---|---|
| `booking_cancellations` | Immutable audit — one row per cancellation event (booking + actor + reason + policy snapshot). Readable by the actor, the booking parties, and admins/employees. |
| `platform_credit_notes` | Legal credit note that reverses part or all of a `platform_fee_invoices` row. Numbered `PREFIX-CN-YYYY-nnnnnn` from the same per-country sequence, stored as PDF in the `invoices` bucket. Unique on `(original_invoice_id, stripe_refund_id)`. |
| `refund_requests` | Backend-only idempotency ledger. `idempotency_key` unique. Prevents double refunds when a client retries `booking-cancel`. **No RLS policies = no client access; service_role only.** |
| `bookings` (extended) | New columns: `cancelled_by_user_id`, `cancelled_by_role`, `cancellation_reason_code`, `cancellation_policy_snapshot` (jsonb), `cancelled_at`. |

## Cancellation policy (in code, snapshotted per event)

| Actor | Payment state | Refund |
|---|---|---|
| Customer | authorized (not captured) | PaymentIntent cancelled — no charge |
| Customer | captured, ≥ 48 h before service | 100% |
| Customer | captured, 24–48 h before service | 50% |
| Customer | captured, < 24 h before service | 0% |
| Provider | any captured | 100% of refundable amount (customer harm-free) |
| Admin | any | admin-supplied `refund_amount`, capped at refundable |

The applied rule + hours-until-service + gross/refundable amounts are frozen
into `booking_cancellations.policy_snapshot` and mirrored on
`bookings.cancellation_policy_snapshot` so future policy changes never
retro-rewrite history.

## Stripe integration

- `paymentIntents.cancel(pi, undefined, { idempotencyKey: "pi_cancel:<key>" })`
  for uncaptured intents.
- `refunds.create({ payment_intent, amount, reason, metadata, reverse_transfer: true }, { idempotencyKey: "refund:<key>" })`
  for captured payments. `reverse_transfer: true` debits the provider's
  connected account proportionally so the platform never fronts the money.
- Refund metadata carries `booking_id`, `actor_user_id`, `actor_role`,
  `reason_code` for downstream reconciliation.
- Webhook uses Stripe's refund list (`stripe.refunds.list({ charge })`) as
  the authoritative total instead of trusting a single event payload — safe
  under out-of-order delivery and retries.

## Credit-note logic

- Fires only after Stripe confirms the refund (webhook), never at request time.
- Idempotent on `(original_invoice_id, stripe_refund_id)` — Stripe delivering
  the same event twice creates zero duplicates.
- Amount reversed = `originalInvoice.subtotal * (delta_refund_gross / gross_paid)`.
  VAT reversed proportionally at the original invoice's rate. This handles
  multiple sequential partial refunds cleanly: each new credit note covers
  only the *delta* since the last one.
- Uses `next_credit_note_number(country_code)` — same per-country monotonic
  sequence as invoices (regulatory requirement in DK/SE), with a `-CN-`
  infix that makes the document type obvious in accounting exports.
- PDF is labelled as reversing platform-fee only, never the underlying
  cleaning service (that stays the provider's responsibility).

## Accounting impact

- **Provider settlement statement** — `refund_amount`, `platform_fee_amount`,
  `provider_net_amount` are recomputed on every refund so the statement PDF
  and the finance dashboard always match Stripe.
- **finance-summary** aggregates already subtract `refund_amount` from gross
  and pro-rate commission; no additional change needed.
- **Xero export** (`accounting-export`) picks up the new
  `platform_credit_notes` rows automatically once the exporter is extended
  to list them alongside invoices.

## Security review

- All entry paths require `authenticate()`; role is enforced server-side.
- `refund_requests` has RLS enabled with **no policies** → clients cannot see
  or write it; only `service_role` (edge functions) can.
- `booking-cancel` never trusts a client-supplied `refund_amount` unless the
  caller is admin; other actors get the policy-computed amount.
- Stripe API keys stay in edge-function env; never shipped to the browser.
- `credit-note-issue` accepts service-role OR admin JWT — never a regular
  provider/customer token (they cannot self-issue credit notes).
- Idempotency keys prevent replay attacks: repeat POSTs with the same key
  return the original outcome without re-hitting Stripe.

## Regression tests (manual verification)

Tested paths (dev):
1. Customer cancel of authorized-but-uncaptured booking → PaymentIntent
   cancelled, no refund, booking status `cancelled`, `payment_status`
   `canceled`, audit row written, no credit note.
2. Customer cancel > 48h before service on captured booking → 100% refund,
   webhook fires, credit note issued for full platform fee, settlement
   statement zeroed to `provider_net = 0`, `refund_amount = gross`.
3. Customer cancel 12h before service → 0% refund, booking cancelled,
   no Stripe call, no credit note.
4. Provider cancel on captured booking → 100% refund, credit note issued,
   `booking_cancellations.actor_role = 'provider'`.
5. Admin partial refund (`refund_amount: 5000` on a 20000 gross) → pro-rata
   credit note for 25% of platform fee, settlement `provider_net` = 75% of
   original net.
6. Duplicate POST with same `idempotency_key` → returns `idempotent_replay:
   true`, Stripe not called, no second audit row, no second credit note.
7. Two sequential partial refunds (5000, then 3000 on same booking) →
   two credit notes, second one covers only the 3000 delta.
8. Stripe webhook delivered twice → single credit note (unique index).

## Remaining risks

- **Refund → transfer reversal timing**: with `reverse_transfer: true`,
  Stripe reverses the connected-account transfer asynchronously. The
  `finance_payouts` mirror will reflect the reversal via `transfer.reversed`
  events (already handled in webhook).
- **Multi-currency**: credit notes are issued in the booking's currency;
  numbering series is per country. A future EU-wide sequence redesign will
  need a separate migration.
- **Disputes (chargebacks)**: covered in Task 5, not here. When a chargeback
  arrives, the same credit-note path can be reused with `reason = 'fraud'`.
- **Partial refund of an already-fully-refunded booking**: guarded by
  `refundable = max(0, gross - previously_refunded)`; Stripe would reject
  regardless.

## Verification report

- Migration applied cleanly; linter shows no NEW findings (only pre-existing
  accepted warnings for RLS/SECURITY DEFINER policy helpers and the
  intentional backend-only `refund_requests` table without client policies).
- Edge functions `booking-cancel` and `credit-note-issue` deployed.
- Webhook path extended to trigger credit-note-issue asynchronously — never
  blocks the 200 OK back to Stripe.
- Settlement statements are re-derived from the refund total on every
  credit-note issuance; no drift possible between statement PDF and
  Stripe ledger.
- Existing booking, payment, invoice-issue and finance-summary flows
  untouched.
