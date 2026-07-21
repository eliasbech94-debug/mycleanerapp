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

_(pending — populate after the authenticated staging run has completed.)_

---

## §Evidence — P0.1 Authenticated Staging Run

> **Status placeholder — DO NOT EDIT MANUALLY.**
> This section is regenerated from `staging-validation/evidence/<run-id>/reports/rc2.json`
> after `bun run rc2:p0.1` (or `./run-rc2.sh --server-only`) completes against
> the real staging environment. Until a real run occurs, every result MUST
> remain `UNVERIFIED — awaiting authenticated staging run`. Do not use
> placeholder PASS values.

**Execution timestamp:** `UNVERIFIED — awaiting authenticated staging run`
**Environment identifier:** `UNVERIFIED — awaiting authenticated staging run`
**Commit SHA:** `UNVERIFIED — awaiting authenticated staging run`
**Migration version:** `20260721-123329-036554`
**Harness scenario:** `staging-validation/scenarios/16-p0-pricing-checkout.ts`
**Machine-readable results:** `staging-validation/evidence/<run-id>/reports/rc2.json`

### Identity provisioning

| Slot        | Email                                | Provisioning | Auth OK |
| ----------- | ------------------------------------ | ------------ | ------- |
| Customer A  | `rc2-customer@<TEST_EMAIL_DOMAIN>`   | UNVERIFIED   | UNVERIFIED |
| Customer B  | `rc2-customer-b@<TEST_EMAIL_DOMAIN>` | UNVERIFIED   | UNVERIFIED |
| Provider    | `rc2-provider@<TEST_EMAIL_DOMAIN>`   | UNVERIFIED   | UNVERIFIED |
| Admin       | `rc2-admin@<TEST_EMAIL_DOMAIN>`      | UNVERIFIED   | UNVERIFIED |
| Anonymous   | _(no seed)_                          | n/a          | UNVERIFIED |

All non-anonymous identities are seeded through `admin.auth.admin` (mirrors
`01-seed.ts`) and authenticate to obtain a real user JWT via
`signInWithPassword` against the anon client. JWTs are held in memory only —
never written to `evidence/`.

### 15-check matrix

| # | Check | Path exercised | Identity | Expected | Result |
| - | --- | --- | --- | --- | --- |
| 01 | Valid DB provider receives a quote | `POST /functions/v1/pricing-quote` | Customer A | 200 + `quote_id` | UNVERIFIED |
| 02 | Fixture / unknown provider rejected | `POST /functions/v1/pricing-quote` | Customer A | 400 `provider_not_found` | UNVERIFIED |
| 03 | Client-supplied currency cannot influence quote | `POST /functions/v1/pricing-quote` | Customer A | 400 `currency_country_mismatch` | UNVERIFIED |
| 04 | Quote currency = provider market currency | quote response | Customer A | equal | UNVERIFIED |
| 05 | `dynamic_pricing.enabled` remains false | `feature_flags` read (evidence inspection) | service_role_evidence_inspection | `false` | UNVERIFIED |
| 06 | Dynamic surcharges disabled → `pricing_mode = "static"` | quote response | Customer A | `static` | UNVERIFIED |
| 07 | Quote row matches split-fee invariant + expected provider/country/currency | `pricing_calculations` read (evidence inspection) | service_role_evidence_inspection | invariant holds | UNVERIFIED |
| 08 | Customer B cannot use Customer A's quote | `POST /functions/v1/payment-create-intent` | Customer B | 403 `quote_not_owned` | UNVERIFIED |
| 09 | Anonymous rejected | `POST /functions/v1/payment-create-intent` | Anonymous | 401 | UNVERIFIED |
| 10 | Expired quote rejected | `POST /functions/v1/payment-create-intent` | Customer A | 400 `quote_expired` | UNVERIFIED |
| 11 | Tampered `customer_pays` / `provider_gets` / `currency` / `platform_fee` / `commission` in body have no effect | `POST /functions/v1/payment-create-intent` | Customer A | ignored (schema strip) or 400; no effect on money | UNVERIFIED |
| 12 | Booking money fields byte-exact match locked quote | `bookings` read (evidence inspection) | service_role_evidence_inspection | equal | UNVERIFIED |
| 13 | Stripe PI `amount` == `pricing_calculations.customer_total_minor` | `GET /v1/payment_intents/<id>` | Stripe test key (labelled) | equal + currency match | UNVERIFIED |
| 14 | Repeated intent request returns same `booking_id` + `payment_intent_id` (Stripe `Idempotency-Key: pi:quote:<quote_id>`) | `POST /functions/v1/payment-create-intent` ×2 | Customer A | identical ids | UNVERIFIED |
| 15 | `bookings_pricing_calculation_id_uniq` → exactly one booking per quote | `bookings` count (evidence inspection) | service_role_evidence_inspection | `count = 1` | UNVERIFIED |

Bonus (RLS regression, mandated by brief):

| # | Check | Path | Identity | Expected | Result |
| - | --- | --- | --- | --- | --- |
| B1 | Direct `POST /rest/v1/bookings` as customer denied | PostgREST | Customer A JWT | 401/403 or RLS message | UNVERIFIED |
| B2 | `dynamic_pricing.enabled` still false after scenario | `feature_flags` read | service_role_evidence_inspection | `false` | UNVERIFIED |

### Totals

- Passed: `UNVERIFIED`
- Failed: `UNVERIFIED`
- Skipped: `UNVERIFIED`
- Blocked: `UNVERIFIED`

### Artifact paths

- Redactor self-check: `evidence/<run-id>/p0-pricing-checkout/00-redactor-selfcheck.json`
- Identity matrix (JWTs omitted): `evidence/<run-id>/p0-pricing-checkout/01-identities.json`
- HTTP transcripts (all redacted): `evidence/<run-id>/http/*.json`
- Quote row evidence: `evidence/<run-id>/p0-pricing-checkout/07-quote-row.evidence.json`
- Booking row evidence: `evidence/<run-id>/p0-pricing-checkout/12-booking-row.evidence.json`
- Stripe PI summary (no client_secret): `evidence/<run-id>/p0-pricing-checkout/13-stripe-pi.summary.json`
- Booking uniqueness evidence: `evidence/<run-id>/p0-pricing-checkout/15-booking-count.evidence.json`
- Feature-flag regression evidence: `evidence/<run-id>/p0-pricing-checkout/regression-flag.evidence.json`
- Machine-readable results: `evidence/<run-id>/reports/rc2.json`
- Harness Markdown roll-up: `evidence/<run-id>/report.md`

### Redaction confirmation

The scenario runs a redactor self-check **before** issuing any network call.
It fails the scenario before writing any evidence if any of the following
canaries leak through `redactHeaders` / `redactValue`:

- JWTs (`eyJ...`)
- Stripe secret keys (`sk_test_…` / `sk_live_…`)
- Stripe publishable keys (`pk_...`)
- Stripe webhook secrets (`whsec_...`)
- Stripe PaymentIntent client secrets (`pi_*_secret_*`)
- Stripe Checkout Session secrets (`cs_...`)
- `Bearer …` Authorization values
- `Authorization` / `apikey` / `Cookie` / `Set-Cookie` header values
- `STAGING_SUPABASE_SERVICE_ROLE_KEY` (and other env-registered secrets)

All HTTP calls flow through `staging-validation/lib/http.ts` →
`staging-validation/lib/redact.ts`. Payment-intent inspection reads only
`{id, amount, currency, capture_method, metadata}` — `client_secret` is
never persisted to `evidence/`.

### Service-role usage declaration

The service-role key is **not** used for any user authorization assertion.
Every user assertion is executed with the anon key + user Bearer JWT (or no
bearer for the anonymous check), exactly like the browser.

Service-role access is limited to (and clearly labelled in
`evidence/reports/rc2.json`):

1. Identity upsert (`admin.auth.admin`) — mirrors `01-seed.ts`; idempotent;
   never runs against production (hard-blocked by `config.ts`).
2. Provider discovery (`provider_profiles` read) — required to pick an
   existing bookable provider without fabricating one.
3. Evidence inspection reads of `pricing_calculations`, `bookings` and
   `feature_flags` — labelled `service_role_evidence_inspection` in every
   artefact.
4. Forcing the "expired quote" test row's `expires_at` into the past.

### Discrepancies

`UNVERIFIED — awaiting authenticated staging run`

### Production-readiness conclusion

`UNVERIFIED — awaiting authenticated staging run`

P0.1 status remains: **"Implemented in staging — authenticated checkout
evidence pending."** Do not begin P0.2 until every critical check above is
observed to pass in a real run and the discrepancies section is empty.

### How to execute this appendix

```bash
cd staging-validation
cp .env.example .env   # fill in STAGING_* + STRIPE_TEST_* + TEST_PASSWORD
bun install
bun run rc2:p0.1        # scenario 16 in isolation
# or:
bun run rc2             # full server-only suite including scenario 16
```

Expected outputs (paths shown relative to `staging-validation/`):

```
evidence/<run-id>/http/*.json                              (redacted transcripts)
evidence/<run-id>/p0-pricing-checkout/*.json               (evidence rows)
evidence/<run-id>/reports/rc2.json                         (machine-readable)
evidence/<run-id>/report.md                                (harness roll-up)
evidence/<run-id>/report.json                              (harness roll-up)
```

### Prerequisites still missing before execution

- `staging-validation/.env` populated with real STAGING_* + STRIPE_TEST_* +
  TEST_EMAIL_DOMAIN + TEST_PASSWORD (never checked in; never pasted here).
- At least one `provider_profiles` row on staging with
  `status='active'`, `visibility='public'`, non-null `hourly_rate` and a
  non-empty `service_categories` array. Produced by scenarios 01–02;
  scenario 16 marks itself `BLOCKED` (not `FAIL`) if this is absent.
- `get_published_country_config` returns a launched row for that
  provider's `country_code`.

---

## P0.2, P0.3, P0.4, P0.5

**Not started.** Per approval terms, do not begin these sections until P0.1
evidence is signed off.

