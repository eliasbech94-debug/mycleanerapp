# RC2 — Staging Validation Harness

Reproducible pre-release validation for MyCleaner. One command, real evidence, no fabrication.

## What it does

Runs every scenario in `scenarios/` against a real staging environment
(Stripe **Test Mode**, Sumsub **Sandbox**, staging Supabase) and writes
raw evidence to `evidence/<run-id>/`:

- HTTP request/response transcripts (`http/*.json`)
- Playwright screenshots + traces (`ui/*.png`, `ui/*.zip`)
- DB snapshots before/after each scenario (`db/*.json`)
- Webhook payloads replayed and their responses (`webhooks/*.json`)
- Audit log deltas (`audit/*.json`)
- k6 load metrics (`load/*.json`)
- Final `report.md` + machine-readable `report.json`

If any scenario fails the harness exits non-zero and the report labels
that scenario **FAIL**. There is no code path that silently green-lights
a failure.

## One-command usage

```bash
cd staging-validation
cp .env.example .env         # fill in real staging secrets
bun install
bunx playwright install chromium
./run-rc2.sh
```

Output: `evidence/<timestamp>/report.md`

## What you MUST provide in `.env`

See `.env.example`. Missing values cause `config.ts` to abort before any
scenario runs — the harness will not proceed with placeholders.

Required categories:

1. **Staging Supabase** — URL, anon key, service-role key, DB connection
   string (for snapshot queries).
2. **Stripe Test Mode** — `sk_test_...`, `whsec_...`, publishable key.
3. **Sumsub Sandbox** — app token, secret key, webhook secret.
4. **Test identities** — email domains + a fixed password for seeded
   customer / provider / admin accounts (so re-runs are idempotent).
5. **App URL** — the staging deployment (e.g. `https://staging.mycleaner.dk`).

## Guarantees

- No scenario is marked PASS unless every assertion passed AND the
  evidence file exists on disk.
- Every DB read comes from the staging Postgres via `psql`; no mocked
  clients. Every webhook post is a real HTTPS request; the response
  body and status are saved verbatim.
- Playwright runs headed=false with `trace: 'on'` so any UI failure has
  a replayable trace bundle.

## Layout

```
scenarios/
  01-seed.ts                    -- create/refresh test users, idempotent
  02-provider-lifecycle.spec.ts -- draft → submit → approved → active
  03-customer-booking.spec.ts   -- browse → book → 3DS test card → captured
  04-stripe-webhook-replay.ts   -- replay recorded events, verify DB
  05-sumsub-webhook-replay.ts   -- sandbox reviewAnswer webhooks
  06-marketplace-search.ts      -- correctness + basic timing
  07-concurrent-booking.ts      -- N clients bid on same slot; expect 1 winner
  08-admin-bulk.ts              -- suspend/unsuspend/set_partner in bulk
  09-payout-validation.ts       -- transfer webhook → finance_payouts row
  10-score-tier.ts              -- refresh_provider_score_tier idempotency
  11-failure-recovery.ts        -- kill webhook mid-flight, retry, dedupe
load/
  k6-marketplace.js             -- search_marketplace_providers_v1 under load
  k6-webhook.js                 -- stripe-webhook throughput + retry
```

## What this harness intentionally does NOT do

- It does not run against production.
- It does not create real Stripe transfers on live accounts (Connect test
  accounts only).
- It does not send real SMS (GatewayAPI credentials required, else scenario
  is skipped and marked SKIP, never PASS).
- It does not touch `country_configs` or feature flags — those are
  environment state, not test state.
