# MyCleaner — Product Vision & Architecture v1.0

Source of truth for every future change. If a new feature conflicts with this
document, the document wins and the feature must be reshaped.

## 1. What MyCleaner is
- Premium European AI-powered marketplace for home services.
- Cleaning is the first category, not the product.
- Categories the architecture must accommodate from day one:
  Cleaning, Window Cleaning, Moving, Gardening, Handyman, Laundry,
  Home Care, Pet Care, and further home services.
- Reference feel: Airbnb / Stripe / Apple / Uber — simple, modern,
  intelligent, fast, trustworthy, local, premium.

## 2. Context Engine (highest priority)
One global engine resolves all context. No page reads hardcoded country,
city, currency, provider list, or copy.

Context surface:
- Country, City, Currency, Language, Timezone
- User type, Login state, Booking history, Favourite providers
- Active campaign, Device type, Service category

Market resolution priority (address always wins):
1. Booking / service address
2. Saved user market (profile)
3. Explicit selector choice (persisted)
4. Browser locale / IP (suggestion only)
5. Neutral Europe-wide fallback (never silently default to Copenhagen)

Implementation anchor today: `src/context/ActiveMarketContext.tsx` +
`src/lib/markets.ts`. Extend this engine — do not create parallel context
stores. Market changes must update all dependent surfaces instantly, no
reload.

## 3. Dynamic Content Engine
No static homepage copy. Headlines, hero text, subtitles, provider
suggestions, reviews, marketplace activity, promotions, statistics, and
service recommendations are all derived from context (time of day, day of
week, season, returning-customer state, active campaign, market).

Examples: morning greeting, weekend scarcity, holiday framing, returning
customer with named favourite provider.

## 4. AI Concierge
A first-class assistant, not a chatbot. Must be able to: find providers,
explain prices, recommend services, book, modify, cancel, answer FAQs,
contact support, explain policies, onboard new users. Future versions take
actions directly. Always escalates to human support when confidence or
policy requires it.

## 5. Authentication experience
Browsing, searching, comparing providers, and exploring services never
require login. Login is requested only at: start of booking, saving
favourites, sending messages, leaving reviews, accessing dashboards.

## 6. Live marketplace
Homepage must feel alive: providers online, recently completed bookings
(anonymised), current demand, response time, average ratings, available
providers, cities active now. Every value scoped to the active market —
never cross-market activity.

## 7. Trust layer
Visible on every surface. Compliance baked in: GDPR, DSA, EU AI Act
readiness, WCAG 2.2 AA, Cookie Consent Mode v2, DAC7, Stripe Connect
compliance. Users always see who they book, what they pay, what protection
they have.

## 8. Configuration over code
Configurable, not hardcoded: headlines, hero copy, countries, cities,
languages, currencies, promotions, service categories, homepage banners,
AI prompts, legal texts, provider badges, dynamic statistics. Launching a
new country is primarily configuration.

## 9. Scalability
European expansion must not require architectural changes. No
country-specific branches, no duplicated logic, no hardcoded values.
Every feature is reusable across categories and markets.

## 10. UX principles
Fast, clear, mobile-first, accessible, human, predictable, minimal,
premium. Minimise clicks. Guide users naturally through the booking
journey.

## 11. Non-negotiables for future work
- No hardcoded city / country / currency / copy in components.
- No new context/provider that bypasses the Context Engine.
- No category-specific UI that cannot be reused for other services.
- No login walls before booking / favouriting / messaging / reviewing.
- No cross-market data leaking into another market's surface.
- Trust and compliance surfaces are part of the feature, not follow-up.
