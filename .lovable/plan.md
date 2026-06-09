
# Verificér Stripe webhook & betalingsflow

Nu hvor `STRIPE_WEBHOOK_SECRET` er opdateret, verificerer vi at hele kæden virker.

## Trin

1. **Tjek deployment af `stripe-webhook`**
   - Bekræft at edge function er deployed med den nye secret aktiv.
   - Kig i edge function logs for eventuelle startup-fejl.

2. **Send test-event fra Stripe Dashboard**
   - Du går til Stripe → Developers → Webhooks → vælg endpointet → "Send test webhook".
   - Vælg `payment_intent.succeeded` først.
   - Jeg henter logs fra `stripe-webhook` bagefter og bekræfter at signaturen valideres (ingen "Invalid signature"-fejl) og at handleren kører igennem.

3. **End-to-end booking-test (valgfrit men anbefalet)**
   - Opret en testbooking i preview som kunde.
   - `payment-create-intent` opretter en PaymentIntent med `capture_method=manual`.
   - Bekræft kort `4242 4242 4242 4242` → webhook `amount_capturable_updated` → `bookings.payment_status = "authorized"`.
   - Provider accepterer i ProviderDashboard → `booking-decide` capturer → webhook `succeeded` → `payment_status = "captured"`.
   - Alternativt: provider afviser → PaymentIntent cancelled → webhook `canceled` → status opdateres.

4. **Verificér 24t auto-cancel cron**
   - Bekræft at `booking-expire-pending` er sat op som scheduled function (eller manuelt trigger via curl for test).
   - Tjek at en booking ældre end 24t med status `pending` får cancelled både i DB og i Stripe.

## Hvad jeg har brug for fra dig

- Bekræft når du har sendt test-eventen i Stripe Dashboard (eller sig til hvis jeg skal trigge `booking-expire-pending` manuelt først).

Når du godkender planen, kører jeg log-tjek og curl-tests.
