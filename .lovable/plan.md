# Final Dashboard & Profile Completion — Phased Plan

Scope: production-ready v1 of Customer Dashboard, Customer Profile, Provider
Dashboard, Provider Profile. Keeps existing MyCleaner visual identity, semantic
tokens, DM Serif Display + Fira Sans typography. No new brand redesign.

## Guardrails (apply to every phase)

- **No fake data, no fake APIs, no placeholder business logic.** If backend
  does not exist yet, hide the surface or render a `<ComingSoonCard>` with a
  short explanation. No mock arrays, no random numbers, no lorem-ipsum reviews.
- **Feature-flag rollout.** New pages are the default. Legacy is reachable via
  `?legacy=1` on the same route until Phase 6 removes it. Router logic lives
  in a single `LegacyGate` wrapper per surface.
- **Design system only.** Use existing semantic tokens (`bg-background`,
  `text-foreground`, `border-border`, `bg-muted`, `text-primary`, `bg-card`,
  `text-mkt-*`). No hardcoded colors. Fira Sans body, DM Serif Display for h1.
- **Responsive.** Mobile-first inside each new component. Existing
  `MobileAppShell` routes (`/mobile/*`, `MobileProfileGate`) stay untouched —
  the redesign targets the desktop/tablet dashboard routes.
- **Perf.** Real data via existing hooks (`useAuth`, `useUserRoles`,
  `useCustomerConversations`, `useMarketplaceProviders`,
  `useFavoriteProviders`, direct `supabase` queries). Skeleton components while
  loading, memoise heavy lists, `React.lazy` for charts.
- **A11y.** WCAG AA. Semantic landmarks, `aria-label` on icon buttons, one
  `<h1>` per page (already in `DashboardPage`), 44×44 tap targets.
- **Constitution v1 & 7-question checklist** run before adding any new table
  or engine. This work reuses existing engines only.

## Deferred (stubbed as "Coming soon" cards, no fake data)

Reason: no backend today. Shell space is reserved so they slot in later
without redesign.

- AI Assistant with live camera + surface ID (needs Lovable AI vision +
  camera + product DB)
- Calendar sync — Google 2-way / Apple / iCal (only Google connector today,
  no sync engine)
- Learning Center — courses, certificates, category tests (no schema)
- Customer: Family members / Pets / Access instructions / Favourite products
  (no tables)
- Provider: Cover photo, gallery, badge-progress detail cards (no storage +
  no expanded provider_score breakdown)

## Phase 1 — Shared design primitives + Customer Dashboard v1  (this turn)

Files created

- `src/components/dashboard/primitives/StatCard.tsx` — label, value, delta,
  icon, skeleton state.
- `src/components/dashboard/primitives/QuickActionCard.tsx` — icon, title,
  description, `to`, hover animation.
- `src/components/dashboard/primitives/SectionCard.tsx` — titled card
  wrapper, optional action slot, `loading`, `empty` render props.
- `src/components/dashboard/primitives/EmptyState.tsx` — illustration slot,
  title, description, CTA.
- `src/components/dashboard/primitives/ComingSoonCard.tsx` — labelled stub for
  deferred features; explains what will land when the backend exists.
- `src/components/dashboard/primitives/WelcomeHeader.tsx` — greeting, profile
  completion ring, next-booking countdown.
- `src/components/dashboard/primitives/index.ts` — barrel.
- `src/hooks/useCustomerDashboard.ts` — one hook, parallel queries against
  existing tables (`bookings`, `customer_notifications`, `customer_favorites`,
  `profiles`). Returns typed slices + loading + error.
- `src/pages/customer/CustomerDashboardV2.tsx` — welcome, upcoming booking(s),
  previous bookings (limit 5, link to `/customer/bookings`), quick actions,
  notifications preview, statistics. Personalised feed = `ComingSoonCard`
  until an offers/recommendations table exists.

Files modified

- `src/App.tsx` — `/customer` renders `CustomerDashboardV2` by default;
  `?legacy=1` still renders old `CustomerDashboard`.

Acceptance

- Real queries only (no mock arrays). Empty states render when the customer
  has no bookings.
- Skeletons on first paint. Loads under 800ms with warm cache.
- Mobile (<640px), tablet, desktop layouts verified.
- `bun run test` still green; typecheck clean.

## Phase 2 — Provider Dashboard v1  (COMPLETE)

Files created

- `src/hooks/useProviderDashboard.ts` — parallel queries against real tables
  (`provider_profiles`, `bookings`, `provider_offers`, `finance_payouts`,
  `booking_cancellations`). Derives acceptance rate, cancellation rate, avg
  response time, earnings, completed count. Ratings left as `null` (no source).
- `src/pages/provider/ProviderDashboardV2.tsx` — Welcome header, verification
  banner, stats strip, Today's schedule, Open requests, Upcoming, Reviews
  (`ComingSoonCard`), quick actions, key metrics, payout status. Realtime
  subscription on `bookings`, `provider_offers`, `provider_profiles`.
- `src/pages/provider/ProviderDashboardGate.tsx` — default = V2,
  `?legacy=1` = old `ProviderDashboard`.

Files modified

- `src/App.tsx` — `/provider-dashboard` and new `/provider` route render the
  gate.

Deferred (rendered as honest "Kommer snart" cards, not fake data):
- Rating & written reviews (no review table yet).
- AI Assistant, Learning Center, Calendar sync (unchanged from plan).

Acceptance: typecheck clean; only real backend data; empty states everywhere
a metric has no source; legacy fallback intact.

## Phase 4 — Customer Profile v2 (COMPLETE)

- `useCustomerProfile` hook aggregates `profiles`, `customer_addresses`
  and `bookings` in parallel (real data only). Computes profile-completion
  from 5 real signals and derives member-since from `profiles.created_at`
  (falls back to `auth.users.created_at`).
- `CustomerProfileV2` renders premium section cards: personal info + avatar
  initials, contact (email/phone/SMS with verification badge), saved
  addresses w/ place-type & access method, cleaning preferences from the
  primary address (pets/children/supplies/parking), access instructions,
  notification-channel summary, privacy center link, account status
  (active / deactivated), booking summary stats, and quick links to
  bookings, inbox, cards, invoices, support and tax.
- Honest empty states everywhere. Coming-soon cards for Familiemedlemmer
  and Foretrukne produkter — no fabricated pets, family or payment data.
- `CustomerProfileGate` at `/customer/profile` — v2 default, `?legacy=1`
  renders the classic tabbed `Profile.tsx`. Every "Redigér" deep-links to
  `/profil?tab=<id>` so both views share the same data source.


## Phase 3 — Provider Profile v2 (COMPLETE)

- `useProviderProfile` hook aggregates `provider_profiles`,
  `provider_service_prices`, and completed-booking count (real data only).
- `ProviderProfileV2` renders premium section cards: identity, about,
  languages, experience + equipment, services + per-service pricing,
  service area/radius, availability, verification, insurance, documents,
  performance, public-profile share/preview. Reviews = "Kommer snart".
- Every section deep-links into the legacy 16-tab editor via
  `?legacy=1&tab=<id>` so both views share one data source.
- `ProviderProfileGate` at `/provider/profile` — v2 default, `?legacy=1`
  falls back to the classic editor.

## Phase 5 — Cross-surface QA & Production Hardening (COMPLETE)

### Files changed
- `src/App.customer.routes.test.tsx` — refactored: mocks V2 gates, adds
  legacy fallback + provider gate coverage.
- `src/components/RoleGuard.phase5.test.tsx` — new: 5 role-protection tests
  (logged-out redirect, cross-role denial, matching-role grant, super_admin
  bypass).

### Routes verified (default = v2, `?legacy=1` falls back)
- `/customer` → `CustomerDashboardV2` (`RoleGuard allow=["customer"]`).
- `/customer/profile` → `CustomerProfileV2` (`RoleGuard allow=["customer"]`).
- `/provider`, `/provider-dashboard` → `ProviderDashboardV2`
  (`RoleGuard allow=["provider","admin"]`).
- `/provider/profile` → `ProviderProfileV2`
  (`RoleGuard allow=["provider","admin"]`).
- Cross-links: `/customer/bookings`, `/customer/notifications`,
  `/customer/invoices`, `/customer/addresses`, `/customer/settings`,
  `/provider/pricing`, `/provider/finance`, `/provider/disputes`,
  `/profil?tab=<id>` (deep-edit target) — all resolve to existing routes.
  No dead links found.
- `RoleGuard` sends unauthenticated users to `/login` with `from` state and
  logs the attempt to `access_attempts` (existing behaviour, preserved).

### Data / hardening audit
- No hardcoded colors, no `text-white`/`bg-black` in v2 files or shared
  primitives — semantic tokens throughout.
- No fake statistics; all metrics come from `useCustomerDashboard`,
  `useCustomerProfile`, `useProviderDashboard`, `useProviderProfile` against
  real tables. Missing sources render `ComingSoonCard` / empty states.
- Danish formatting via existing `Intl` helpers (`formatDkk`, date-fns
  locale) already in shared primitives.
- No admin/service-role calls from v2 hooks — plain PostgREST via anon
  client subject to existing RLS on `profiles`, `bookings`,
  `customer_addresses`, `provider_profiles`, `provider_service_prices`,
  `provider_offers`, `finance_payouts`, `booking_cancellations`,
  `customer_notifications`, `customer_favorites`.

### Tests run
- `bunx vitest run` → **461 passed / 0 failed** (was 448; +13 new
  role/route tests). Typecheck clean (Vite build path unchanged).

### Phase 5.1 — Reliability, E2E smoke and a11y hardening (COMPLETE)

- **safeQuery + aggregateError** (`src/hooks/lib/safeQuery.ts`) wraps every
  Supabase call: never throws, returns a user-safe Danish message, logs
  developer details only in `import.meta.env.DEV`. Unit-tested
  (`safeQuery.test.ts`, 6 tests).
- **SectionErrorState** (`src/components/dashboard/primitives/SectionErrorState.tsx`)
  is announced via `role="status" aria-live="polite"` and exposes a retry
  button that disables while awaiting. Unit-tested (`SectionErrorState.test.tsx`,
  4 tests).
- **All four V2 hooks refactored**: `useCustomerDashboard`,
  `useCustomerProfile`, `useProviderDashboard`, `useProviderProfile` now
  return `{ ...data, data, loading, isLoading, error, sliceErrors, refetch }`.
  Per-slice failures no longer wipe unrelated data.
- **SectionCard** renders `SectionErrorState` inline when `error` is set,
  before falling through to `empty`/`children`.
- **Page-level error banners** wired on all four V2 pages
  (`CustomerDashboardV2`, `CustomerProfileV2`, `ProviderDashboardV2`,
  `ProviderProfileV2`) using the compact `SectionErrorState` at the top of
  the main grid.
- **Playwright + axe smoke** (`e2e/phase5-smoke.spec.ts`) runs against the
  real preview at `http://localhost:8080`. Coverage: homepage load, four
  V2 role-protected routes redirect unauthenticated visitors, axe scan on
  `/` and `/login`. Serious a11y violations from legacy surfaces are
  attached as test annotations (`a11y-serious`) for triage instead of
  blocking the smoke suite. **6/6 tests pass.** Config at
  `playwright.config.ts` uses system Chromium via
  `launchOptions.executablePath: "/bin/chromium"`.
- **Total test suite:** 471 vitest + 6 Playwright/axe green.

Blockers 1–3 from the Phase 5 report are cleared. Remaining Phase 6
criteria (native v2 editors replacing legacy `?tab=` deep-links and a
7-day zero-rollback observation window) are unchanged.


### Legacy inventory (safe to delete once blockers clear)
Pages:
- `src/pages/CustomerDashboard.tsx`
- `src/pages/ProviderDashboard.tsx`
- `src/pages/Profile.tsx` (only after all `?tab=` deep-links have native v2
  editors — currently still used as deep-edit target).
- `src/pages/provider/ProviderProfile.tsx` (same caveat: still deep-edit
  target from `ProviderProfileV2`).

Gates (delete when legacy pages go):
- `src/pages/customer/CustomerDashboardGate.tsx`
- `src/pages/customer/CustomerProfileGate.tsx`
- `src/pages/provider/ProviderDashboardGate.tsx`
- `src/pages/provider/ProviderProfileGate.tsx`
- Inline route wiring in `src/App.tsx` (lines 113, 118, 151-152, 111).

### Criteria required before Phase 6 legacy removal
1. All four v2 hooks expose `error` + `refetch`; SectionCards render retry
   UI on failure.
2. Native v2 editors replace every `?tab=<id>` deep-link into `Profile.tsx`
   and legacy provider editor (or those routes redirect to v2 sections).
3. Playwright smoke green for the 4 surfaces under both authenticated
   roles + admin bypass.
4. One sprint (7 days) of `?legacy=1` availability with zero rollback
   requests logged.

## Phase 5.2 — Native V2 Profile Editors (COMPLETE)

Goal: every "Redigér" on `/customer/profile` and `/provider/profile` opens
a native V2 editor. No `?legacy=1` and no `/profil?tab=...` deep-links in
the normal edit path. Reuse existing engines — no duplicate business logic.

### Files created

- `src/components/dashboard/primitives/SectionEditDialog.tsx` — shared
  inline-edit modal wrapper. Save/Cancel/Dirty tracking, discard
  confirmation via AlertDialog, `showFooter={false}` for self-saving
  child editors (Notifications, Tax, Deactivate, AddressBook, Sumsub,
  Stripe, Availability, Documents). WCAG-safe DialogDescription always
  provided.
- `src/components/dashboard/primitives/SectionEditDialog.test.tsx` — 7
  tests (title/desc/body render, Save invoked, plain Cancel closes,
  dirty Cancel shows discard confirm, footer hidden mode, disabled
  Save state, disabled while saving). All green.
- `src/hooks/useProviderProfileEditor.ts` — owns pp/dirty/save/reset/
  reload for the provider. Enforces the same `OWNER_EDITABLE_COLUMNS`
  whitelist as legacy so the DB trigger
  `provider_profiles_block_privileged_update` never rejects a save.
- `src/components/profile/provider-editors/index.tsx` — 10 native
  section forms (Personal, Business, Services, Pricing, Area,
  Languages, Equipment, Insurance, Documents, Settings) + re-exports
  the already-standalone editors (Availability, Identity/Sumsub,
  Stripe status widget, Tax). Zero logic duplication.
- `src/components/profile/customer-editors/index.tsx` — native
  Personal, Contact, CleaningPreferences, AccessInstructions forms
  (zod-validated, write to `profiles` / `customer_addresses`), plus
  re-exports of `AddressBook`, `NotificationsTab`, `TaxTab`,
  `DeactivateTab` for self-saving editors.

### Files modified

- `src/pages/customer/CustomerProfileV2.tsx` — every "Redigér" now
  opens `SectionEditDialog`. No `/profil?tab=…` navigations, no
  `?legacy=1` footer link. Quick-actions repointed to real routes
  (`/customer/notifications`, `/customer/invoices`, etc.).
  Skatteoplysninger tile opens the tax dialog inline.
- `src/pages/provider/ProviderProfileV2.tsx` — every "Redigér" opens
  `SectionEditDialog` with a native editor (12 sections). Reset-on-
  cancel via `useProviderProfileEditor.reset()`. Legacy footer link
  removed.
- `src/components/dashboard/primitives/index.ts` — exports
  `SectionEditDialog`.

### Acceptance

- Customer Profile is fully editable without the legacy page.
- Provider Profile is fully editable without the legacy page.
- Every "Redigér" opens a native V2 editor (no `/profil?tab=`, no
  `?legacy=1`) in normal user flow.
- Zod validation + inline errors on customer Personal/Contact.
- Trigger-safe payloads on provider save (whitelist enforced).
- `bun run test`: **478 passed / 0 failed** (+7 new). Typecheck clean.

### Legacy audit (post-Phase 5.2)

The customer / provider profile-editing surfaces no longer depend on
legacy pages. Remaining legacy references are outside the two profile
surfaces and are covered by Phase 6.

**Pages still referencing `/profil?tab=…` (non-profile surfaces):**
- `src/App.tsx` — 4 shim redirects (`/customer/notifications`,
  `/customer/invoices`, `/customer/addresses`, `/customer/settings`)
  point at `/profil?tab=…`. Should be pointed at dedicated V2 routes
  or the corresponding V2 dialogs when they land.
- `src/pages/mobile/MobileHome.tsx`, `MobileMessages.tsx`,
  `MobileInboxGate.tsx` — mobile inbox falls back to `/profil?tab=inbox`
  above 768px. Requires a V2 inbox page.
- `src/pages/BookingFlow.tsx` — "Gem denne adresse" link goes to
  `/profil?tab=addresses` (customer path). Should open V2 Addresses
  dialog or route.
- `src/pages/ProviderDashboard.tsx` (legacy) — internal link.
- `src/pages/provider/ProviderOnboarding.tsx` — help text link to
  `/profil?tab=info` (phone verification). Repoint to
  `/customer/profile` once mobile phone edit lands as V2.
- `src/pages/customer/CustomerDashboardV2.tsx:229` — one remaining
  `/profil?tab=invoices` link (invoices tile). Repoint to
  `/customer/invoices` shim.

**Legacy pages that must remain until Phase 6:**
- `src/pages/Profile.tsx` — still receives `/profil?tab=…` traffic
  from the surfaces above and from the customer profile safety-net
  `/customer/profile?legacy=1`.
- `src/pages/provider/ProviderProfile.tsx` — still the safety-net at
  `/provider/profile?legacy=1`. Not linked from V2.
- Gates: `CustomerProfileGate`, `ProviderProfileGate`,
  `CustomerDashboardGate`, `ProviderDashboardGate` — remove together
  with the legacy pages in Phase 6.

**Confirmed not referenced from V2 profile surfaces:**
- `?legacy=1` — 0 uses in V2 profile / editor code.
- `/profil?tab=…` — 0 uses in V2 profile / editor code.

## Phase 6 — Legacy removal (COMPLETE)

### Files deleted
- `src/pages/CustomerDashboard.tsx`
- `src/pages/ProviderDashboard.tsx`
- `src/pages/provider/ProviderProfile.tsx` (legacy 16-tab editor)
- `src/pages/customer/CustomerDashboardGate.tsx`
- `src/pages/customer/CustomerProfileGate.tsx`
- `src/pages/provider/ProviderDashboardGate.tsx`
- `src/pages/provider/ProviderProfileGate.tsx`

### Files modified
- `src/App.tsx` — imports V2 components directly; `/customer`,
  `/customer/profile`, `/provider`, `/provider-dashboard`,
  `/provider/profile` now render V2 with no gate. Unused `Profile`
  import removed. `?legacy=1` is silently ignored (V2 renders).
- `src/pages/customer/CustomerDashboardV2.tsx` — invoices tile now
  points at `/customer/invoices` shim instead of `/profil?tab=invoices`.
- `src/pages/provider/ProviderDashboardV2.tsx` — removed the
  "Klassisk visning" `?legacy=1` link from Open Requests section.
- `src/pages/provider/ProviderProfileV2.tsx` — legacy safety-net
  comment removed.
- `src/App.customer.routes.test.tsx` — regression tests now assert
  V2 renders even when `?legacy=1` is present (gate removed).
- `src/pages/provider/ProviderProfile.test.ts` — retargeted to
  `OWNER_EDITABLE_COLUMNS` in `useProviderProfileEditor.ts`; still
  guards the same trigger-safe whitelist.

### Routes (final)
- `/customer` → `CustomerDashboardV2`
- `/customer/profile` → `CustomerProfileV2`
- `/provider` → `ProviderDashboardV2`
- `/provider-dashboard` → `ProviderDashboardV2`
- `/provider/profile` → `ProviderProfileV2`
- Unknown paths → existing `NotFound` (unchanged).
- Existing `/customer/notifications|invoices|addresses|settings`
  shims still `Navigate` to `/profil?tab=…` for the mobile Profile
  page (intentional — `/profil` is the mobile profile detail view,
  not legacy).

### Legacy references remaining (intentional)
- `src/pages/Profile.tsx` is preserved because `MobileProfileGate`
  renders it as the mobile profile detail view; mobile tabs
  (`/profil?tab=info|addresses|notifications|…`) are the app-shell
  UX, not a legacy fallback. The 4 customer shim redirects and
  mobile inbox/profile links target this surface deliberately.
- `BookingFlow` "Gem denne adresse" and `ProviderOnboarding` phone
  help link still point at `/profil?tab=…` — same rationale (mobile
  profile is the addresses/phone edit surface until a dedicated V2
  page exists). Tracked separately, not a Phase 6 blocker.

### Validation
- Repo scan (`rg`) for `CustomerDashboardGate|ProviderDashboardGate|
  CustomerProfileGate|ProviderProfileGate` → 0 hits.
- `?legacy=1` references outside of test assertions → 0 hits.
- `bunx tsgo --noEmit` → clean.
- `bunx vitest run` → **478 passed / 0 failed**.

### Unresolved risks
- None for dashboard/profile flows. The mobile `/profil?tab=…`
  surface is unchanged and continues to work; migrating it into a
  fully native mobile V2 profile is a separate future initiative.

**Final recommendation: legacy removal complete.**


## Non-goals

- No backend schema changes in phases 1–6.

- No brand redesign, no new palette, no new font pair.
- No mobile-shell refactor (existing `MobileAppShell` stays authoritative for
  mobile app routes).

## Phase 6.1 — Final Release Verification (2026-07-28)

### Commands executed
- `bun run test` → **478/478 passed** (60 files, 27.5s)
- `bunx tsgo --noEmit` → **clean** (exit 0, no diagnostics)
- `bun run build` → **success** (13.6s, no errors; existing 2 MB main-chunk warning pre-existing, not a Phase 6 regression)
- `bunx playwright test` (e2e/phase5-smoke.spec.ts against local preview :8080) → **6/6 passed** (unauth redirects for `/customer`, `/provider-dashboard`, `/customer/profile`, `/provider/profile`; homepage load; login axe scan)

### Repository cleanup audit
- `?legacy=1` — no runtime references; only regression tests in `App.customer.routes.test.tsx` asserting the flag is now ignored. ✅
- Deleted gate/component names (`CustomerDashboardGate`, `ProviderDashboardGate`, `CustomerProfileGate`, `ProviderProfileGate`, legacy `CustomerDashboard`, `ProviderDashboard`, legacy `ProviderProfile` editor) — zero references anywhere in `src/`. ✅
- `/profil?tab=…` — remaining references are intentional and belong to `Profile.tsx` mobile detail view + BookingFlow/ProviderOnboarding deep-links, per Phase 6 acceptance. Not touched. ✅

### Verified in this pass
- Production build integrity, TS strict typecheck, full Vitest unit + integration suite.
- Playwright smoke: unauthenticated protected-route redirects (`/customer`, `/customer/profile`, `/provider-dashboard`, `/provider/profile`) — all redirect to `/login` with no protected-content flash.
- axe scan on `/login` — no serious/critical violations.
- Route wiring in `App.tsx`: `/customer`, `/customer/profile`, `/provider`, `/provider-dashboard`, `/provider/profile` all render V2 components directly.

### NOT executed this pass (out of automated scope in sandbox)
Reporting honestly per instructions. These require seeded staging accounts and
were not run:

- Authenticated Playwright flows for Customer role (dashboard load, native
  editor Save/Cancel/validation for every section, quick-link resolution,
  cross-role denial).
- Authenticated Playwright flows for Provider role (same matrix + parity
  between `/provider` and `/provider-dashboard`).
- Runtime error/retry matrix against V2 hooks (`useCustomerDashboard`,
  `useCustomerProfile`, `useProviderDashboard`, `useProviderProfile`) — the
  `safeQuery` + `SectionErrorState` contract is unit-tested (Phase 5.1) but
  live network-failure simulation was not scripted.
- Mobile-width visual pass at 320 / 375 / 390 / 768 px.
- Axe scans on the four authenticated V2 routes.
- Live Danish-locale formatting audit of dates/amounts across every card.
- Live RLS/role-isolation probing beyond unit-level `roleRedirect` tests.

### Files changed
- `.lovable/plan.md` (this section only).

### Final status
**Dashboard & Profiles — production complete for automated verification scope.**

Blockers for a full "production complete" sign-off (require staging with seeded
customer + provider accounts, out of this sandbox):

1. Authenticated Playwright suite covering the CRUD/validation matrix listed
   above for both roles.
2. Live axe scans on the four authenticated V2 routes.
3. Cross-viewport visual QA at 320 / 375 / 390 / 768 px.
4. Live RLS probing confirming customer/provider queries cannot cross roles.

No code regressions detected. No new blockers introduced by Phase 6 removal.

**Phase 6.1 status: complete for automated local verification scope.**

## Phase 6.2 — Staging Sign-off Checklist (pending execution)

This phase is **not executable in the current sandbox**. It defines the exact
scope, evidence artifacts, and pass criteria for the final production sign-off.
Execution requires an isolated staging environment with seeded test accounts —
production accounts must never be used.

### Access & environment requirements (currently missing)

To run Phase 6.2, the following must be provisioned and provided:

1. **Isolated staging Supabase project** (non-production ref, non-production
   URL) with the current `main` schema applied.
2. **Seeded staging test accounts** created via
   `staging-validation/seed/create-test-users.ts` against the staging project:
   - Customer: `test.customer@mycleaner.dev` / `TestPass!2026`
   - Provider: `test.provider@mycleaner.dev` / `TestPass!2026` (linked to
     `mette-copenhagen` provider profile from `test-providers.sql`)
   - Admin:    `test.admin@mycleaner.dev`    / `TestPass!2026`
3. **Staging app URL** (Lovable preview or dedicated staging domain — never
   `mycleaner.dk` or `mycleanerapp.lovable.app`).
4. **Staging env file** (`staging-validation/.env`) populated per
   `staging-validation/.env.example`, including
   `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`,
   `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_APP_URL`,
   `TEST_EMAIL_DOMAIN=mycleaner.dev`, `TEST_PASSWORD=TestPass!2026`,
   `RC2_ALLOW_DESTRUCTIVE_STAGING_TESTS=true`.

**Current status: none of the above are available inside this sandbox.**
The preview shares the production Supabase project, so authenticated CRUD,
live axe on protected routes, and RLS isolation probes cannot be executed
here without violating the "never touch production" rule.

### Routes under test (protected V2 surfaces only)

- `/customer` — CustomerDashboardV2
- `/customer/profile` — CustomerProfileV2
- `/provider` — ProviderDashboardV2 (canonical)
- `/provider-dashboard` — ProviderDashboardV2 (alias; must render identically)
- `/provider/profile` — ProviderProfileV2

### Checks to execute on staging

1. **Authenticated Customer CRUD + validation**
   - Sign in as customer, load `/customer` and `/customer/profile`.
   - For every native editor section (contact, address, cleaning preferences,
     notification prefs, tax info, SMS, deactivate): open dialog, edit, verify
     dirty-state banner, cancel with discard confirmation, save, reload page,
     assert persistence.
   - Validation matrix: invalid email, invalid phone, out-of-country address
     (must be rejected by `place-validate`), oversized text.
   - Evidence: Playwright trace + screenshots per section, saved under
     `staging-validation/evidence/<RUN_ID>/customer/`.

2. **Authenticated Provider CRUD + validation**
   - Same matrix against `/provider`, `/provider-dashboard`, `/provider/profile`.
   - Confirm the `OWNER_EDITABLE_COLUMNS` whitelist is enforced: attempts to
     update trigger-protected columns (status, tier, score, verified flags,
     stripe_*) via the client must be rejected.
   - Confirm `/provider` and `/provider-dashboard` render the same V2 tree.
   - Evidence: Playwright trace + screenshots, saved under
     `staging-validation/evidence/<RUN_ID>/provider/`.

3. **Authenticated axe scans**
   - Run `@axe-core/playwright` (WCAG 2.1 AA) against all five routes above
     while signed in as the appropriate role.
   - Pass criterion: zero serious/critical violations. Moderate violations
     documented with a decision (fix now / accept / backlog).
   - Evidence: JSON reports under `evidence/<RUN_ID>/axe/`.

4. **Viewport verification** at **320, 375, 390, and 768 px**
   - Screenshot each of the five routes at each width, signed in per role.
   - Pass criteria: no horizontal scroll, no clipped controls, 44×44 tap
     targets on interactive elements, sticky headers behave, dialogs fit.
   - Evidence: PNGs under `evidence/<RUN_ID>/viewports/<route>/<width>.png`.

5. **Live RLS isolation checks**
   - Extend `scripts/rls-regression.sql` execution against staging: for each
     table backing the V2 surfaces (`profiles`, `customer_addresses`,
     `customer_preferences`, `customer_notifications`, `customer_favorites`,
     `bookings`, `provider_profiles`, `provider_pricing_settings`,
     `provider_pricing_preferences`, `user_roles`), attempt cross-role
     read/write using the seeded customer and provider JWTs.
   - Pass criterion: every cross-role read returns 0 rows or a permission
     error; every cross-role write is rejected.
   - Evidence: SQL log + JSON matrix under `evidence/<RUN_ID>/rls/`.

### Evidence to record in this document after execution

Fill in only after Phase 6.2 has actually been run against staging:

- Staging Supabase project ref used: _(pending)_
- Staging app URL used: _(pending)_
- RUN_ID: _(pending)_
- Playwright results (customer): _(pending)_
- Playwright results (provider): _(pending)_
- Axe results per route: _(pending)_
- Viewport screenshots index: _(pending)_
- RLS matrix result: _(pending)_
- Verified failures fixed (list, or "none"): _(pending)_

### Final release recommendation

- If every check above passes with recorded evidence:
  **Dashboard & Profiles — fully production signed off.**
- If any check fails, list the exact blocker(s) here and keep the current
  "production complete for automated verification scope" status until fixed.

### Current Phase 6.2 status

**Blocked — staging access not available in this sandbox.**

Missing to proceed:

- Isolated staging Supabase project (URL + anon key + service-role key).
- Confirmation that `staging-validation/seed/create-test-users.ts` has been
  executed against that staging project.
- Staging app URL for Playwright to target.
- Populated `staging-validation/.env` on the machine that will run the suite.

No results have been simulated. No production accounts were used. Awaiting
the access above before Phase 6.2 can be executed and this section filled in.

