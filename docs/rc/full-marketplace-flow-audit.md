# MyCleaner — Full Marketplace Flow Audit

**Mode:** Read-only. No production logic, RLS policies, payments, pricing or booking flows were modified.
**Date:** 2026-07-21
**Auditor:** Lovable AI (build agent)
**Environment inspected:** Live Supabase (Cloud) schema + application source
**Data seen:** `bookings` = 0 rows, `provider_profiles` = 0 rows (empty greenfield DB — behavior verified via schema + code path only)

---

## 0. Executive summary

MyCleaner has a **substantial, well-architected backend for identity, provider onboarding, Stripe Connect, disputes, GDPR, i18n, marketplace pricing (advisory) and the unified conversation engine**. However, the **end-to-end customer→booking→payout journey is not production-safe today** because several critical marketplace primitives are either **missing, disconnected, or client-trusted**.

| Domain | Score (0–100) | Status |
|---|---|---|
| **Overall marketplace readiness** | **41** | 🔴 NOT production-ready |
| Customer flow (signup → dashboard) | 74 | 🟡 Connected, unverified E2E |
| Provider flow (signup → onboarding → dashboard) | 78 | 🟡 Connected, unverified E2E |
| Booking flow (search → create → decide → complete) | **28** | 🔴 Partial / client-trusted |
| Pricing flow (advisory + checkout) | 55 | 🟠 Advisory verified; checkout disconnected |
| Payment flow (Stripe Connect + webhooks) | 62 | 🟠 Live but trusts client for amount |
| Admin flow (users, providers, ops) | 80 | 🟢 Backend-strong, UI mostly ready |
| Security & RLS | 72 | 🟡 Strong on hardened tables; weak where table missing |

### Top 5 production blockers (must-fix before any real money moves)

1. 🔴 **CRITICAL — Client-trusted pricing on checkout.** `supabase/functions/payment-create-intent/index.ts` accepts `customer_pays`, `provider_gets`, `currency`, `hours` **from the request body** and inserts them verbatim into `bookings` and Stripe. A tampered client can pay 1 kr for a job worth 1 000 kr, or invert commission. The verified `pricing-quote` + `lock_pricing_quote` RPC exists (Phase 1 dynamic pricing) but is **not wired into checkout**.
2. 🔴 **CRITICAL — No availability system.** There is **no `provider_availability`, `availability_slots`, `time_off` or exclusion table** in the DB. There is no RPC for "is this slot free". `BookingFlow.tsx` picks a slot from a static grid; nothing prevents double-booking at DB level. `provider_can_accept_booking` only checks status, not calendar.
3. 🔴 **CRITICAL — Providers stored client-side.** `src/lib/providers.ts` reads/writes to `localStorage("mycleaner.providers.v1")`. The public marketplace, `ProviderProfile.tsx` (`/provider/:id`) and `BookingFlow.tsx` all depend on this seed, not on `provider_profiles`. This means the "book a provider" journey is running against a **local demo dataset**, not real onboarded providers.
4. 🔴 **CRITICAL — Booking state machine too coarse.** `booking_status` enum = `{pending, accepted, declined, cancelled, completed}`. No `confirmed`, `in_progress`, `disputed`, `refunded`, `no_show`. Payment refund states (`refunded`, `partially_refunded`) exist in `payment_status` but there is no corresponding booking state, so lifecycle is ambiguous.
5. 🔴 **CRITICAL — No reviews/ratings persistence.** No `reviews` or `ratings` table exists. Ratings shown in UI (`ProviderProfile.tsx`) are hard-coded fixtures. Provider `rating` / `reviews` on the marketplace card cannot be trusted.

### Immediately following (Priority 2)

6. 🟠 **Posted-task flow (`CreateTask` / `MatchingOffers`) has no backing tables** (`tasks`, `task_offers` do not exist). It is UI-only.
7. 🟠 `provider_profiles.hourly_rate` and the entire **Marketplace Pricing** module (`provider_pricing_preferences`) are **not read by checkout**. Rate comes from `deriveHourlyRate(country)` in the client.
8. 🟠 Booking `INSERT` policy uses `auth.uid() = customer_user_id` — good — but the row is created by service-role in the edge function, so the policy is not the actual guard. The **edge function itself** is the only guard, and it does not validate `customer_pays == server_computed_total`.
9. 🟠 `bookings_freeze_snapshots` protects the snapshot columns, but they are only ever populated with `country_config` — never with the pricing snapshot, because the pricing pipeline is skipped.
10. 🟠 `provider_can_accept_booking` returns true even when the provider has *any* other booking overlapping (no calendar).

---

## 1. Architecture map

### Frontend (SPA — Vite + React + React Router)
- Entry: `src/App.tsx` (routes) → `RootRouteSwitch` handles `/:country/*`
- Auth: `useAuth` (`src/hooks/useAuth.tsx`) + `useUserRoles` (`user_roles` table)
- Role guards: `RoleGuard`, `ProviderApplicantGuard`
- Country context: `src/i18n/CountryContext.tsx`

### Backend (Supabase / Lovable Cloud)
- **Postgres schema:** 80+ tables, extensive triggers and SECURITY DEFINER functions.
- **Edge functions:** 96 deployed (auth, payments, disputes, GDPR, conversations, identity, pricing, admin ops).
- **Storage:** private buckets for chat attachments, receipts, dispute evidence.

### External integrations
- **Stripe Connect (Express)** — destination charges + application fee.
- **Sumsub (Sandbox)** — identity verification.
- **DAWA + Google Places** — address validation.
- **Cloudflare Turnstile** — signup CAPTCHA.

### Key tables per domain

| Domain | Tables |
|---|---|
| Identity/Auth | `profiles`, `user_roles`, `sms_verifications`, `person_identities`, `identity_account_links`, `identity_verification_attempts`, `identity_webhook_events` |
| Providers | `provider_profiles`, `provider_admin_actions`, `provider_trust`, `provider_trust_config`, `provider_scoring_config`, `provider_tier_rules`, `provider_score_history`, `provider_pricing_settings`, `provider_pricing_preferences`, `provider_tax_profiles`, `provider_receipts`, `provider_settlement_statements` |
| Bookings | `bookings`, `booking_cancellations`, `cleaning_plans`, `refund_requests`, `refund_requests_v2`, `pricing_calculations` |
| Payments | `stripe_webhook_events`, `stripe_disputes`, `dispute_evidence`, `dispute_alerts`, `finance_payouts`, `finance_statements`, `finance_reconciliation_alerts`, `finance_reconciliation_runs`, `platform_fee_invoices`, `platform_credit_notes` |
| Marketplace pricing | `market_pricing_rules`, `market_pricing_multipliers`, `market_rate_thresholds` |
| Country/i18n | `country_configs`, `country_config_versions`, `country_holidays`, `country_readiness_runs` |
| Conversations | `conversations`, `conversation_participants`, `conversation_events`, `conversation_reads`, `conversation_tags`, `conversation_tag_assignments`, `messages`, `message_attachments`, `support_threads`, `support_messages` |
| GDPR / Compliance | `consent_ledger`, `gdpr_export_jobs`, `data_retention_policies`, `retention_worker_runs`, `legal_holds`, `legal_documents`, `user_legal_acceptances`, `admin_audit_log`, `access_attempts`, `error_events` |
| Ops | `feature_flags`, `system_alerts`, `job_runs`, `webhook_metrics`, `incidents`, `deployments`, `notification_outbox` |

### Missing tables (referenced by UI but not in DB)

| Missing | Referenced by | Impact |
|---|---|---|
| `reviews` / `provider_reviews` | `ProviderProfile.tsx`, `FindCleaner.tsx`, `Marketplace.tsx` | 🔴 UI shows fake ratings |
| `provider_availability` / `availability_slots` | `BookingFlow.tsx` slot picker | 🔴 No double-book protection |
| `tasks` / `task_offers` | `CreateTask.tsx`, `MatchingOffers.tsx` | 🔴 Posted-task flow non-functional |
| Public `providers` catalog | `Marketplace.tsx`, `FindCleaner.tsx`, `BookingFlow.tsx` | 🔴 Uses localStorage seeds |

---

## 2. Customer flow (signup → dashboard) — Score 74

| Check | Result | Evidence |
|---|---|---|
| Customer can create an account | ✅ Connected | `src/pages/CustomerRegister.tsx` + Supabase auth |
| Correct `customer` role assigned | ✅ Verified | `handle_new_user()` trigger inserts `('customer')` |
| Profile row created | ✅ Verified | Same trigger inserts into `profiles` |
| Country/marketplace assigned | 🟡 Manual | User picks via `CountryLanguageSelector`; profile.country_code is nullable and not required until first address save |
| Currency/language follow market | 🟡 Partial | `CountryContext` drives language; currency taken from `country_configs.currency` on booking |
| Customer cannot access provider/admin pages | ✅ Verified | `RoleGuard` in `App.tsx`; `useUserRoles` gates client; server enforces via RLS on admin RPCs |
| Customer can update own profile | ✅ Verified | RLS `Users update own profile` |
| Customer cannot update another customer | ✅ Verified | RLS predicate `auth.uid() = id` |
| Onboarding state persisted | 🟡 Partial | Basic (address, phone, SMS verify) — no explicit `onboarding_completed_at` |
| Email verification | 🟡 Partial | Supabase default; no explicit UI gate blocking bookings pre-verification |
| Login redirects by role | ✅ Verified | `resolveHomeForCurrentUser()` in `src/lib/roleRedirect.ts` |

**Files/functions/routes:** `handle_new_user()`, `profiles`, `user_roles`, `sms_verifications`, `sms-send-code`, `sms-verify-code`, `CustomerRegister.tsx`, `Login.tsx`, `AuthCallback.tsx`, `Profile.tsx`.

**Status:** 🟢 **Fully connected** for signup/role/profile · 🟡 **Connected but unverified E2E in staging** for country/currency assignment.

---

## 3. Provider flow (signup → onboarding → dashboard) — Score 78

| Check | Result | Notes |
|---|---|---|
| Signup → provider role | ✅ Verified | `provider-start-application` grants `provider` role after profile creation |
| Redirected to `/bliv-cleaner` | ✅ Verified | `ProviderApplicantGuard` |
| `provider_profiles` row created | ✅ Verified | RPC path |
| Cannot access `/admin/*` | ✅ Verified | `RoleGuard allow={["admin"]}` |
| Onboarding progress stored | ✅ Verified | `calc_provider_completion()` returns per-field JSON |
| Add name/photo/bio/services/languages/rate/area/base address/DOB/terms | ✅ Verified | `provider_profiles` columns exist + `provider_profiles_enforce_base_address` trigger |
| Tax profile | ✅ Verified | `provider_tax_profiles` (encrypted via `pgp_sym_encrypt`) |
| Bank/payout details | ✅ via Stripe Connect | `provider_profiles.stripe_account_id`, `stripe-connect-onboard`, `stripe-connect-status` |
| Identity verification | ✅ Verified (Sandbox) | Sumsub — `identity-webhook`, `person_identities`, `identity_account_links` |
| Insurance | ❌ Not modeled | No `insurance_*` columns on `provider_profiles` |
| Incomplete providers hidden publicly | ✅ Verified | `provider_is_marketplace_visible()` gate: active + public + identity approved + Stripe ready + SMS verified + completion 100% |
| Suspended/rejected cannot accept | ✅ Verified | `provider_can_accept_booking()` requires `status='active'` + `identity approved` + `stripe_charges_enabled` + not `payout_frozen` — **but** this check is NOT called from `payment-create-intent` (see §6/§11) |
| Approval status respected | 🟡 Partial | Backend gates exist; **checkout does not enforce them** |

**Files/functions/routes:** `ProviderRegister.tsx`, `ProviderOnboarding.tsx`, `provider-start-application`, `provider-submit-application`, `admin_provider_action()`, `provider_can_accept_booking()`, `provider_is_marketplace_visible()`, `stripe-connect-*`, `identity-*`.

**Status:** 🟢 **Fully connected** for onboarding data · 🔴 **Disconnected** at the booking-acceptance gate (`provider_can_accept_booking` is not enforced during PI creation).

---

## 4. Provider pricing — Score 55

### 4A. Advisory Marketplace Pricing module (Phase 1)
- ✅ `market_pricing_rules` + `resolve_market_minimum()` — postcode > city > region > country
- ✅ `compute_recommended_price()` — returns indicator + multipliers
- ✅ `provider_pricing_preferences` — owner-only RLS
- ✅ `save_provider_pricing()` — enforces min/max, currency, Smart Pricing bounds
- ✅ Staging-verified (see `docs/rc/marketplace-pricing-staging-verification.md`)

### 4B. Wiring into checkout — **DISCONNECTED**
- ❌ `payment-create-intent` **does not read** `provider_pricing_preferences.hourly_rate_minor` nor `provider_profiles.hourly_rate`.
- ❌ It **accepts `customer_pays` and `provider_gets` from the client body** (see §11).
- ❌ `pricing-quote` edge function exists but is **not invoked** by the booking flow.
- ❌ `lock_pricing_quote()` RPC exists (locked/terminal) but is **not called** in `payment-create-intent`.
- ❌ `bookings.pricing_snapshot`, `pricing_calculation_id`, `pricing_version` remain **NULL** on real bookings.

**Verdict:** Advisory module = **Fully connected & verified**. Checkout pricing = **Disconnected**. This must be stated explicitly: **the provider's saved hourly rate is currently not used anywhere in the live booking calculation.**

**Status:** 🟠 Advisory: 🟢 verified · Checkout link: 🔴 **Disconnected**.

---

## 5. Provider availability — Score 5

- ❌ **No availability table exists.** SQL: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename ILIKE '%avail%' OR tablename ILIKE '%slot%')` returns 0 rows.
- ❌ No RPC for slot resolution. `BookingFlow.tsx` shows a static grid of slots.
- ❌ No unique constraint on `(provider_id, booking_date, slot)` on `bookings`. Only index `bookings_provider_status_idx` exists.
- ❌ `provider_can_accept_booking` checks status/Stripe/identity — not the calendar.
- ❌ No time-zone handling per booking beyond `bookings.timezone` snapshot from country config.
- ❌ Cancelled/rescheduled bookings — no availability to release because there is no availability.

**Verdict:** 🔴 **Not implemented.** Source of truth for provider availability = none. Double-booking is not prevented at DB level.

---

## 6. Customer search & provider discovery — Score 35

| Check | Result |
|---|---|
| Search by location | 🟡 UI only — `FindCleaner.tsx` uses static seeds |
| Providers filtered by location | 🔴 Filters in-memory JS on localStorage seeds |
| Travel radius respected | 🔴 Static field, no geo query |
| Country/service country separation | 🟠 Country-only filter, no service_country column |
| Suspended/incomplete excluded | 🔴 View `public_provider_marketplace` exists but is **not queried** by `Marketplace.tsx` |
| Categories/services filter | 🟡 Client-side |
| Correct hourly price display | 🔴 Derived, not from `provider_pricing_preferences` |
| Correct currency display | 🟡 From CountryContext, not from provider record |
| Ratings display | 🔴 Fake — no `reviews` table |
| Sorting/filters | 🟡 In-memory |
| Provider profile links open correct provider | ✅ Route `/c/:slug` → `PublicProviderProfile.tsx` reads `provider_profiles` |
| Private info hidden | ✅ `PublicProviderProfile` only reads public columns |

**Verdict:** `/c/:slug` public profile is 🟢 connected to DB. `/find-cleaner`, `/marketplace`, `/provider/:id` are 🔴 **UI-only against localStorage seeds** — they must be rewired to `provider_profiles` / `public_provider_marketplace`.

---

## 7. Booking creation — Score 30

Flow: `BookingFlow.tsx` → `payment-create-intent` edge fn → Stripe PI → `bookings` row.

| Check | Result | Evidence |
|---|---|---|
| Correct provider/customer ID | 🟡 | Customer OK (from JWT); `provider_id` accepted from client without verifying `provider_can_accept_booking` |
| Correct service country/currency | 🟡 | Country resolved via `country_configs`; **currency comes from client body** and is only checked against country cfg — client controls it |
| Availability revalidated server-side | 🔴 | No availability system |
| Minimum duration enforced | 🔴 | Not enforced server-side |
| Pricing calculated server-side | 🔴 | **Client sends `customer_pays` / `provider_gets`** — server does not recompute or verify |
| Discounts/promo | ❌ Not implemented |
| Platform fee correct | 🔴 | Computed as `customer_pays - provider_gets` — trusts both inputs |
| Provider earnings correct | 🔴 | Same |
| VAT/tax correct | 🟡 | Snapshot from `country_configs.vat_rate_bps` frozen, but no tax computation |
| Manipulated frontend price blocked | 🔴 | **Not blocked** |
| Duplicate submissions blocked | 🟡 | Idempotency on Stripe PI (`idemKey = pi:${booking.id}`); nothing prevents two distinct bookings being created for same slot |
| Initial state | ✅ | `pending` + `payment_status='none'` |

**Tables/RPCs/functions involved:** `payment-create-intent`, `bookings`, `country_configs`, `provider_profiles` (read for `stripe_account_id`), `pricing_calculations` (populated by `pricing-quote` but **not linked**).

**Verdict:** 🔴 **Client-trusted pricing** is the single highest-risk defect in the platform.

---

## 8. Direct booking vs posted task — Score 25

### Direct booking
- 🟢 UI + backend for direct booking (`/book/:id` → `BookingFlow.tsx` → PI).
- 🔴 Race between multiple customers booking the same slot: not prevented.
- 🟢 Provider accept/decline: `booking-decide` verifies `profile.provider_id === b.provider_id` (correct isolation).

### Posted task
- 🔴 **Not implemented at DB level.** No `tasks`, `task_offers`, `task_bids` tables.
- 🟡 UI stubs: `src/pages/CreateTask.tsx`, `src/pages/MatchingOffers.tsx` exist and route (`/task/create`, `/task/offers`) but do not persist.
- 🔴 No eligibility filter, no offer selection, no race-condition prevention, no task→booking conversion.

**Verdict:** Direct booking = 🟠 partially implemented (works only if you accept client-trusted pricing). Posted task = 🔴 **UI only / not implemented.**

---

## 9. Provider booking management — Score 55

`booking-decide` edge function handles accept/decline.

| Action | Status |
|---|---|
| View new requests | 🟢 `ProviderDashboard.tsx` reads `bookings` filtered by `provider_id` (RLS: `Providers select own bookings`) |
| Accept / decline | 🟢 `booking-decide` — captures/cancels PI, ownership verified |
| View customer instructions | 🟢 `notes` field |
| Message customer | 🟢 Auto-thread created on accept |
| Mark travel started / arrived / start job / complete | ❌ **Not implemented** — no `in_progress` / `started_at` / `completed_at` beyond `decided_at` |
| Report a problem | 🟡 Via support conversation only |
| Upload completion evidence | ❌ Not implemented |
| Request extra time | ❌ Not implemented |
| Provider isolation | 🟢 `booking-decide` guards; RLS `Providers update own bookings` |

**Verdict:** 🟠 **Partially implemented** — accept/decline works, richer lifecycle (in-progress/complete/evidence) missing.

---

## 10. Customer booking management — Score 60

| Action | Status |
|---|---|
| View upcoming / details | 🟢 `MyBookings.tsx` |
| Message provider | 🟢 Conversation engine |
| Cancel per policy | 🟢 `booking-cancel` + `booking_cancellations` + `cancellation_policy_snapshot` |
| Reschedule | 🟡 UI missing; DB update allowed only via admin path (customer RLS blocks `booking_date` change via `bookings_customer_update_guard`) |
| Add instructions | 🟢 `notes` |
| View payment status | 🟢 |
| Confirm completion | ❌ Not implemented |
| Submit rating/review | ❌ No table |
| Report a problem | 🟢 via support |
| Rebook | 🟡 UI stub |
| Protected fields | 🟢 `bookings_customer_update_guard()` blocks changes to `customer_pays`, `provider_gets`, `platform_fee_amount`, `payment_status`, `provider_id`, `booking_date`, `customer_user_id`, and status transitions outside `pending → cancelled` |

**Verdict:** 🟢 Well-guarded write model, 🔴 Missing reviews/rebook/reschedule.

---

## 11. Booking status lifecycle

**Actual enum:** `{pending, accepted, declined, cancelled, completed}` (5 values).
**Actual payment_status enum:** `{none, authorized, captured, canceled, failed, expired, refunded, partially_refunded}` (8 values).

| Transition | Who | Trigger | Consequences |
|---|---|---|---|
| ∅ → `pending` | Customer (via edge) | `payment-create-intent` inserts row; PI created; `payment_status='none' → 'authorized'` after `payment-mark-authorized` | Availability not affected (no calendar) |
| `pending` → `accepted` | Provider | `booking-decide accept` — captures PI, `payment_status='captured'` | Auto-creates conversation |
| `pending` → `declined` | Provider | `booking-decide decline` — cancels PI, `payment_status='canceled'` | none |
| `pending` → `cancelled` | Customer | `booking-cancel` (RLS-allowed) | `payment_status='canceled'` if authorized |
| `pending` → `cancelled` | System | `booking-expire-pending` cron | Same |
| `accepted` → `completed` | ❌ **No trigger** | Nothing sets `completed`. There is no "complete" edge function. | Payout logic never fires from status |
| any → `refunded` | ❌ **Not modeled in booking_status** | Refunds live only in `payment_status` + `refunds` jsonb |
| any → `disputed` | ❌ Not modeled | `stripe_disputes` table exists but `bookings.status` never reflects it |
| any → `in_progress` | ❌ Not modeled | |

**Verdict:** 🔴 **Incomplete state machine.** No `completed` transition path in code (only enum value). Payouts and reviews cannot key off booking status.

---

## 12. Payments — Score 62

### What works
- ✅ Manual-capture Stripe PI (authorize now, capture on provider accept) — 24 h auth window.
- ✅ Destination charges + `application_fee_amount` when provider has Connect ready.
- ✅ Idempotency key `pi:${booking.id}` prevents duplicate PIs on retry.
- ✅ `stripe-webhook` records to `stripe_webhook_events` (idempotent by event id).
- ✅ Country/currency consistency check against `country_configs`.
- ✅ Refund paths: `booking-cancel` invokes Stripe refunds; `refunds` jsonb appended; `platform_credit_notes` numbered via `next_credit_note_number()`.
- ✅ `webhook_metrics`, `dispute_monitor`, `finance-reconcile` observability.

### What fails
- 🔴 **Amount is client-supplied.** Customer can post any `customer_pays` value.
- 🔴 **Provider earnings client-supplied.** `provider_gets` set from body.
- 🔴 **Platform fee = subtraction** of the two — trivially manipulable.
- 🟠 **`provider_can_accept_booking` gate not enforced** at PI creation — a suspended provider's booking can still be authorized.
- 🟠 Cancelled PI + confirmed booking: booking is deleted if PI creation fails (`admin.from("bookings").delete()`) — race window between insert and PI.
- 🟢 Webhooks idempotent; duplicate events not double-recorded.

**Verdict:** Infrastructure = 🟢 · Trust model = 🔴.

---

## 13. Provider payouts — Score 60

- ✅ `finance_payouts`, `finance_statements`, `finance_reconciliation_runs` tables and edge functions exist.
- ✅ `provider_can_receive_payout()` gate.
- ✅ `provider_settlement_statements` — explicitly *not* labeled as VAT invoice; only `platform_fee_invoices` are VAT invoices (agent model confirmed).
- ✅ RLS on `finance_payouts`: providers see own only; admins see all.
- 🟠 Payout eligibility keys off Stripe transfer status via webhook, not off `bookings.status='completed'` (because completion never fires).
- 🟠 Refund adjustment path via `platform_credit_notes` — depends on `bookings.refunds` jsonb, which is written correctly.

**Verdict:** 🟠 **Live via Stripe transfers, but decoupled from booking completion.** Statements & invoices numbering, RLS, VAT labelling — all correct.

---

## 14. Messaging & notifications — Score 82

- ✅ Unified conversation engine (Phase 2/3) with strict RLS via `is_conversation_participant()` / `is_conversation_visible_to()` SECURITY DEFINER functions.
- ✅ `conversation_events` append-only trigger; `messages_bump_conversation` maintains `last_message_at`.
- ✅ Attachments in private bucket (`chat-attachments`) with signed URLs (`conversation-attachment-url`).
- ✅ `notification_outbox` + `notification-outbox-worker` for email/push.
- 🟠 Only some events are wired to notifications: booking accepted ✅, payment succeeded/failed ⚠ (via Stripe webhooks), booking reminder ✅ (`booking-plan-reminders`), review request ❌ (no reviews).
- 🟠 Admin access to conversations: allowed by `is_conversation_visible_to` for support roles; audited via `admin_audit_log`.
- 🟢 Failed notifications do not break booking creation (outbox pattern).

**Verdict:** 🟢 **Fully connected** for the covered events; some events undefined because their originating flow doesn't fire (completion, review).

---

## 15. Ratings & reviews — Score 0

- 🔴 **No table.** `SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename ILIKE '%review%' OR tablename ILIKE '%rating%')` returns 0 rows.
- 🔴 UI shows hardcoded fixtures in `ProviderProfile.tsx`.
- 🔴 `provider_profiles` has no `rating_avg`, `rating_count` columns.

**Verdict:** 🔴 **Not implemented.**

---

## 16. Admin oversight — Score 80

- ✅ `/admin/*` routes gated by `RoleGuard`.
- ✅ `admin_provider_action()` — transactional, idempotent, audit-logged.
- ✅ `admin-user-role` for role management, protected by `is_admin_only()`, `protect_last_super_admin` trigger.
- ✅ `AdminDashboard`, `AdminProviders`, `AdminUsers`, `AdminPricing`, `AdminPayments`, `AdminWebhooks`, `AdminOps`, `AdminDisputes`, `AdminStripe`, `AdminAccessLogs`, `AdminFinance`, `CountryConsole`.
- ✅ Every admin RPC checks `is_admin_only(auth.uid())` server-side; route knowledge alone does not grant access.
- ✅ Immutable `admin_audit_log` (trigger `admin_audit_immutable`).

**Verdict:** 🟢 **Fully connected & well-verified.**

---

## 17. Country & marketplace separation — Score 65

- ✅ `country_configs` (published + versioned via `country_configs_publish_snapshot`).
- ✅ `bookings.country_code` + snapshot columns frozen by trigger.
- ✅ `payment-create-intent` verifies currency ↔ country.
- ✅ Address country enforced by `enforce_address_country` trigger.
- 🟠 **`profile.country_code` ≠ service country** — accepted, but not always distinguished in UI (Marketplace filters by profile country).
- 🟠 No explicit `service_country_code` on bookings other than `bookings.country_code` derived from address.
- 🟠 Payout currency = provider Stripe account currency; not stored in `provider_profiles` for pre-flight display.
- 🟢 `is_country_bookable` / `is_country_visible` gates work.

**Verdict:** 🟢 Data model is correct; 🟠 UI does not consistently separate service country from account country.

---

## 18. Security & RLS matrix (static analysis)

Real JWT execution requires staging identities not currently in env; matrix below is derived from RLS predicates + SECURITY DEFINER functions inspected in-tree.

| Table | anon | customer(self) | customer(other) | provider(self) | provider(other) | admin |
|---|---|---|---|---|---|---|
| `profiles` | ❌ | R+U | ❌ | R+U | ❌ | R+U |
| `user_roles` | ❌ | R | ❌ | R | ❌ | RIUD |
| `provider_profiles` | ❌ | ❌ | ❌ | R+U own | ❌ | R (via `provider_profiles_admin_select`), writes only through `admin_provider_action` (privileged trigger blocks direct writes) |
| `provider_pricing_preferences` | ❌ | ❌ | ❌ | R own | ❌ | RIUD |
| `bookings` | ❌ | R own, I own via edge, U (cancel-only) | ❌ | R own, U own | ❌ | ALL |
| `messages` | ❌ | R+I in own conversations | ❌ | R+I in own conversations | ❌ | R+I where support |
| `conversations` | ❌ | R own (participant) | ❌ | R own | ❌ | R support |
| `finance_payouts` | ❌ | ❌ | ❌ | R own | ❌ | R all |
| `country_configs` | ❌ | R published | ❌ | R published | ❌ | RIUD |
| `market_pricing_rules` | R via RPC | R via RPC | R via RPC | R via RPC | R via RPC | RIUD |

**Not tested** (missing staging JWT env vars — see `docs/rc/marketplace-pricing-staging-verification.md` §7): live authenticated cross-provider, admin override, price manipulation, duplicate webhook. Harness `staging-validation/scenarios/15-marketplace-pricing-rls.ts` self-skips.

**Weakness:** where a table **does not exist** (reviews, availability, tasks, offers) RLS cannot help. And where the edge function bypasses RLS via service-role (`payment-create-intent`), RLS is not the guard — the code is.

---

## 19. End-to-end scenario results

| Scenario | Result |
|---|---|
| **A — Direct booking** | 🔴 FAIL from step 5 (provider hourly rate not read) through step 11 (client-trusted price). Steps 1–4, 12–13 pass in principle. |
| **B — Posted task** | 🔴 Not implemented (no tables). |
| **C — Cancellation** | 🟢 Passes for pre-payment + post-payment refund via `booking-cancel`; refund calc uses `cancellation_policy_snapshot`. 🔴 Availability release N/A (no availability). |
| **D — Security** | 🟢 Provider A cannot read Provider B (RLS + edge guard); 🟢 Customer cannot access admin endpoints (`is_admin_only`); 🔴 Manipulated price submission SUCCEEDS (see §11); 🟢 Manipulated booking status blocked (`bookings_customer_update_guard`); 🟢 Duplicate webhook idempotent. |

---

## 20. Data-integrity risks

1. 🔴 Client-trusted `customer_pays` / `provider_gets` — recorded verbatim, snapshotted, charged.
2. 🔴 No unique constraint on `(provider_id, booking_date, slot)` — double bookings possible.
3. 🟠 Provider `hourly_rate` stored in two places (`provider_profiles.hourly_rate` and `provider_pricing_preferences.hourly_rate_minor`) — neither authoritative for checkout.
4. 🟠 `bookings.pricing_snapshot` is nullable and never populated by production flow — reconciliation cannot key off it.
5. 🟠 `refund_requests` (legacy) and `refund_requests_v2` coexist — dual write risk.
6. 🟠 Providers seeded to `localStorage` — data drift between demo dataset and real DB.
7. 🟠 Fake ratings in `ProviderProfile.tsx` — public misinformation if released as-is.

---

## 21. Prioritized repair plan

### Priority 0 — Blocks any real-money launch
1. **Wire `pricing-quote` → `lock_pricing_quote` into `payment-create-intent`.** Server must recompute `customer_pays`, `provider_gets`, `platform_fee_amount` from the locked quote; ignore client-supplied values. **Files:** `supabase/functions/payment-create-intent/index.ts`, `supabase/functions/pricing-quote/index.ts`.
2. **Enforce `provider_can_accept_booking(provider_user_id)`** in `payment-create-intent` before creating the PI.
3. **Add `provider_availability`** (weekly rules + exceptions) + slot-lookup RPC + `UNIQUE (provider_id, booking_date, slot)` partial index on `bookings` where `status IN ('pending','accepted')`.
4. **Replace localStorage-seeded providers** with `provider_profiles` / `public_provider_marketplace` queries in `Marketplace.tsx`, `FindCleaner.tsx`, `ProviderProfile.tsx`, `BookingFlow.tsx`.
5. **Booking state machine expansion:** add `in_progress`, `completed`, `refunded`, `disputed`, `no_show`; add edge functions `booking-start`, `booking-complete`; extend `bookings_customer_update_guard` accordingly.

### Priority 1 — Blocks trust/quality
6. Create `reviews` table (booking_id UNIQUE, provider_id, customer_id, rating, body) with strict RLS: insert only where booking is `completed` and reviewer is `customer_user_id`; one review per booking. Add `provider_profiles.rating_avg`, `rating_count`; trigger to maintain.
7. Remove hardcoded ratings/reviews fixtures from `ProviderProfile.tsx`, `FindCleaner.tsx`, `Marketplace.tsx`.
8. Implement or explicitly retire posted-task flow (`CreateTask`, `MatchingOffers`). If retained, add `tasks`, `task_offers` tables with RLS + `task_award_rpc` for race-safe winner selection.

### Priority 2 — Fill gaps
9. Add `insurance_*` columns to `provider_profiles` if insurance is required per country.
10. Add `service_country_code` distinct from `profile.country_code` in Marketplace filters.
11. Run authenticated JWT identity matrix (`staging-validation/scenarios/15-marketplace-pricing-rls.ts` + new booking/payment matrix) in staging.
12. Consolidate `refund_requests` and `refund_requests_v2` — deprecate v1.
13. Add review-request notification wiring once §6 lands.

### Priority 3 — Nice-to-have
14. Rescheduling flow (customer-initiated with provider approval).
15. Complete-job evidence upload (photos) → `provider_completion_evidence` table + storage bucket.
16. Provider "on-my-way" / "arrived" status pings.

---

## 22. Deliverables status

- ✅ Audit document created at `docs/rc/full-marketplace-flow-audit.md`.
- ⏸ Staging harness extension pending explicit approval to add scenarios (16-availability, 17-checkout-price-tamper, 18-double-booking, 19-review-flow) under `staging-validation/scenarios/`.
- ⏸ No fixes applied. Awaiting approval per instructions.

## 23. Production gate

**Recommendation:** ❌ **Do not launch for real money.** Priority-0 items 1–5 must land and be staging-verified with authenticated JWTs before any live customer transaction. Advisory features (marketplace pricing UI, provider onboarding, admin console, messaging) can be soft-launched behind a feature flag without money movement.

---

*End of audit. No production logic was modified.*
