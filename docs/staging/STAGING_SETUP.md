# MyCleaner Staging Environment — Operator Runbook

**Status:** written but not executed. This document is the single source of
truth for provisioning `mycleaner-staging`. Follow top-to-bottom; every step
is idempotent so you can re-run any phase after a failure.

**Naming convention used everywhere:**

| Resource        | Name                                        |
|---              |---                                          |
| Supabase project| `mycleaner-staging`                         |
| Lovable project | `mycleaner-staging`                         |
| Frontend URL    | `https://staging.mycleaner.dk`              |
| Fallback URL    | `https://mycleaner-staging.lovable.app`     |
| Stripe          | existing account, **Test mode**             |
| Sumsub          | existing tenant, **Sandbox** app token      |
| Seed tag        | `seed=rc2-demo` + email prefix `demo+`      |

**Estimated time:** ~2h 30m active work + ~1h async waiting (DNS + TLS cert).

---

## Phase 0 — Prerequisites

Install locally:

```bash
brew install supabase/tap/supabase   # or scoop install supabase
brew install stripe/stripe-cli/stripe
brew install k6                       # optional, load tests only
node -v                               # ≥ 20
bun -v                                # ≥ 1.1
```

Log in:

```bash
supabase login
stripe login                          # opens browser, TEST MODE
```

---

## Phase 1 — Supabase staging project

### 1.1 Create project (dashboard)

1. Go to <https://supabase.com> → **New project**.
2. Name `mycleaner-staging`, same region as production, Pro plan.
3. Save into your password manager:
   - Project ref (e.g. `abcdefghijklmnop`)
   - Database password
   - `service_role` key
   - `anon` key
   - Project URL

### 1.2 Link + push migrations

```bash
# From the repo root:
supabase link --project-ref <STAGING_REF>
supabase db push
```

Expect ~5 min. On success every table listed in `supabase/migrations/` exists.

### 1.3 Deploy every edge function

```bash
supabase functions deploy --project-ref <STAGING_REF>
supabase functions list --project-ref <STAGING_REF> | wc -l   # expect 96
```

### 1.4 Set edge-function secrets

Copy `staging.secrets.example` → `staging.secrets`, fill in real values, then:

```bash
supabase secrets set --project-ref <STAGING_REF> --env-file staging.secrets
supabase secrets list --project-ref <STAGING_REF>   # names only, values masked
```

Verify parity with production secret names:

```bash
supabase secrets list --project-ref <PROD_REF>    > /tmp/sec-prod.txt
supabase secrets list --project-ref <STAGING_REF> > /tmp/sec-stg.txt
diff /tmp/sec-prod.txt /tmp/sec-stg.txt          # values not shown by CLI
```

### 1.5 Storage buckets

The migrations create every bucket. Confirm the expected buckets exist by
querying the linked project directly (`supabase storage list` is not a stable
CLI command across versions):

```bash
psql "$STAGING_PG_CONN" -c "select id, public from storage.buckets order by id;"
# expect: avatars, chat-attachments, receipts, identity-artifacts, legal-documents
```

If any are missing, create via the Supabase dashboard (Storage → New bucket)
with the same public/private setting as production.

### 1.6 Auth configuration (dashboard)

Supabase dashboard → **Authentication → Providers**:

- **Email**: ON, confirmations required, HIBP ON.
- **Google**: ON, staging OAuth client (create a new one in Google Cloud with
  redirect `https://staging.mycleaner.dk/auth/callback`).
- **Apple**: ON (optional for staging).
- **SMS (GatewayAPI)**: ON with the credentials from `staging.secrets`.

**Authentication → URL Configuration** — add:

- `https://staging.mycleaner.dk/**`
- `https://mycleaner-staging.lovable.app/**`
- `http://localhost:8080/**`

### 1.7 RLS + linter smoke tests

```bash
psql "$STAGING_PG_CONN" -f scripts/rls-regression.sql
# The Supabase linter runs via the platform's Advisors panel (dashboard →
# Advisors → Security). There is no `supabase db lint` CLI command; use the
# in-repo tooling instead:
bun run --cwd staging-validation tsx preflight.ts
```

Expect: `PASS` on the regression script, no CRITICAL findings from the
dashboard Advisors, and a green preflight report.

### 1.8 Phase 1 helper commands

The repo ships three helpers so Phase 1 is scripted end-to-end:

```bash
# 1. Dry-run bootstrap — prints planned actions, mutates nothing.
./scripts/staging-bootstrap.sh --project-ref <STAGING_REF> --dry-run

# 2. Real bootstrap — links, pushes migrations, deploys functions, uploads secrets.
#    Refuses production ref (qfjgifubavuomwvroahy). Never prints secret values.
./scripts/staging-bootstrap.sh --project-ref <STAGING_REF> --confirm

# 3. Phase 1 verification — read-only. Writes docs/staging/PHASE1_REPORT.md
#    and staging-validation/artifacts/phase1-report.json.
cd staging-validation
bunx tsx verify-phase1.ts
```

`verify-phase1.ts` uses `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`
and `STAGING_PG_CONN` from `staging-validation/.env`. Set
`SUPABASE_ACCESS_TOKEN` (a personal access token) to enable API-based edge
function and secret-name checks; without it those checks return
`MANUAL_VERIFICATION_REQUIRED` and print the exact CLI command to run.

### 1.9 Phase 1 completion checklist

Tick every box before starting Phase 2. Anything unchecked ⇒ **do not
proceed**.

- [ ] Supabase staging project created (`mycleaner-staging`, Pro plan, same region as prod)
- [ ] Project ref, DB password, `service_role` key, `anon` key, project URL stored in password manager
- [ ] `supabase login` succeeds locally
- [ ] Project linked: `supabase link --project-ref <STAGING_REF>` (or via `./scripts/staging-bootstrap.sh --dry-run`)
- [ ] Migrations deployed: `supabase db push` (or via bootstrap `--confirm`)
- [ ] Edge Functions deployed: `supabase functions deploy` (all local functions present)
- [ ] `staging.secrets` filled from `staging.secrets.example` and uploaded via `supabase secrets set --env-file staging.secrets`
- [ ] Storage buckets present (avatars, chat-attachments, receipts, identity-artifacts, legal-documents)
- [ ] Auth configured: email confirmations ON, HIBP ON, Google provider ON, staging URL allowlist populated
- [ ] RLS verified: `scripts/rls-regression.sql` returns PASS
- [ ] RPCs verified: `verify-phase1.ts` reports `rpc.inventory` and `rpc.signatures` PASS
- [ ] Required extensions installed (`pgcrypto`, `pgjwt`, `uuid-ossp`)
- [ ] `docs/staging/PHASE1_REPORT.md` generated and overall verdict = `PASS`
- [ ] Final approval gate: operator signs off on the report **before** Phase 2

If `verify-phase1.ts` verdict is anything other than `PASS`, resolve the
listed FAIL / BLOCKED / MANUAL items and re-run. Do not begin Phase 2 on
a partial pass.

---



## Phase 2 — Stripe (Test mode)

### 2.1 Verify test mode is on

Stripe dashboard header → toggle **Test mode** (top right). All keys below are
`sk_test_…` / `pk_test_…`.

### 2.2 Copy keys into staging secrets

Already covered by `staging.secrets` in Phase 1.4:

- `STRIPE_SECRET_KEY` — Developers → API keys → **Secret key** (Test mode).
- `STRIPE_PUBLISHABLE_KEY` — same page, publishable.

### 2.3 Enable Connect (Test mode)

Dashboard → **Connect → Settings**:

- Enable Express connected accounts.
- Branding: MyCleaner Staging.
- Support email: `staging-ops@mycleaner.dk`.

### 2.4 Webhook endpoints

Dashboard → **Developers → Webhooks → Add endpoint**. Create two:

**A. Platform events**

- URL: `https://<STAGING_REF>.supabase.co/functions/v1/stripe-webhook`
- Events: `payment_intent.*`, `charge.refunded`, `charge.refund.updated`,
  `charge.dispute.*`, `transfer.*`, `payout.*`, `account.updated`,
  `setup_intent.*`.

**B. Connect events** (if separated in your setup)

- URL: `https://<STAGING_REF>.supabase.co/functions/v1/stripe-webhook`
- Same events.

Copy each signing secret into `staging.secrets`:

- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CONNECT_WEBHOOK_SECRET`

Re-push:

```bash
supabase secrets set --project-ref <STAGING_REF> --env-file staging.secrets
```

### 2.5 Verify signature handling

```bash
stripe listen --forward-to \
  https://<STAGING_REF>.supabase.co/functions/v1/stripe-webhook
# in another shell:
stripe trigger payment_intent.succeeded
stripe trigger charge.dispute.created
supabase functions logs stripe-webhook --project-ref <STAGING_REF> --tail
```

Expect HTTP 200 + `stripe_webhook_events` rows.

---

## Phase 3 — Sumsub (Sandbox)

### 3.1 Sandbox app token

Sumsub cockpit → **Dev Space** (Sandbox) → **App tokens** → New:

- Name: `mycleaner-staging`
- Level: KYC (matches prod)
- Save token + one-time secret → `staging.secrets` as `SUMSUB_APP_TOKEN`,
  `SUMSUB_SECRET_KEY`. The token MUST start with `sbx:`.

### 3.2 Webhook

Sumsub → **Sandbox → Webhooks → Add**:

- URL: `https://<STAGING_REF>.supabase.co/functions/v1/identity-webhook`
- Events: `applicantReviewed`, `applicantPending`, `applicantOnHold`,
  `applicantActionReviewed`, `applicantWorkflowCompleted`.
- Save the signing secret → `SUMSUB_WEBHOOK_SECRET`.

Re-push staging secrets after adding.

### 3.3 Verify callbacks

In `staging.mycleaner.dk/verify-identity`:

1. Start verification as a seeded provider.
2. Use the sandbox test flow → **GREEN** result.
3. Confirm within 30s:
   - `person_identities.status = 'approved'` for that user.
   - `provider_profiles.identity_status = 'approved'`.
   - `identity_webhook_events` row exists.
4. Repeat with a **RED** result → expect `status='rejected'`.

---

## Phase 4 — Staging frontend

### 4.1 Create Lovable project

Lovable dashboard → **New project** → Import GitHub → this repo → branch
`staging` (create branch first with `git checkout -b staging && git push`).

Disable Lovable Cloud on this project (Connectors → Lovable Cloud → Disable),
because staging uses the standalone Supabase project from Phase 1.

### 4.2 Environment variables (Lovable project settings)

```
VITE_SUPABASE_URL=https://<STAGING_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<staging anon key>
VITE_SUPABASE_PROJECT_ID=<STAGING_REF>
VITE_APP_ENV=staging
VITE_TURNSTILE_SITE=1x00000000000000000000AA
VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY=<staging Maps key>
```

### 4.3 First publish

Publish button → confirm `https://mycleaner-staging.lovable.app` returns 200
and the orange `<StagingBanner />` shows across the top of every page.

### 4.4 Custom subdomain

1. Lovable → Project Settings → Domains → Add `staging.mycleaner.dk`.
2. Copy the CNAME target Lovable shows.
3. At the DNS provider for `mycleaner.dk`, add:

   ```
   Type: CNAME
   Host: staging
   Value: <lovable-target-host>
   TTL: 300
   ```

4. Wait 10–60 minutes for DNS + TLS.

### 4.5 CORS / redirect allowlist

Confirm `ALLOWED_ORIGINS` in `staging.secrets` matches what the app calls from.
Update Supabase Auth → URL Configuration with the final list.

---

## Phase 5 — Seed realistic demo data

Once staging is reachable end-to-end:

```bash
cd staging-validation
cp .env.example .env      # fill in staging values
bun install
bunx tsx scenarios/seed-demo.ts --dry-run   # prints exact per-table plan, writes nothing
bunx tsx scenarios/seed-demo.ts             # real seed (idempotent)
bunx tsx scenarios/seed-demo.ts --stats     # inventory afterwards
```

Expected inventory:

- 20 customers, 50 providers (30 active), 6 staff
- ~250 bookings across statuses
- ~40 finance_payouts, 8 stripe_disputes
- 25 support conversations
- 6 refund_requests_v2

Reviews: **skipped by design** — no `reviews` table exists in the current
schema. See "Review system" under _Known gaps_ below and the
proposal at the end of this document.

**Address-validation caveat**: the seed writes `provider_profiles` rows with
`base_address_place_id = NULL` to bypass the `place_validations` foreign-key
trigger (real place IDs would require a live DAWA/Google round-trip per
provider). Country, coordinates and formatted address are still populated
and are exercised by marketplace search. The full validation path is covered
by the RC2 UI scenarios (`12-ui-booking-stripe.spec.ts`), not by the seed.

**Spot-check UI**: sign in as `demo+rc2-demo-customer-000@rc2.mycleaner.test`
(password from `staging.secrets`), open `/marketplace`, `/admin`, `/support`.
Every dashboard should populate.


---

## Phase 6 — Parity verification

```bash
# Create a read-only Postgres role on production (once).
# In the Supabase SQL editor for PROD (this is the only prod write):
#   CREATE ROLE parity_ro NOINHERIT LOGIN PASSWORD '<strong>';
#   GRANT USAGE ON SCHEMA public, storage TO parity_ro;
#   GRANT SELECT ON ALL TABLES IN SCHEMA information_schema, pg_catalog TO parity_ro;
#   ALTER ROLE parity_ro SET default_transaction_read_only = on;

# Then in staging-validation/.env (git-ignored) add:
#   PROD_SUPABASE_URL=https://<prod-ref>.supabase.co
#   PROD_SUPABASE_PROJECT_REF=<prod-ref>
#   PROD_READONLY_PG_CONN=postgresql://parity_ro:<pw>@<prod-host>:5432/postgres
#   PARITY_ALLOW_PROD_READ=true

cd staging-validation
bunx tsx parity-check.ts
# ⇒ writes docs/staging/PARITY_REPORT.md
```

Read the report. Fix any staging-only or prod-only tables/RPCs before RC2.

---

## Phase 7 — RC2 Preflight

```bash
cd staging-validation
./run-rc2.sh --preflight
```

Only after preflight returns green **and** you approve, run:

```bash
./run-rc2.sh --full
```

---

## Verification checklist

- [ ] `supabase functions list --project-ref <STAGING_REF>` returns the same count as production
- [ ] `supabase secrets list` shows every name from `staging.secrets.example`
- [ ] Every storage bucket from prod exists on staging
- [ ] Supabase linter: no CRITICAL findings
- [ ] `rls-regression.sql`: PASS
- [ ] Stripe test webhook returns 200
- [ ] Sumsub sandbox verification propagates to `provider_profiles.identity_status`
- [ ] `https://staging.mycleaner.dk` loads with orange STAGING banner
- [ ] Google/Apple sign-in works on staging domain
- [ ] Seeded marketplace shows 30 active providers
- [ ] `parity-check.ts` verdict: PASS

---

## Required secret names (staging Supabase project)

Copied from `staging.secrets.example` — see that file for placeholders.

Runtime: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_CONNECT_WEBHOOK_SECRET`, `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`,
`SUMSUB_WEBHOOK_SECRET`, `SUMSUB_BASE_URL`, `GATEWAYAPI_API_TOKEN`,
`GATEWAYAPI_SENDER`, `GATEWAYAPI_BASE_URL`, `GOOGLE_MAPS_SERVER_KEY`,
`TURNSTILE_SECRET_KEY`, `LOVABLE_API_KEY`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`,
`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `TAX_ID_ENCRYPTION_KEY`,
`APP_BASE_URL`, `APP_ENVIRONMENT`, `ALLOWED_ORIGINS`.

Frontend (`.env` on the staging Lovable project): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_APP_ENV`,
`VITE_TURNSTILE_SITE`, `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`.

---

## Rollback plan

Any phase can be undone in isolation. Nothing touches production.

| Phase | Rollback |
|---|---|
| 1 Supabase | Dashboard → project settings → **Pause** or **Delete project**. |
| 2 Stripe | Delete both Test-mode webhook endpoints; Test-mode data cannot affect live balances. |
| 3 Sumsub | Delete the sandbox webhook and revoke the sandbox app token. Prod tenant unaffected. |
| 4 Frontend | Unpublish the staging Lovable project or remove the `staging` DNS record. |
| 5 Seed | `./staging-validation/cleanup-rc2.sh --all-rc2` — removes every seeded user and cascades. Audit tables preserved. |
| 6 Parity | Delete the read-only prod role: `DROP ROLE parity_ro;` |
| 7 RC2 | `./staging-validation/cleanup-rc2.sh <run-id>` for the specific run. |

Full teardown: pause the Supabase project, disable the Lovable staging
project, remove DNS. Total time: <10 minutes.

---

## Known gaps recorded in this doc

- **Review system not implemented in schema.** `get_public_provider_profile_v1`
  hardcodes `0` for `average_rating` and `total_reviews`, and both
  `Marketplace.tsx` and `PublicProviderProfile.tsx` render those zeros. The
  seed script logs a SKIP. A schema proposal is included at the end of this
  document.
- `person_identities` rows for `pending_identity` providers are created by the
  Sumsub sandbox flow during Phase 3.5 verification, not by the seed script.
- The seed intentionally leaves `provider_profiles.base_address_place_id` NULL
  to avoid the `enforce_base_address` trigger's dependency on
  `place_validations`. Coordinates and formatted addresses are still set. The
  full address-validation path is exercised via the RC2 UI scenarios instead.

---

## Appendix — Review system proposal (not implemented)

Recommend a single `reviews` table populated only after a `completed` booking,
with an aggregate maintained by trigger so marketplace queries stay O(1):

```sql
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  provider_id     uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(coalesce(comment,'')) <= 2000),
  provider_reply text,
  provider_reply_at timestamptz,
  is_hidden boolean not null default false,   -- admin moderation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.reviews to anon;                        -- public marketplace
grant select, insert, update on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;

-- policies: customer can insert once per completed booking of theirs;
--           provider can update only provider_reply / provider_reply_at;
--           anon can select where not is_hidden.

-- aggregates on provider_profiles (add columns; keep in sync via trigger)
alter table public.provider_profiles
  add column if not exists rating_avg   numeric(3,2) not null default 0,
  add column if not exists rating_count integer      not null default 0;
```

Follow-up work required outside this migration: swap the hardcoded `0`s in
`get_public_provider_profile_v1` and `search_marketplace_providers_v1` for
the aggregate columns, extend `seed-demo.ts` with ~180 reviews attached to
`completed` bookings, and add a "Reviews" tab to the provider self-profile.
Estimated effort: ~1 day, best done after RC2 sign-off so it doesn't block
the launch checklist.

