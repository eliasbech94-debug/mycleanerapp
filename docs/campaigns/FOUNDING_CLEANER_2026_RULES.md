# Founding Cleaner 2026 — FC-0 Rules & Design Freeze

- **Version:** FC-0 (v1.0)
- **Status:** Rules frozen. Server engine NOT implemented. Public copy = "opens soon".
- **Last updated:** 2026-07-27
- **Owner:** Product + Marketplace Engineering
- **Scope:** Founding Cleaner launch program, 2026 cohort

This document is the single source of truth for the Founding Cleaner program
rules until the server-authoritative engine (FC-1 … FC-7) is implemented and
verified in staging. No frontend, backend, marketing, or support surface may
promise anything beyond what is written here. Changes MUST be tracked in the
Decision Log at the bottom.

---

## 1. Locked business rules

1. The program has a **hard global maximum of 500 spots** across all markets
   and all countries. There is no per-country sub-cap.
2. Only **completed provider applications submitted between**
   `2026-01-01T00:00:00Z` (inclusive) **and** `2027-01-01T00:00:00Z`
   (exclusive) may qualify.
3. The **authoritative application timestamp** is
   `public.provider_profiles.submitted_at`.
4. **Approval may occur after 2026.** The submission window is what matters,
   not the approval window.
5. **Submitting an application does NOT reserve a spot.** Creating a normal
   user profile also does not reserve a spot.
6. A spot is only allocated **server-side at final approval and activation**,
   through the (future) FC-2 atomic allocation RPC.
7. **One benefit per verified natural person**, even if that person controls
   several legal entities. Duplicate profiles do NOT stack benefits.
8. **Fee scope:** the benefit removes only **MyCleaner's provider platform
   fee**. It does NOT touch:
   - The customer's separate platform fee
   - Payment processing costs
   - Tax, VAT
   - Insurance
   - Any other third-party costs
9. **Period length:** exactly `started_at + interval '3 months'` (Postgres),
   i.e. three calendar months. Never 90 days.
10. **Period start (anchor)** requires ALL of the following on the first
    qualifying job:
    1. Completed
    2. Payment captured
    3. Customer-confirmed OR processed under the existing completion rule
    4. Approved for release under MyCleaner's existing 24h hold + dispute
       control
11. A **full refund or open dispute before release does not start the period.**
    The next qualifying job becomes the candidate anchor.
12. A **refund or chargeback after start does not reset or extend** the
    period. Audit stability > user retention on this rule.
13. **No public countdown, remaining-seats counter, or eligibility indicator**
    may be shipped. Applicants learn their status via direct notification
    from MyCleaner.
14. **No frontend computation** of eligibility, seat availability, discount
    amount, `started_at`, or `expires_at`. Frontend renders values it
    receives; it never derives them.
15. The public campaign may **only shift from "opens soon" to an active
    financial promise** once FC-5 has passed staging end-to-end and
    reconciliation.

## 2. Definitions

**Qualifying application** — A `public.provider_profiles` row where
`submitted_at ∈ [2026-01-01T00:00:00Z, 2027-01-01T00:00:00Z)` and the
application has reached the terminal "submitted" state of the existing
onboarding state machine. Draft applications do NOT qualify.

**Qualifying provider** — A qualifying application that has been fully
approved and activated by MyCleaner (existing provider approval flow) AND
allocated one of the ≤500 global spots by the FC-2 RPC. Approval alone is
not enough; the atomic seat grant must succeed.

**Qualifying first job** — The first booking for the qualifying provider
that meets ALL four anchor conditions in rule 10 above. Bookings that fail
release do not count as the anchor; the next passing booking may.

**Global seat scope** — The 500 cap is enforced by a single global counter,
guarded by a Postgres advisory lock at grant time. There is no market-level,
country-level, or category-level partition of the cap.

**Person-based dedup** — Dedup key is the verified natural person (identity
verification adapter output), not the legal entity, not the email, not the
CVR. Multiple CVRs controlled by the same verified person = one benefit.

**Fee scope** — See rule 8. The engine will zero the provider platform fee
component in `pricing_calculations` during the active period. All other
line items are untouched.

## 3. Start & expiry semantics

- `started_at` is written server-side when the first qualifying job passes
  release. Until then the grant is in state `eligible_pending_first_job`.
- `expires_at = started_at + interval '3 months'` computed in Postgres.
- Bookings whose payment is captured **before** `expires_at` receive the
  benefit; bookings captured on or after `expires_at` do not, regardless of
  when they complete.
- The engine stores `started_at`, `expires_at`, `anchor_booking_id`, and
  the `pricing_calculation_id` that first applied the benefit for audit.

## 4. Refund / dispute decision table

| Situation | Effect on period |
|---|---|
| Cancelled before capture | No anchor, no state change |
| Refunded before release | No anchor; next qualifying job may anchor |
| Open dispute before release | No anchor; wait for dispute outcome |
| Refunded after release + start | Period continues; not reset, not extended |
| Chargeback after start | Period continues; not reset, not extended |
| Provider suspension | Period paused per existing suspension policy; benefit does NOT restart |

## 5. Public copy status (FC-0)

Public surfaces MUST communicate:

- The program **has not yet opened** ("opens soon" / "åbner snart" /
  "öppnar snart" / "abre pronto").
- Application **does not reserve a spot.**
- The **planned** benefit is **0 in provider platform fee for three
  calendar months** (never "all fees", "free", "keep 100 %", "no fees",
  "lifetime", "gratis").
- Global maximum of **500 spots**, applications in **2026** only.
- MyCleaner will **notify qualifying applicants directly** if the program
  activates.

Forbidden phrasings (locale-independent intent):

- "All fees are 0."
- "You keep 100 %."
- "MyCleaner charges nothing."
- "Free for three months."
- Any claim that a user "already has" or "has been granted" the benefit
  before FC-5 goes live.
- Any countdown or remaining-seats display.

## 6. Requirements before activation (FC-0 → FC-5 exit criteria)

1. FC-1 datamodel migrated in staging with RLS + GRANTs.
2. FC-2 atomic seat allocation RPC covered by concurrency regression
   (≥500 parallel approvals must never over-allocate).
3. FC-3 `pricing-quote` shadow mode: calculates and logs the benefit
   without applying it. Zero diff between shadow and live pricing for
   non-qualifying providers.
4. FC-4 lifecycle worker transitions grants
   `eligible_pending_first_job` → `active` → `expired` deterministically,
   including the release-hold interlock.
5. FC-5 staging end-to-end: seed 3 qualifying providers, run one full
   booking each through capture + release, confirm ledger, provider
   payout, invoice, and settlement statement all reflect the 0 provider
   platform fee correctly. Reconciliation MUST balance.
6. FC-6 admin visibility: allocation counter, grant states, and manual
   revoke path present in Admin Ops.
7. FC-7 comms: notification templates approved in DA/EN/SV/ES and legal
   sign-off on activation terms.

Until all 7 pass, public copy stays in FC-0 "opens soon" mode.

## 7. Roadmap (not yet implemented)

| Phase | Deliverable | Status |
|---|---|---|
| FC-0 | Rules freeze + safe public copy (this document) | Done |
| FC-1 | Datamodel: `founding_cleaner_grants`, `founding_cleaner_counter` | Not started |
| FC-2 | Atomic allocation RPC with advisory lock | Not started |
| FC-3 | `pricing-quote` shadow-mode integration | Not started |
| FC-4 | Grant lifecycle worker (anchor + expiry) | Not started |
| FC-5 | Staging end-to-end + reconciliation | Not started |
| FC-6 | Admin Ops surface | Not started |
| FC-7 | Notifications + legal activation terms | Not started |

No feature flag, migration, RPC, edge function, pricing change, or Stripe
change has been implemented for FC-1 … FC-7 as of this version.

## 8. Privacy

This document intentionally contains **no CPR, no CVR, no email, no
personal identifiers**. Person-based dedup references the identity
verification adapter's stable subject id; that id lives only in
`public.identity_verifications` and never in this file.

## 9. Decision log

| Date | Version | Change | Rationale |
|---|---|---|---|
| 2026-07-27 | FC-0 v1.0 | Initial freeze. Public copy in "opens soon" mode. No engine implemented. | Prevents shipping an unenforceable financial promise while the server engine is designed. |
