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

### Unresolved (BLOCKERS for legacy deletion in Phase 6)
1. **Hook error surfacing.** `useCustomerDashboard`, `useCustomerProfile`,
   `useProviderDashboard`, `useProviderProfile` swallow query errors and
   expose only `loading` + `data`. Add `error` + `refetch` and wire a
   user-friendly retry state on each `SectionCard` before deleting legacy
   fallbacks.
2. **Playwright smoke against real preview.** Automated e2e for each role
   (customer, provider, admin bypass) on the 4 v2 surfaces not yet
   scripted — required before removing `?legacy=1` safety net.
3. **Accessibility audit.** Automated axe run on all 4 v2 pages pending;
   only static code review done this phase.

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

## Phase 6 — Legacy removal

Blocked on Phase 5 criteria above. When cleared, delete files listed in
"Legacy inventory" and simplify `src/App.tsx` routes to render V2
components directly.


## Non-goals

- No backend schema changes in phases 1–5.
- No brand redesign, no new palette, no new font pair.
- No mobile-shell refactor (existing `MobileAppShell` stays authoritative for
  mobile app routes).
