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

## Phase 2 — Provider Dashboard v1

Files: `src/pages/provider/ProviderDashboardV2.tsx`,
`src/hooks/useProviderDashboard.ts`, `src/components/provider/dashboard/*`
(TodayScheduleCard, BookingRequestsCard, EarningsSummaryCard,
PerformanceScoreCard, DocumentsCard, MessagesCard).

Real sources: `bookings`, `worker_earnings`, `finance_payouts`,
`provider_profiles`, `provider_score_history`, `provider_trust`,
`identity_verification_attempts`, existing `StripeConnectStatusWidget`,
`useSupportConversations`.

Deferred stubs: AI Assistant card, Learning Center card, Calendar sync card.

Legacy flag: `/provider-dashboard?legacy=1`.

## Phase 3 — Customer Profile v2

Rebuild `src/pages/Profile.tsx` for customer role into a sectioned layout
using existing tabs (info, addresses, notifications, cards, invoices, sms,
tax, deactivate). New sections wired to real backend:

- Personal information (profiles)
- Addresses (customer_addresses)
- Saved payment methods (Stripe SetupIntent flow already exists)
- Preferred language (profiles / i18n)
- Notification settings (existing table if present, else stub)
- Privacy settings + delete account (existing `account_deletion_requests`)

Coming-soon cards: Family members, Pets, Access instructions, Cleaning
preferences, Favourite products.

## Phase 4 — Provider Profile v2 (private edit page)

Rebuild `src/pages/provider/ProviderProfile.tsx`: profile photo, about,
languages, experience, services + prices (existing `ProviderServicePricing`),
working areas + travel radius, availability (existing
`ProviderAvailabilityEditor`), certificates upload, verification badges
(existing `provider_trust`), provider score card, response time + jobs
completed derived from bookings. Cover photo + gallery = coming-soon.

## Phase 5 — Cross-cutting polish

- Global route-change scroll-to-top + progress bar already exist; verify.
- Loading skeletons audited across all four v2 pages.
- Success/empty animations (existing `animate-fade-in`, `hover-scale`).
- Dark-mode pass, WCAG AA contrast pass, keyboard-nav pass.
- Playwright smoke: `/customer`, `/provider-dashboard`, `/profil`,
  `/provider/profile` — render without errors as each role.

## Phase 6 — Legacy removal

Delete `CustomerDashboard.tsx`, `ProviderDashboard.tsx`, old profile branches
after 1 sprint of `?legacy=1` availability with no rollback requests.
Update `nav-config.ts` if any URL changed.

## Non-goals

- No backend schema changes in phases 1–5.
- No brand redesign, no new palette, no new font pair.
- No mobile-shell refactor (existing `MobileAppShell` stays authoritative for
  mobile app routes).
