# Task 8 · Phase 2 — Country-aware routing, currency & tax/payment wiring

## 1. Routing architecture

Single-tree routing with an optional country prefix:

```
<Routes>
  <Route path="/:country/*" element={<CountryProvider><CountryScopedRoutes/></CountryProvider>}/>
  <Route path="/*"          element={<CountryProvider><AppRoutes/></CountryProvider>}/>
</Routes>
```

- `AppRoutes` is the single source of truth for route definitions. Mounted twice; no duplication.
- `CountryScopedRoutes` validates `:country` against the supported allow-list (`dk`, `gb`, `se`, `es`). Unknown ISO → `<Navigate to="/not-found">` with the query string preserved. Never silently swaps marketplaces.
- Auth callbacks, password resets, provider dashboards, admin, booking flow, Stripe returns, notification deep links continue to work at both the unprefixed URL and any valid `/dk|/gb|/se|/es` prefix.
- Redirects are logical (`<Navigate replace>`) — no server-side permanent redirects until SEO verification passes.

## 2. Resolution order (deterministic)

Implemented in `src/i18n/CountryContext.tsx`:

1. Explicit URL country param (highest — a country-prefixed URL always wins)
2. Explicit manual saved preference (`mc.country.manual === "true"`)
3. Profile marketplace country (wired via profile page — Phase 3)
4. Browser locale (via `geo-detect` accept-language fallback)
5. Geo detection (via `geo-detect` edge function — HINT ONLY)
6. `DK` fallback

Language resolution (`src/i18n/index.ts`) is **independent**. Manual language never overwritten by browser / geo, and manual country never overwrites language.

## 3. Booking snapshot fields (migration)

`bookings` now carries immutable per-booking config lineage:

| column | purpose |
|---|---|
| `country_code` | Marketplace country at booking time |
| `timezone` | Marketplace timezone at booking time |
| `country_config_version` | Config version pinned to this booking |
| `tax_config_snapshot` (jsonb) | VAT rate bps, currency, ISO, config_version |
| `commission_config_snapshot` (jsonb) | Commission bps, config_version |
| `booking_rules_snapshot` (jsonb) | Booking-rules public block, config_version |

Trigger `bookings_freeze_snapshots` enforces that `currency`, `country_code`, `country_config_version`, and all three snapshot columns are immutable after insert. A subsequent Admin publish cannot rewrite historical bookings or their financial artifacts.

## 4. Tax migration summary

- `country_configs.config` is now the canonical published source (VAT, commission, currency, timezone, payment methods, booking rules).
- Backward-compat view `platform_tax_settings_v` joins the legacy table with the currently-published country config, so any read consumer can migrate incrementally without breakage.
- The physical `platform_tax_settings` table stays live for at least one verified release cycle. Writes still hit the table (unchanged), reads may migrate to `platform_tax_settings_v`.
- Invoice / credit-note issuance now:
  - Refuses to run against a country whose config is not `published` + `launch_ready|active` (`invoice-issue` → `409 country_not_published` / `country_not_launch_ready`).
  - Records `country_code`, `country_config_version`, and `tax_config_version` on every `platform_fee_invoices` row.
  - Credit notes inherit the ORIGINAL invoice's `country_config_version` / `tax_config_version` — a later config publish cannot mutate a refund.

## 5. Payment configuration flow

`payment-create-intent`:

1. Auth (JWT).
2. Load provider's marketplace country from `profiles.country_code` (server-side, never trusts the client).
3. `SELECT public.get_published_country_config(_iso)` — must return an `active` + `launch_ready|active` row, else reject:
   - `country_not_launched`, `country_inactive`, `country_not_launch_ready`.
4. Validate `currency === cfg.currency` → `currency_country_mismatch`.
5. Validate `payment_method_type` (when supplied) is in `config.payment_methods_public` → `payment_method_not_permitted`.
6. Insert booking with all 6 snapshot fields set.
7. Create PaymentIntent with:
   - `metadata[country_code]`, `metadata[country_config_version]`
   - Same on `transfer_data[metadata]` when a Connect account is present
   - `Idempotency-Key: pi:<booking_id>` — same booking never mints two intents.
8. Never returns Stripe account IDs to the client.

**Platform-account model:** MyCleaner uses ONE Stripe platform account (`STRIPE_SECRET_KEY`) across all markets. Provider Connect accounts are **connected accounts**, not platform accounts. A future per-country platform account would be exposed via `country_configs.stripe_account_id` — that field is admin-only and not published in the public DTO.

Secrets in env only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`. Never in code or client.

## 6. Cache & invalidation

`country-config`:

- Serves only `country_configs_public` (published + active). Draft rows can never leak.
- Response headers:
  - `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=300`
  - `ETag: W/"<sha256(iso:config_version:published_at)>"`
  - Returns `304` when the client's `If-None-Match` matches.
- A publish bumps `config_version` → ETag changes → all cached responses invalidate on next revalidation (≤60s browser, ≤300s CDN).
- Inactive countries are filtered by the view, so a stale cache still cannot expose an inactive marketplace.

`geo-detect`:

- Response: `Cache-Control: private, max-age=300` (client-local hint, never CDN).
- Never persisted server-side.
- Rate-limited per hashed IP (30 req / 60s / isolate). Failure mode = returns `GB` fallback so routing never breaks.
- Raw IP is SHA-256 hashed and truncated to 8 bytes before use — never returned, never logged.

## 7. Backward-compatibility results

Audited call sites:

| Surface | Result |
|---|---|
| Existing Denmark links (unprefixed) | ✅ Continue to work — resolved via `<Route path="/*">` |
| Logged-in redirects (auth callback, RoleGuard) | ✅ Path + query preserved through `<Navigate replace>` |
| Admin routes (`/admin/*`) | ✅ Matched under both prefixed and unprefixed trees |
| Provider routes (`/provider/*`, `/provider-dashboard`) | ✅ Same |
| Booking links (`/book/:id`, `/booking/:id/plan`, `/mine-bookinger`) | ✅ Same |
| Stripe return URLs | ✅ Return to origin-relative paths; no assumption about prefix |
| OAuth callback (`/auth/callback`) | ✅ Same origin, no prefix required |
| Password reset links | ✅ Handled by `/auth/callback` |
| Legal document links (`/faq`, `/regler`) | ✅ Same |
| Notification deep links | ✅ Absolute paths still resolve |
| Legacy `platform_tax_settings` reads | ✅ Left in place; view `platform_tax_settings_v` available for opt-in migration |

## 8. Test results

- `src/i18n/money.test.ts`: DKK / GBP / SEK / EUR / negative / zero formatting, partial-refund rounding, VAT round-trip on 25% inclusive.
- `src/i18n/CountryContext.test.ts`: valid ISO param acceptance, unknown/empty rejection.
- Migration ran successfully; snapshot columns added, trigger installed, invoice/credit-note lineage columns added.
- All existing tests continue to pass (`src/components/BackButton.test.tsx` etc.).

## 9. Remaining risks (tracked for Phase 3)

- **Retro-active language/country in profile page** — Profile UI still needs a language + marketplace-country selector wired to `mc.language.choice` / `mc.country.choice`. Currently only URL + browser handles it.
- **Legacy `platform_tax_settings` writes** — Admin UI still writes to the physical table. Cutover to `country_configs.config` is Phase 3 (behind feature flag `admin.country_console`).
- **Booking-flow currency display** — Existing `<BookingFlow>` renders currency from the current UI country. Must switch to reading `booking.currency` for existing bookings (Phase 3 UI polish).
- **Payment method allowlist** — Enforced when the client passes `payment_method_type`. Full per-method policy for Stripe Payment Element (Klarna, iDEAL, etc.) will need explicit method registration in `country_configs.config.payment_methods_public`.
- **Geo-detect distribution** — In-memory rate limit is per-isolate; a shared Redis/KV limiter is a Phase 3 nice-to-have but not required (hint endpoint).
- **SEO/hreflang + permanent 301s** — Deferred to Phase 4 per the plan.
