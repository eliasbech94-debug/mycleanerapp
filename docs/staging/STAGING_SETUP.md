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
- **SMS (Twilio)**: ON with the sandbox credentials from `staging.secrets`.

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
bun run tsx scenarios/seed-demo.ts --dry-run   # print counts, nothing written
bun run tsx scenarios/seed-demo.ts             # real seed
bun run tsx scenarios/seed-demo.ts --stats     # inventory afterwards
```

Expected inventory:

- 20 customers, 50 providers (30 active), 6 staff
- ~250 bookings across statuses
- ~40 finance_payouts, 8 stripe_disputes
- 25 support conversations
- 6 refund_requests_v2

Reviews: **skipped** — no `reviews` table exists in the current schema
(recorded in the seed output).

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
bun run tsx parity-check.ts
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
`SUMSUB_WEBHOOK_SECRET`, `SUMSUB_BASE_URL`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `GOOGLE_MAPS_SERVER_KEY`,
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

- No `reviews` table exists in the schema; seed script logs a SKIP for reviews.
- `person_identities` rows for `pending_identity` providers are created by the
  Sumsub sandbox flow during Phase 3.5 verification, not by the seed script.
- The seed intentionally leaves `provider_profiles.base_address_place_id` NULL
  to avoid the `enforce_base_address` trigger's dependency on
  `place_validations`. Coordinates and formatted addresses are still set.
