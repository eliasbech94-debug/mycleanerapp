# MyCleaner Platform Constitution v1.0

> Highest architectural authority for MyCleaner. Overrides feature-specific decisions. All future work must comply.

## Vision
MyCleaner is a scalable European Service Marketplace Platform. Cleaning is only the first category. Build reusable platform capabilities, not one-off features.

## Core Philosophy
Never build features — build engines. Everything reusable, configurable, scalable, and ready for future services.

## Platform Engines
All functionality must belong to one of these engines:

**Core Platform:** Authentication, Authorization, Country, Localization, Currency, Tax & VAT, Pricing, Dynamic Pricing, Booking, Availability, Calendar, Payment, Payout, Campaign, Experience, Notification, Messaging, Search, Recommendation, Analytics, AI, Review, Trust, Provider, Customer, Loyalty, Referral, Operations, Feature Flag, Audit, Storage.

New functionality extends an existing engine whenever possible.

## Experience Engine
Every page must be capable of becoming dynamic. No hardcoded experiences. Personalization inputs may include: country, language, region, city, customer/provider/booking history, campaign eligibility, ratings, favorites, device, referral source, auth state, time, season, feature flags. Everything must work without personalization enabled. No dark patterns. No hidden AI decisions. Decisions must be explainable.

## Design System
The platform must feel like one product. Reuse existing buttons, cards, forms, navigation, typography, spacing, animations, icons, colors, modals, tables, loaders, empty/error states. Never duplicate UI. Never hardcode design values — always use design tokens. New components must be generic, reusable, and added to the Design System. Internal Design System page: `/admin/design-system` (admins/devs only).

## Operations Engine
Background jobs are platform services: Email/Notification/Push/SMS queues, Background/Cleanup/Retry workers, Dead Letter Queues, Health Monitoring, Metrics, Cron, Feature Flags, Audit Events. Internal Operations dashboard: `/admin/operations`. Show queue health, failed jobs, workers, flags, storage, DB, Stripe, API, email, push. No operational secrets exposed.

## Country Engine
Nothing country-specific may be hardcoded. Configurable: language, currency, VAT, legal texts, pricing, campaigns, email/push/SMS templates, tax rules, provider requirements, supported services.

## Personalization
All future content should support personalization (homepage, dashboard, campaigns, recommendations, provider lists, news, offers, notifications, search, ordering). Never expose sensitive data. Always respect consent. GDPR by design.

## AI
AI assists — never silently decides. Recommendations must be overridable and explainable. AI must never bypass security.

## Security
Security by design. Least privilege. Service Role only where required. RLS everywhere. Append-only audit. Feature flags. Soft delete. Immutable history. No secrets in logs/analytics/URLs. Hash sensitive tokens. Signed URLs. Short-lived credentials. Idempotency everywhere.

## Development Principles
Reuse before creating. Configure before hardcoding. Engines before features. Review before merge. Test before release. Security before convenience. Consistency before creativity. Performance before complexity. Architecture before implementation.

## UI Principles
Premium. Calm. Fast. Minimal. Friendly. Professional. Apple-level consistency, Stripe-level clarity, Airbnb-level usability. Everything native.

## Accessibility
WCAG AA minimum. Keyboard navigation. Visible focus. ARIA. Contrast. Reduced motion. Screen reader support.

## Performance
Lazy loading. Caching. Server-side filtering. Optimistic updates where safe. Minimal bundle. Avoid unnecessary re-renders. Measure before optimizing.

## Marketplace Principles
Providers choose availability. Customers request bookings. Providers approve. Platform verifies and protects both parties. Architecture must already support future categories.

## Future Services (no arch changes required)
Cleaning, Window Cleaning, Gardening, Moving, Handyman, Laundry, Pet Care, Child Care, Senior Assistance, Business Services.

## Final Principle
For every new feature ask: *Can this become a reusable platform capability?* If yes — build the capability, not the feature.
