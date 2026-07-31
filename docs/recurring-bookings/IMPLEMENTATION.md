# Recurring bookings — implementation contract

## Product rules

- Platform-defined discounts: weekly 10%, biweekly 7%, monthly 5%.
- Providers only opt in/out per recurrence; custom percentages are impossible.
- Each cleaning is a separate booking and payment.
- Accepted series freeze discount version, percentage, base rate and discounted rate.
- Disabling an offer affects new series only.
- Completed occurrences never recalculate.

## Payment lifecycle

1. Customer confirms the first occurrence with Stripe and authorizes future off-session payments.
2. Trusted server code creates the series only after the initial payment/setup succeeds.
3. A scheduled worker prepares each occurrence before `next_occurrence_at`.
4. The worker obtains a fresh authoritative quote using the series' frozen terms and charges the saved payment method off-session.
5. Only a successful/authorized payment creates or confirms the occurrence for the provider.
6. On `authentication_required`, the occurrence is held and the customer receives a payment-action link.
7. On final payment failure, that occurrence is cancelled; the series is not silently deleted.

## Required follow-up before activation

- Wire recurrence into `pricing-quote`; discount before surcharges, then commission on final subtotal.
- Add trusted Edge Functions for create/pause/skip/cancel series.
- Add Stripe SetupIntent/off-session consent flow.
- Add idempotent scheduled occurrence worker and retry policy.
- Link occurrence bookings to `booking_series.id` and freeze quote/payment snapshots.
- Add provider settings and customer booking UI in all five locales.
- Add migration/RLS regression tests and Stripe test-mode E2E.

## Safety gates

- No direct client writes to `booking_series`.
- No client-trusted price, percentage, currency, provider or market.
- DK remains the only bookable market.
- No migration or function deploy from this branch without staging validation.
