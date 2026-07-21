# Post-RC2 Backlog

Non-blocking product roadmap items deferred until **after** RC2 sign-off and the staging → production cutover. Nothing on this list is required for RC2, staging parity, or the controlled beta launch.

Priority scale:
- **Critical** — required soon after launch; user trust or revenue impact
- **High** — meaningful UX / growth impact, plan next quarter
- **Medium** — valuable but can wait for a dedicated cycle
- **Low** — nice-to-have, opportunistic

Current UI contract (must hold until each item ships):
- Marketplace and public profile show **no rating** when `total_reviews = 0` — never a placeholder "0.0" or fake star count.
- Provider **score** and **tier** are computed **without** review signals; do not wire review data into scoring until the full pipeline below exists.
- All review-related surfaces stay behind a feature flag (`reviews.enabled`, default OFF) until schema, moderation, fraud prevention and aggregation are all in place.

---

## Trust & reputation

| # | Item | Priority | Notes |
|---|------|---------:|-------|
| 1 | **Review system** — schema (`reviews`, `review_responses`), submission flow gated to completed bookings, one review per booking, edit window, RLS, aggregation into `provider_profiles.average_rating` / `total_reviews` via trigger or scheduled job | Critical | Blocks items 2–4. Must ship with moderation live, not after. |
| 2 | **Review moderation** — admin queue, hide/unhide, reason codes, appeal flow, audit log, notification to author and provider | Critical | Ship with #1. |
| 3 | **Review fraud detection** — velocity limits, device/IP fingerprint checks, provider-authored review detection, mutual-review rings, ML/heuristic scoring, auto-hold thresholds | High | Requires baseline traffic; instrument metrics from day 1 of #1. |
| 4 | **Provider badges** — verified identity, top-rated, fast responder, repeat-customer favourite, dispute-free streak — derived, read-only, revocable | Medium | Depends on #1 for rating-based badges; identity/finance badges can ship earlier. |
| 5 | **Provider achievements** — milestone unlocks (100 bookings, 1 year on platform, etc.) surfaced on public profile | Low | Depends on #4 visual system. |

## Growth

| # | Item | Priority | Notes |
|---|------|---------:|-------|
| 6 | **Referral program** — unique codes per user, attribution, reward ledger, payout hook, anti-abuse (self-referral, chargeback clawback) | High | Needs finance-side reward accounting; coordinate with payouts module. |
| 7 | **Loyalty system** — repeat-booking discounts, tier thresholds, expiry rules, T&Cs surface | Medium | Depends on #6 ledger primitives. |

## Discovery & ranking

| # | Item | Priority | Notes |
|---|------|---------:|-------|
| 8 | **Provider ranking improvements** — incorporate reviews, response time, cancellation rate, recency; A/B framework; ranking transparency page | High | Blocked by #1 for review inputs; other signals can be prototyped now. |
| 9 | **AI recommendations** — personalised provider suggestions (history, location, service mix), cold-start fallback, feedback loop | Medium | Depends on #8 baseline and enough production data. |

## Analytics & BI

| # | Item | Priority | Notes |
|---|------|---------:|-------|
| 10 | **Advanced analytics** — funnel (view → book → complete), cohort retention, provider LTV, refund/dispute rate by segment | High | Requires event tracking spec before implementation. |
| 11 | **BI dashboards** — internal ops dashboards (finance, support, growth, marketplace health) with drill-downs and export | Medium | Consume from #10; do not duplicate the ETL. |

## Other non-blocking

| # | Item | Priority | Notes |
|---|------|---------:|-------|
| 12 | Provider payout scheduling preferences (weekly / on-demand thresholds) | Medium | Finance-side only, no marketplace impact. |
| 13 | Multi-language review translations and localised moderation | Low | Depends on #1–#3. |
| 14 | Customer favourites → saved searches with alerts | Low | Extends existing favourites table. |
| 15 | Provider portfolio media (before/after photos) with moderation | Medium | Reuses moderation queue from #2. |

---

## Sequencing guidance

1. Land RC2, staging cutover, controlled beta — no items from this list.
2. First post-launch cycle: **#1 + #2 together**, feature-flagged rollout to a small provider cohort.
3. Instrument **#3** signals from the moment #1 opens to real users.
4. Only after #1–#3 are stable: enable review inputs to **#8**, then unlock **#4 / #5**.
5. Growth (#6, #7) and analytics (#10, #11) can run in parallel tracks; they do not depend on the review pipeline.

## Out of scope for this backlog

- Anything required for RC2, staging parity, or the operator runbook — those live in `docs/staging/STAGING_SETUP.md` and the RC2 harness.
- Security, compliance and observability items already tracked in `docs/production/`.
