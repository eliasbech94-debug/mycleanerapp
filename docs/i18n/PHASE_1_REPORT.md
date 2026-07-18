# Task 8 — Phase 1 report

## Migration summary
- **country_configs** — server-authoritative, uppercase-normalised ISO. Columns: iso, active, launch_status (`development|beta|launch_ready|active`), default_language, supported_languages[], currency, timezone, commission_bps, vat_rate_bps, stripe_account_id, config_version, status (`draft|published|archived`), published_at, published_by, config (JSONB). CHECK constraints enforce ISO 2-letter uppercase, currency uppercase, default language ∈ supported_languages, commission/VAT within 0–10000 bps.
- **country_configs_public** — VIEW with `security_invoker = true`. Exposes only allowlisted fields (iso, active, launch_status, languages, currency, timezone, booking_public, payment_methods_public, contact_public, feature_availability_public, legal_references_public). WHERE `status = 'published' AND active = true`. Stripe IDs, commissions, VAT bps, and any other private field are NOT part of the view.
- **legal_documents** — versioned per (kind, country, language, version). Explicit `status` (`draft|scheduled|published|superseded|archived`). Trigger `legal_documents_enforce_immutable` blocks body/kind/country/language/version/published_at changes and DELETE once status ∈ (published, superseded); status may only transition to superseded/archived.
- **user_legal_acceptances** — append-only ledger. Trigger `user_legal_acceptances_append_only` blocks UPDATE/DELETE. Captures user_id, document_id, country, language, version, document_hash, accepted_at, ip, user_agent, source. No synthetic backfill.
- **feature_flags** — scoped (`global|country|provider|user|beta`) with `rollout_pct` + `rollout_seed` for deterministic hash-based percentage rollout.
- **profiles** — added `marketplace_country`, `ui_language`, `language_manual`, `country_manual`, `legal_acceptance_required`. Marketplace country and UI language are stored **separately** (a user can browse SE in EN or DK in ES).

## Public / private configuration boundary
| Field | View (`country_configs_public`) | Table (`country_configs`) |
|-------|--------------------------------|---------------------------|
| iso, active, launch_status | ✅ anon | admin/authenticated |
| default_language, supported_languages | ✅ anon | admin/authenticated |
| currency, timezone | ✅ anon | admin/authenticated |
| `config -> booking_public` | ✅ anon (subset) | admin/authenticated (full) |
| `config -> payment_methods_public` | ✅ anon | admin/authenticated |
| `config -> contact_public` | ✅ anon | admin/authenticated |
| `config -> feature_availability_public` | ✅ anon | admin/authenticated |
| `config -> legal_references_public` | ✅ anon | admin/authenticated |
| commission_bps, vat_rate_bps | ❌ | authenticated read only |
| stripe_account_id | ❌ | authenticated read only |
| Internal thresholds / fraud / verification / operational fields (kept inside `config` under private keys) | ❌ | admin only |
| Stripe secrets, webhook secrets | ❌ never in DB — stored in edge-function secrets |

## Seed verification
`select iso, active, launch_status, default_language, supported_languages, currency, status from public.country_configs order by iso;`

| iso | active | launch_status | default | supported | currency | status |
|-----|--------|---------------|---------|-----------|----------|--------|
| DK  | true   | active        | da      | {da,en}   | DKK      | published |
| ES  | false  | development   | es      | {es,en}   | EUR      | draft |
| GB  | false  | development   | en      | {en}      | GBP      | draft |
| SE  | false  | development   | sv      | {sv,en}   | SEK      | draft |

Only DK is anonymously visible via `country_configs_public`. GB/SE/ES remain admin-only until published+active.

## RLS & grants matrix
| Table | anon | authenticated | service_role |
|-------|------|---------------|--------------|
| country_configs | — | SELECT (published+active) / admin ALL | ALL |
| country_configs_public (VIEW) | SELECT | SELECT | SELECT |
| legal_documents | SELECT (published & effective_at ≤ now) | same + admin ALL | ALL |
| user_legal_acceptances | — | SELECT/INSERT own; admin SELECT all | ALL |
| feature_flags | — | SELECT / admin ALL | ALL |

## i18n structure
- Library: `react-i18next` + `i18next-http-backend`.
- Namespaces: `common`, `booking`, `finance`, `admin`, `legal`, `provider`, `customer`.
- Bundles: `/public/locales/{lng}/{ns}.json`, lazy-loaded per namespace on first use.
- Languages: **da**, **en** complete in phase 1. **sv**, **es** scaffolded with English fallback (explicit `_fallback_language: "en"` marker in each file).
- Resolver order (deterministic, no i18next-browser-languagedetector auto-magic): manual choice → profile.ui_language → URL country default language → browser locale → `en` fallback.
- Manual selection sets `localStorage.mc.language.manual="true"` and cannot be silently overridden.
- `interpolation.escapeValue: false` because React escapes; translation files contain no HTML.

## Legal-document versioning behaviour
- New document created as `draft`. Body may be edited freely.
- Transition to `published` snapshots `body_md` + `body_hash` — trigger then blocks any mutation of body/kind/country/language/version/published_at and DELETE.
- Corrections require inserting a **new version**; old row transitions to `superseded` (allowed) or `archived`.
- Anonymous SELECT only sees rows where `status = 'published' AND effective_at ≤ now()`.
- Acceptance recording captures the row's immutable `body_hash` so the ledger proves what the user actually saw.

## Verification checklist (Phase 1)
- [x] DK/GB/SE/ES seeded; codes uppercase; `sv` (not `se`) used as Swedish language code.
- [x] Anonymous users cannot read private fields (view + RLS enforce).
- [x] Admins can read/update drafts; published-config immutability enforced by triggers on legal docs.
- [x] Schema-level validation: CHECK constraints on ISO, currency, language pattern, bps ranges, default_language ∈ supported_languages.
- [x] Only published+effective legal documents publicly readable.
- [x] Published legal doc body immutable; new version required for corrections.
- [x] No synthetic legal acceptance; existing users get `legal_acceptance_required` flag (default false — flipped to true only when a country's active legal-doc version bumps in later phase).
- [x] DA + EN bundles load lazily; SV + ES fall back to EN.
- [x] Manual language choice persists via `mc.language.manual` flag; detector cannot override.
- [x] Language and marketplace country stored separately on profiles.
- [x] `country_configs_public` is `security_invoker` — RLS runs under querying user.
- [x] Existing Denmark flows unchanged (no reads swapped yet — Phase 2 will migrate `platform_tax_settings` reads).
- [x] Typecheck passes (see build output).

## Remaining risks
1. **Existing SECURITY DEFINER helper warnings** (12) are pre-existing (has_role, tax_encrypt, etc.) — unrelated to Phase 1, will be reviewed in the security audit.
2. **`country_configs_public` view depends on `config` JSONB shape.** Admin console (Phase 3) must validate submitted JSON against a Zod schema so admins can't accidentally hide public keys.
3. **Non-DK Stripe accounts** — GB/SE/ES remain non-launchable until real Connect accounts are provisioned. Enforced by Phase 3 "launch_ready" gate that checks `stripe_account_id` presence + readiness probe.
4. **Legacy `countries.ts` list** still referenced by 12+ EU countries beyond the launch four. Phase 2 replaces those reads with `useCountry()` — Phase 1 kept the file untouched to avoid regressing existing screens.
5. **RTL** — plumbing supports `<html dir>` swap but no RTL bundle ships in Phase 1; will validate mechanically in Phase 4.

## Stop for review before Phase 2.
