# International Accounting Engine — Phase 1–4

Status: implemented in the frontend/library layer. Database migration and the
authoritative edge function are **proposals only** and are not applied.

## Principles

1. **No Danish defaults.** Nothing in `src/lib/accounting/` hardcodes a country,
   rate, threshold, deduction, currency or label. Every legal value comes from a
   country rule pack.
2. **Rule packs are versioned.** A pack is `(country_code, rule_pack_version)`
   with `effective_from` / `effective_to`. A closed period keeps the frozen
   version, so later rule changes never silently recompute history.
3. **A pack must be published and verified.** Draft, empty, unverified,
   not-yet-effective and expired packs are all refused, and the UI says the
   amount cannot be calculated.
4. **Minor units only.** All money is integer minor units. Conversion uses a
   stored decimal rate with a fixed scale and half-up rounding, and every
   converted amount carries rate, rate date and source.
5. **Nothing is auto-approved.** AI suggestions are `review_required` until the
   provider confirms them. Unknown categories, undocumented items and unknown
   cross-border treatment are excluded from the amount and listed for review.
6. **Not tax advice.** Every surface renders the disclaimer, and the term used
   is "foreløbigt beløb til registrering", never "your tax".

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Types | `src/lib/accounting/types.ts` | Rule pack, profile, ledger, result contracts |
| Money | `src/lib/accounting/money.ts` | Integer math, conversion, basis points |
| Resolver | `src/lib/accounting/jurisdiction.ts` | Which country and which pack version |
| Rules | `src/lib/accounting/ruleEngine.ts` | Mixed use, mileage bands, indirect tax treatment |
| Calculation | `src/lib/accounting/calculate.ts` | Preliminary amount + explanation + review list |
| UI | `src/components/accounting/` | Presentation only, all labels from the pack |
| Page | `src/pages/provider/ProviderAccounting.tsx` | Calls the authoritative backend |
| Preview | `src/dev/ProviderAccountingPreview.tsx` | Dev-only, fixture cases A–H + US |

## Authoritative calculation

`ProviderAccounting.tsx` calls the `accounting-calculate` backend function and
renders its result. It performs no tax logic itself. When the function is not
provisioned, the page states that the amount cannot be calculated yet — it never
falls back to a client-side number. The shared library is what the edge function
is intended to run, so the client and server agree by construction.

## Preview cases

A DK sole trader (not indirect-tax registered) · B SE registered · C GB ·
D DE company · E ES · F country without a rule pack · G conflicting countries ·
H unknown registration status · US sales-tax country.

The preview route is only registered when `isDevPreviewEnabled()` and is
lazy-loaded, so fixtures never reach the production entry bundle. Every fixture
pack is marked `sampleOnly`, which renders a testdata warning.

## Proposed backend

- `scripts/staging-required/accounting/migration-001.proposed.sql` — additive
  columns on `provider_tax_profiles` and `provider_receipts`, plus
  `accounting_rule_packs` and `accounting_periods` with GRANTs and RLS.
- Migrated legacy rows get `profile_requires_review = true`, which blocks
  calculation until the provider re-confirms country and registration type.
