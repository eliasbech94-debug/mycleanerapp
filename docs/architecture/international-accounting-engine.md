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

## External income (other platforms, own customers, cash)

Providers can register income earned outside MyCleaner. The rules are rule-pack
driven — nothing about recognition, documentation, cash or platform fees is
hardcoded per country.

| Layer | Location |
| --- | --- |
| Engine | `src/lib/accounting/externalIncome.ts` |
| CSV import | `src/lib/accounting/externalIncomeImport.ts` |
| UI | `src/components/accounting/income/` (tab, add dialog, import dialog) |
| Tests | `src/lib/accounting/externalIncome.test.ts` |
| Schema proposal | `scripts/staging-required/accounting/migration-002-external-income.proposed.sql` |

Rules that hold regardless of country:

1. MyCleaner income stays verified and automatic; external income is always
   manually registered and clearly separated in the UI and in the result
   (`myCleanerIncomeMinor`, `externalIncomeMinor`, `totalIncomeMinor`).
2. Nothing is auto-approved. Imported rows, cash entries, undocumented rows,
   unclear jurisdictions and mismatched payouts are `review_required` and are
   excluded from the amount until the provider confirms them.
3. A platform fee is counted exactly once — as an expense, or already netted —
   depending on `platformFeeTreatment` in the rule pack.
4. `gross - platform fee - withheld tax = net payout` must balance, otherwise
   the row says "Beløbene kræver kontrol".
5. Foreign currency needs a stored rate, rate date and converted minor amount;
   a stored historical rate is never recomputed.
6. Duplicates only warn ("Denne indkomst ligner en post, der allerede findes")
   and require a reason to continue.
7. `included` / `excluded` are backend-only statuses; the proposed trigger
   rejects any client attempt to set them.

Preview cases I–P in `/dev/provider-accounting-preview` cover combined income,
own customers, cash without documentation, foreign currency, platform payouts
with fees, duplicates, refunds and unclear jurisdictions.

## Monthly accounting report (PDF)

Each provider gets one preliminary accounting report per calendar month,
generated automatically by a backend job on the 1st of the following month.
The report is a summary of registered data — **never** an official tax or VAT
filing, and every rendered document repeats that in its disclaimer.

| Layer | Location |
| --- | --- |
| Document model + rules | `src/lib/accounting/monthlyReport.ts` |
| On-screen renderer | `src/components/accounting/reports/ReportDocumentView.tsx` |
| Provider UI | `src/components/accounting/reports/MonthlyReportsSection.tsx` (tab "Rapporter") |
| Admin operations view | `src/pages/admin/AdminAccountingReports.tsx` (`/admin/accounting-reports`) |
| Preview (cases Q–Z) | `/dev/monthly-report-preview` |
| Tests | `src/lib/accounting/monthlyReport.test.ts` |
| Schema proposal | `scripts/staging-required/accounting/migration-003-monthly-reports.proposed.sql` |
| Generator proposal | `scripts/staging-required/accounting/edge-functions/accounting-monthly-report-generate/index.ts` |

Rules that hold regardless of country:

1. **No frontend legal logic.** The document builder only formats what the
   authoritative calculation returned. Labels, tax names, deduction guidance
   and disclaimers come from the rule pack; when no pack is published the
   report says that no tax guidance is available instead of guessing.
2. **Frozen snapshot.** Inputs, result, rule-pack version, calculation version
   and exchange rates are frozen into `snapshot` at generation time and never
   recomputed. A historical report cannot silently change.
3. **Corrections supersede, never overwrite.** A new version is inserted and a
   trigger flips the previous row to `superseded`; the old PDF stays intact.
4. **Idempotent generation.** `provider:year:month:version:kind` is unique, so
   job retries cannot produce duplicate reports or duplicate PDFs.
5. **Empty months produce no PDF** unless the provider explicitly asks for one.
6. **Private storage only.** Files live in the private
   `provider-accounting-reports` bucket under `providerId/year/month/vN/`;
   providers read only their own folder, only the service role writes, and
   every download is served through a short-lived signed URL and logged.
7. **No sensitive identifiers in file names.** The file name carries the month
   and MyCleaner ID only — never a tax, VAT or business registration number.
8. **Admins see operations, not content.** The admin view lists status, country,
   rule-pack version and error codes; report content is never exposed there.

Preview cases Q–Z cover a normal month, an empty month, external income only,
mixed sources, missing documentation, foreign currency, a sales-tax country, a
country without a published rule pack, a corrected version 2 and a provisional
mid-month report.
