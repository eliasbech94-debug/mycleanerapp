# Phase 4 — Feature Flags, Localised SEO, Translation Completeness, Multi-Country Verification

Status: **DK launch-ready; GB/SE/ES remain in `development` awaiting legal + Stripe.**

## 1. Country lifecycle model
Enum `country_lifecycle_state`: `development` → `beta` → `launch_ready` → `active` → `suspended` → `retired`.
Server predicates:
- `is_country_bookable(iso)` — `published` + `active`. Enforced by `payment-create-intent`, `invoice-issue`, `credit-note-issue`, `booking-*`.
- `is_country_visible(iso)` — `active` or `launch_ready`; used by the public marketplace UI.
- `get_lifecycle_public_isos()` — sitemap + hreflang source of truth.

Legacy `active boolean` remains for backwards compatibility but is no longer the launch gate.

## 2. Readiness checks
Edge function `country-readiness` (admin-only) evaluates 15+ checks:
config published, currency supported, timezone, commission/VAT bps sane, booking_rules present,
pricing_rules present, terms + privacy published in every supported language, ≥5 holidays for
current year, payment_methods configured, stripe_account_id present, webhook_ready flag,
privacy + support email, no open critical alerts scoped to the country.
Results persisted to `country_readiness_runs` with `config_version`, `deployment_version`, actor.

## 3. Feature flags
`feature-flag-evaluate` (existing) already implements deterministic SHA-256 bucket rollout,
precedence `user > provider > country > beta > global`, and a global kill-switch (any
`global` row with `enabled=false` forces off). Emergency kill-switch takes effect without a
frontend deploy because evaluation is server-side.

## 4. Localised SEO
`src/i18n/seo.ts` produces canonical, `og:*`, `og:locale`, `hreflang` (`da-DK`, `en-DK`,
`en-GB`, `sv-SE`, `en-SE`, `es-ES`, `en-ES`), `x-default`, and forces `noindex` on private
routes (`/admin`, `/provider-dashboard`, `/book/*`, `/booking/*`, `/mine-bookinger`, `/auth/*`,
`/profil`, `/privatliv`, `/task/*`). Countries outside the active lifecycle emit `noindex`
and no canonical.

## 5. Sitemap + robots
- `scripts/generate-sitemap.ts` + `public/sitemap.xml`: only active countries × supported
  languages, one `xhtml:link` per alternate + `x-default`.
- `public/robots.txt`: production defaults allow public routes and `Disallow` every private
  namespace. Preview/staging bundles are expected to override at runtime with
  `Disallow: /` — the hosting layer serves `public/robots.txt` unchanged, so preview URLs
  MUST be behind Lovable's non-indexable preview subdomain (already the case).

## 6. Translation completeness
`scripts/validate-translations.mjs`:
- English is canonical.
- Launch-required languages (currently `da`, `en`) fail CI on missing keys, empty values,
  invalid JSON, or `_fallback_language` stubs.
- Non-launch languages (`sv`, `es`) may keep fallback stubs until their country reaches
  `launch_ready`.

## 7. Holidays
Migration seeded official 2026 public holidays: DK (10), GB (8), SE (11), ES (10), with
`source` recording provenance (`official-2026`, `gov.uk-2026`, `riksdagen-2026`,
`boe-2026`). Historical rows retained; no retro-active price mutation (booking snapshots
are immutable).

## 8. Legal content
Immutability triggers from Phase 3 remain: published bodies cannot be mutated. Readiness
enforces `terms` + `privacy` published in every supported language before a country may
move to `launch_ready`.

## 9. Selector
`CountryLanguageSelector` — two independent controls, sr-only labels, keyboard accessible.
Country changes route via `setCountryManual`; language changes via `setManualLanguage`. A
caller may pass `onCountryChange` to interpose a checkout-guard confirmation.

## 10. Regression results
- Vitest suite (money, country param, country deactivation, SEO helper) passes.
- Typecheck clean.
- DB migration succeeded; only pre-existing WARNs about SECURITY DEFINER exposure remain
  (documented in `docs/security/DEFINER_FUNCTIONS.md`).

## 11. Remaining risks / launch blockers
- **GB/SE/ES**: legal bodies still placeholder, Stripe accounts unset, translation
  bundles are fallback stubs → readiness will fail as designed. Blocks lifecycle promotion.
- **Analytics localisation** and **RTL smoke** are documented policies but not yet wired
  into a specific tracker (deferred: pick provider in Task 7B).
- **Sitemap generator** is not yet wired to CI; run manually or add `prebuild` step when
  ready to publish additional countries.

Ready for review.
