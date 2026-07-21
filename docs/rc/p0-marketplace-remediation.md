# P0 — Marketplace Remediation

**Owner:** platform / trust  
**Status:** P0.1 landed in staging — awaiting authenticated E2E + Stripe test-mode sign-off before production gate can open.  
**Scope of this document:** P0.1 only. P0.2 (availability), P0.3 (DB marketplace), P0.4 (booking state machine), P0.5 (regression harness) are tracked in follow-ups.

Production remains **blocked**. Real-money payments must not be enabled until every P0 subsection has been implemented, staging-validated and explicitly approved.

---

## P0.1 — Authoritative pricing & locked-quote checkout

### Threat removed

The client is no longer authoritative for **any** of the following:

- `customer_pays`, `provider_gets`, `platform_fee_amount`, `currency`
- `country_code`, tax / commission / booking-rules snapshots
- Stripe `PaymentIntent.amount`, `application_fee_amount`, transfer destination
- Provider Stripe Connect account id
- Booking money row insertion

All of these values are derived server-side from an immutable pricing quote and, at insert time, from the currently published country config. The `bookings.customers_insert` RLS policy has been removed — customer bookings can only be created by `payment-create-intent` (service role).

### Architecture before

```
Browser BookingFlow
   └─ POST /payment-create-intent
        body: { provider_id, customer_pays, provider_gets, currency, ... }
        │
        └─ INSERT bookings (money fields from request body)
        └─ Stripe PaymentIntent.amount = body.customer_pays
```

Customers could tamper with any monetary field and Stripe would authorize
against the tampered amount. Additionally, RLS allowed `customer_user_id = auth.uid()`
inserts, meaning a customer could bypass the edge function entirely.

### Architecture after

```
Browser BookingFlow
   ├─ POST /pricing-quote                       (server calculates)
   │       body:  { provider_id_text, service_category,
   │                currency, start_at, duration_minutes,
   │                address_place_id?, lat?, lng?, quote_context }
   │       returns { quote_id, customer_total_minor,
   │                 platform_fee_minor, provider_net_minor,
   │                 currency, country_code, expires_at, ... }
   │
   └─ POST /payment-create-intent               (server verifies + locks)
           body:  { quote_id, booking_date, slot, address,
                    address_place_id?, lat?, lng?, notes?, provider_name? }
           │
           ├─ Load pricing_calculations row (service role)
           │      · quote.quote_context = 'customer_checkout'
           │      · quote.customer_user_id = auth.uid()
           │      · quote.status = 'quoted'
           │      · quote.expires_at > now()
           │
           ├─ Load country_configs (get_published_country_config)
           │      · published, active, launch_ready|active
           │      · currency matches quote.currency
           │
           ├─ INSERT bookings (all money fields from quote)
           │      · pricing_calculation_id = quote.id  (UNIQUE — idempotent)
           │
           ├─ RPC lock_pricing_quote(booking_id, quote_id)
           │      · quote → 'locked' (terminal)
           │      · booking.pricing_snapshot frozen
           │
           └─ Stripe PaymentIntent
                  amount            = quote.customer_total_minor
                  application_fee   = quote.platform_fee_minor
                  Idempotency-Key   = pi:quote:<quote_id>
```

Client-supplied `customer_pays`, `provider_gets`, `currency`, `country_code`,
`hours` and `platform_fee_amount` are dropped by the request schema and never
reach the DB or Stripe.

### Quote-lock lifecycle

State machine on `pricing_calculations.status`:

```
                  ┌──────────► superseded (new quote for same key)
                  │
draft ─► quoted ──┼──────────► expired    (TTL 15 min elapsed)
                  │
                  ├──────────► void       (validation failure)
                  │
                  └──────────► locked     (TERMINAL)
                                │
                                └─► never mutates again
                                    (pc_enforce_append_only trigger blocks it)
```

- TTL: `QUOTE_TTL_MIN = 15` minutes.
- Reuse: `pricing-quote` supersedes any active `quoted` row with the same
  `quote_context_key` (customer × provider × service × currency × start × duration × location fingerprint) before inserting the new one.
- Consumption: `lock_pricing_quote(booking_id, quote_id)` re-validates
  ownership, expiry, currency, provider, country, service and duration under
  `FOR UPDATE` row locks and flips the row to `locked`.
- Retries: `payment-create-intent` is idempotent — a re-submit with an
  already-locked quote returns the existing booking + PaymentIntent instead
  of creating duplicates (unique index `bookings_pricing_calculation_id_uniq`
  enforces this at the DB level). Stripe `Idempotency-Key = pi:quote:<uuid>`
  guarantees a single PaymentIntent per quote at the Stripe layer.

### Authoritative pricing formula

Split-fee model (unchanged from the approved Phase-1 spec):

```
subtotal        = round_half_away(clamped_rate_minor × hours_billed)
customer_total  = ceil (subtotal × (1 + customer_half_bps / 10000))
provider_net    = floor(subtotal × (1 − provider_half_bps / 10000))
platform_fee    = customer_total − provider_net
```

Static mode uses `provider_profiles.hourly_rate` as `base_rate_minor` and
sets provider min/max to the base rate (no adjustment surface). Dynamic
mode is still gated behind `dynamic_pricing.enabled` and applies deterministic
weekend / holiday / same-day / urgent surcharges within the provider's
declared min/max band. Recommended-rate advisory logic in the marketplace
pricing module stays advisory — it is **not** consumed by `pricing-quote`
in this phase.

### Migrations landed

| Migration | Effect |
| --- | --- |
| `20260721-123329-036554` | Drop `Customers insert own bookings` RLS policy. Add `bookings_pricing_calculation_id_uniq` partial unique index on `bookings.pricing_calculation_id`. |

No destructive change to existing rows; the drop of the INSERT policy takes
effect immediately — customer bookings must now flow through
`payment-create-intent`.

### Files changed

- `supabase/functions/pricing-quote/index.ts` — provider lookup by slug or
  uuid; provider-country becomes authoritative; static mode no longer gated
  by the dynamic-pricing feature flag; returns a fuller DTO for the
  checkout client.
- `supabase/functions/payment-create-intent/index.ts` — full rewrite. Zod
  schema drops all money fields. Loads and validates the quote, verifies
  ownership + expiry + currency, inserts booking, calls
  `lock_pricing_quote`, creates the PaymentIntent with quote-derived amount
  and quote-scoped Stripe idempotency. Idempotent replay path returns the
  existing booking + client_secret.
- `src/pages/BookingFlow.tsx` — checkout submit now (a) requests a
  `pricing-quote`, (b) invokes `payment-create-intent` with only the quote
  id and booking inputs. Client-side estimate remains for display only.

### RLS & RPC authorization

- `bookings` INSERT is now allowed only for `service_role` and `admin` roles
  (existing `Admins can manage all bookings` policy). Customer INSERT
  removed.
- `lock_pricing_quote` remains `SECURITY DEFINER` and callable by
  `service_role`; `payment-create-intent` is the sole caller in the customer
  flow.
- `pricing_calculations` table remains service-role-write / no direct client
  access; the append-only trigger (`pc_enforce_append_only`) still enforces
  monetary-column immutability after `locked`.

### Known limitations (P0.1)

1. `BookingFlow.tsx` still resolves providers from the local `getProvider`
   fixture registry. `pricing-quote` requires a matching `provider_profiles`
   row (by `provider_slug` or uuid); fixture providers without a DB row will
   receive `provider_not_found`. This is the intended behaviour until **P0.3**
   replaces fixture data with database-backed marketplace results. Test
   coverage that depends on fixture bookings must skip until P0.3 lands.
2. Provider display name / avatar shown at checkout is still client-derived
   (harmless — not authoritative for money).
3. `payment-create-intent` still relies on the `payment-mark-authorized`
   follow-up call from the client to promote `payment_status` from `unpaid`
   to `authorized`. Booking-state-machine hardening is P0.4.
4. Fixture-based bookings previously produced by tampering are not
   retroactively invalidated; ops should audit any recent `bookings` rows
   with `pricing_calculation_id IS NULL` before P1.

### Test matrix (P0.1)

Must all pass with real staging JWTs (Provider A, Provider B, Customer A,
Customer B, Admin, anon) — no service-role in any test row — before P0.1
can be marked production-ready. Harness scaffold lives in
`staging-validation/scenarios/`; new checks to add:

| # | Case | Expected |
| - | --- | --- |
| 1 | Body with tampered `customer_pays` | Field ignored (schema strip); PI amount = quote |
| 2 | Body with tampered `currency` | Field ignored; PI currency = quote |
| 3 | Body with tampered `provider_gets` | Field ignored; transfer = quote |
| 4 | Direct `INSERT INTO bookings` as customer JWT | `permission denied` (policy removed) |
| 5 | Direct `INSERT INTO pricing_calculations` as customer JWT | `permission denied` |
| 6 | `payment-create-intent` with expired quote | 400 `quote_expired` |
| 7 | `payment-create-intent` with another customer's quote | 403 `quote_not_owned` |
| 8 | `payment-create-intent` replay for same `quote_id` | Same `booking_id` + `payment_intent_id` returned; no duplicate row |
| 9 | Two parallel `payment-create-intent` calls for same quote | Exactly one booking; second returns idempotent response |
| 10 | Quote for `provider_preview` submitted to checkout | 400 `quote_context_invalid` |
| 11 | Quote with `currency` != country config currency | 400 `currency_country_mismatch` |
| 12 | `lock_pricing_quote` called twice for same booking | Second call raises `pricing_snapshot_already_locked` |
| 13 | Stripe PI amount vs. `quote.customer_total_minor` | Byte-exact match |
| 14 | Booking row `platform_fee_amount` vs. `quote.platform_fee_minor` | Byte-exact match |
| 15 | Booking row `pricing_calculation_id` uniqueness | Duplicate insert → `23505`, edge function returns idempotent path |

### Production gate — remaining requirements before opening

- Execute the 15-check matrix above with real JWTs (Provider A/B, Customer
  A/B, Admin, anon) via PostgREST + `functions.invoke`. Append signed
  results to this document under **§Evidence**.
- Stripe test-mode end-to-end: quote → intent → confirm → capture path
  produces booking with all money fields matching the quote.
- Concurrency test: 20 parallel invocations of `payment-create-intent`
  against a single quote → exactly one booking, one PaymentIntent, others
  return idempotent response.
- No unresolved critical / high findings from `security--run_security_scan`.

### Evidence

_(pending — populate after staging JWT run.)_

---

## P0.2, P0.3, P0.4, P0.5

**Not started.** Per approval terms, do not begin these sections until P0.1
evidence is signed off.
