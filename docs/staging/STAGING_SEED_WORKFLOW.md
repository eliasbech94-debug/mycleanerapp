# Staging Seed Workflow

Manual GitHub Actions workflow that seeds test providers and test users into
the **staging** Supabase project. Idempotent and safe to rerun.

Workflow file: `.github/workflows/staging-seed.yml`

## Required GitHub secrets

Configure these on the **`staging` environment** in
`Settings → Environments → staging → Secrets`:

| Secret | Purpose |
|---|---|
| `STAGING_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Staging service-role key (never production) |
| `STAGING_SUPABASE_PROJECT_REF` | Staging Supabase project ref (the `<ref>` in the URL above) |
| `STAGING_SUPABASE_DB_PASSWORD` | Staging Postgres database password |

The workflow constructs the Postgres connection string at runtime as:

```
postgresql://postgres:${STAGING_SUPABASE_DB_PASSWORD}@db.${STAGING_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres
```

No `STAGING_PG_CONN` secret is required or used.

> ⚠️ **Never** paste production credentials. The workflow refuses to run if
> `STAGING_SUPABASE_URL` or `STAGING_SUPABASE_PROJECT_REF` resolves to the
> production project ref, and it aborts if the two do not match.

### Adding secrets safely
1. GitHub → **Settings → Environments → staging** (create it if missing).
2. Add each secret via the UI — do not commit values or share via chat.
3. Restrict the `staging` environment to the `staging` branch under
   *Deployment branches*.

## Dispatching the workflow

1. Push or switch to the `staging` branch on GitHub.
2. Go to **Actions → Staging Seed (Test Providers & Users)**.
3. Click **Run workflow**, select branch **`staging`**, confirm.

The workflow will fail immediately if invoked from any other branch.

## Expected output

- Diagnostics: `ref`, `ref_name`, `sha`, `supabase_project_ref` (no secrets).
- Country counts: `DK=5, SE=3, DE=3, ES=3, GB=3` — total **17**.
- `mette-copenhagen` slug present.
- Artifact **`staging-seed-report`** containing `seed-report.md`.

Passwords for the 4 test users are **not** printed. Retrieve them from
`docs/staging/TEST_ACCOUNTS.md`.

## Rerunning safely

The workflow is idempotent:
- `test-providers.sql` uses `ON CONFLICT` upserts keyed by slug.
- `create-test-users.ts` looks up existing auth users before inserting.

You may rerun any time; row counts remain stable.

## Resetting only the seeded test data

From a psql shell against staging only:

```sql
DELETE FROM public.provider_profiles WHERE is_test_seed = true;
-- test users (auth): delete by known emails
DELETE FROM auth.users WHERE email LIKE '%@test.mycleaner.dev';
```

Then dispatch the workflow again to reseed.

## Guardrails

- Manual dispatch only (`workflow_dispatch`).
- Hard branch guard: fails if `github.ref_name != 'staging'`.
- Env-scoped secrets: `environment: staging` restricts access.
- Refuses to run if the derived project ref matches production.
- Secret values are never echoed; TS seed output is filtered for
  `password|service_role|bearer|api_key` tokens.
- `psql` runs with `-v ON_ERROR_STOP=1`; any SQL failure aborts.

## ⚠️ Never use production credentials

This workflow targets **staging only**. Using production `SUPABASE_URL`,
service-role key, or Postgres connection would pollute production data and
is explicitly blocked by the production-ref check.
