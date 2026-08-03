# Campaign Engine — rate-limit durability

_Last updated: Milestone 3_

## Persistence mechanism

All Campaign Engine rate-limit counters are stored in Postgres tables, **not** in edge-function process memory. The two counter tables are:

| Table                        | Purpose                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `public.campaign_apply_attempts` | One row per submission attempt to `campaign-apply`.                     |
| `public.campaign_events`         | One row per public analytics event to `campaign-track-event` (also used as the per-IP counter for event flooding). |

Both tables live in the primary database that every edge-function instance
connects to via the service role. There is **no** local Deno `Map`,
`WeakMap`, or `KV` cache in the request path; every rate-limit decision
issues a fresh Postgres query.

## Atomicity and concurrency protection

Rate-limit checks are read-then-decide using
`SELECT count(*)` filtered by `(campaign_id, ip / email, created_at >= now() - window)`. Because reads are followed by an `INSERT` (`recordAttempt`), two
concurrent requests from the same IP can each observe a count of _n − 1_
and both be admitted (classic TOCTOU). This is acceptable for the current
threat model because:

1. The counters are used for abuse throttling, not authentication, so a
   ±1 admission near the limit is not a security risk.
2. The DB triggers `campaign_application_classify` and the unique index
   `(campaign_id, email) WHERE deleted_at IS NULL` provide the authoritative
   duplicate protection — no two applications can share `(campaign, email)`
   regardless of how the rate-limit races.
3. Turnstile verification runs before every apply, so drive-by automation
   is filtered upstream of the DB counters.

If we later need strict atomicity we can migrate the counter to an
advisory-locked `RPC` that reads and inserts in the same transaction — the
current callers are already funneled through `checkApplyRateLimit` and
`recordAttempt` so this is a single-function change.

## Expiry behaviour

There is no TTL column. The count is time-bounded at query time using
`created_at >= now() - interval`. Old rows are still visible in the table
but do not count against future decisions.

A retention job (to be scheduled in Milestone 4) will prune rows older
than 30 days from both tables. Until then the retention worker's
`retention_worker_runs` catalogue can be extended with new tasks
`campaign_apply_attempts_prune` and `campaign_events_prune`.

## IP handling and privacy

IPs are captured from `cf-connecting-ip`, then `x-forwarded-for` (first
hop), then `x-real-ip`. Stored raw on the attempt row because we need
exact-match lookups for the rate-limit window. Privacy controls:

- Rows are readable only by admins (RLS).
- The retention job (see above) prunes rows after 30 days.
- The GDPR export/delete workers already treat any table containing `ip`
  as in-scope; `campaign_apply_attempts` and `campaign_events` will be
  added to the retention worker in M4.

## Behaviour across multiple edge instances

Because every instance queries the same Postgres table, the limits are
**globally consistent** across all Deno isolates, cold starts, and
regions. A new instance starting up sees the same historical attempts as
a warm instance — there is no in-memory state to lose.

## Current limits

Defined in `supabase/functions/_shared/campaign.ts`:

```ts
export const APPLY_LIMITS: RateLimits = {
  perIpWindowMs:    10 * 60_000,       // 10 minutes
  perIpMax:         5,
  perEmailWindowMs: 24 * 60 * 60_000,  // 24 hours
  perEmailMax:      3,
};
```

Event-endpoint limit (per campaign, per IP): 60 events per 10 minutes.

## Enumeration hardening (M3)

The apply endpoint now returns the same generic `202 { ok: true, message: … }` response for every rate-limited-by-email, campaign-not-found, campaign-not-accepting, country-not-enabled, duplicate-application, and successful-create case. Only:

- `400` malformed input,
- `429 rate_limited` per-IP overflow,
- `503 campaigns_disabled` global flag off,

leak any state — none of which reveals whether a given email address exists in the system.
