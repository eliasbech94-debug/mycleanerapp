# Phase 3 — Country Booking Rules, Legal Documents and Admin Country Console

## Phase 2 cache-hardening close

**Approach chosen: option 3 — split responsibilities.**

- `country-config` (versioned, cacheable ≤60s browser / 300s CDN + SWR) —
  serves the public DTO for UI convenience.
- `country-status` (`Cache-Control: no-store`) — authoritative pre-checkout
  gate. Reads `is_country_launch_ready(iso)` RPC directly.
- Every server-side write path (`payment-create-intent`, `invoice-issue`,
  `credit-note-issue`, admin publishes) calls `get_published_country_config` /
  `is_country_launch_ready` *at request time*. A stale frontend snapshot
  can never override server-side status.

**Documented staleness:** frontend UI may lag reality by up to 60 s
(browser cache) + 300 s (shared CDN, SWR window). All money-moving
operations are consistent within one request.

**Test:** `src/i18n/countryDeactivation.test.ts` simulates a browser with a
cached active DK config and confirms the server-side gate still rejects
the booking after deactivation.

---

## Configuration versioning model

- `country_configs` holds the current row per ISO.
- `country_config_versions` receives an immutable snapshot on every
  publish (trigger `country_configs_publish_snapshot`).
- Optimistic concurrency: caller must submit `expected_version`;
  a mismatch returns HTTP 409 with a clear conflict message.
- Rollback = republish an older snapshot as a *new* version. Previous
  versions are never deleted while referenced by bookings, invoices,
  credit notes or legal acceptances.
- Publishing is idempotent via `Idempotency-Key`.

## Booking-rule structure

Defined in `src/lib/bookingRules.ts` (Zod). Stored in
`country_configs.booking_rules` JSONB. Includes: min notice, same-day
availability + surcharge, weekend/holiday surcharges, min/max duration,
max distance, provider default radius, cancel deadlines, cancel
consequences, auto-accept, request expiry, reschedule cap, service
categories, operating days/hours. Server-side validation is
authoritative; the client schema is advisory. New bookings snapshot
`booking_rules_snapshot` at creation (see Phase 2 trigger).

## Pricing and surcharge order

`stack_order` (default): `base → same_day → weekend → holiday →
customer_discount → customer_addon → commission → vat`. Rounding at each
stage in minor units (integers). Platform-funded discounts reduce
commission only; customer-funded discounts reduce provider payout
proportionally. **The 28% split is unchanged unless a new published
config sets otherwise; existing bookings are never repriced.**

## Holiday-calendar implementation

`country_holidays` table: country, date, name, `surcharge_eligible`,
`active`, `source`, generated `year`, optional `region`. Public read
allowed (`active=true`); admins mutate. Booking uses the marketplace
country's timezone for date boundaries. Corrections to the calendar
never re-run financial calculations against existing bookings — they
travel with their frozen snapshots.

## Admin Country Console

`/admin/countries` (`src/pages/admin/CountryConsole.tsx`):
17 sections (Overview, Publication, Languages, Currency & timezone,
Booking rules, Pricing & commission, VAT & tax wording, Payment methods,
Stripe readiness (read-only, no secrets), Identity verification,
Notifications, Holidays, Legal documents, Feature flags, Public contact,
History, Audit). All writes route through `admin-country-publish`;
sensitive JSONB is never written directly from the browser.

## Legal document + Legal Gate workflow

Lifecycle: **draft → scheduled → published → superseded → archived**.
`legal_documents` extended with `title`, `summary_md`, `required`,
`fallback_to_english`, `scheduled_publish_at`. Uniqueness enforced by
partial index: one effective published version per
`(kind, country, language)`. The existing immutability trigger keeps
published bodies frozen.

`legal-gate-status` returns pending required documents for the
authenticated user; `legal-accept` records an explicit acceptance with
IP + user-agent + source. `src/components/legal/LegalGate.tsx` renders
the blocking dialog and never records acceptance until the user
confirms.

## Feature-flag administration

`feature-flag-evaluate` evaluates flags server-side with priority
`user → provider → country → global`. Deterministic rollout via
`SHA-256(seed | subject) mod 100 < rollout_pct`. Global `enabled=false`
row = kill switch. Server-guarded functionality never reads a
client-side flag alone.

## Security and concurrency review

- Optimistic concurrency: `country_configs_publish_snapshot` compares
  `NEW.config_version` to `OLD.config_version` and raises
  `country_config_conflict` on mismatch.
- Idempotency: `admin-country-publish` accepts `Idempotency-Key`,
  stamps it into the snapshot, and returns the previous result on
  replay.
- Publish locking: `admin_country_locks` table (admin-only) for
  soft lock UX. DB trigger + expected_version is the hard guarantee.
- Audit: every publish writes to `admin_audit_log` (append-only).
- Sensitive fields (Stripe secret, webhook secret, tokens) never
  leave the backend — the console displays readiness booleans only.

## Regression-test results

- `bun vitest run src/i18n/` — 3 files, 15 tests passing (money,
  country context, deactivation).
- `tsgo --noEmit` — clean.
- Existing DK booking / invoice / credit-note code paths unchanged;
  only new columns added, defaults preserved.

## Remaining risks

- `LegalGate` currently references a placeholder document body — wire
  in the real `body_md` fetch (edge function) before user-facing launch.
- Admin console tabs beyond Overview / Currency / Pricing / Booking
  rules are placeholders that must be built out for GB/SE/ES launch.
- Holiday-calendar seed data for GB/SE/ES not yet populated.
- Publish trigger currently allows draft→published in one write; a
  separate `preview` endpoint should render the diff before submit
  (recommended for Phase 4).
