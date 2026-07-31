# Staging Deploy via GitHub Actions

Deploys the MyCleaner database schema and all edge functions from this repo
into the standalone staging Supabase project. No local machine required.

## Guardrails

- **Manual trigger only** (`workflow_dispatch`). Never runs on push.
- **Only runs on the `staging` branch.** The job is skipped on any other ref.
- **Requires the phrase `deploy-staging`** typed into the confirmation input.
- **Refuses to run** if `STAGING_SUPABASE_PROJECT_REF` equals the production ref.
- **Never touches production.** No prod secrets are referenced.
- **Does not upload runtime secrets** (Stripe / Sumsub / Auth). Those are
  configured separately in the Supabase dashboard.

## Required GitHub Secrets

Add these under **Repo → Settings → Secrets and variables → Actions → New repository secret**.
Values never appear in chat, logs, or the repo.

| Secret name                         | Where to find it in the Supabase dashboard                                |
|-------------------------------------|---------------------------------------------------------------------------|
| `STAGING_SUPABASE_ACCESS_TOKEN`     | <https://supabase.com/dashboard/account/tokens> → Generate new token (`sbp_…`) |
| `STAGING_SUPABASE_PROJECT_REF`      | Staging project → Project Settings → General → Reference ID (20 chars)    |
| `STAGING_SUPABASE_DB_PASSWORD`      | Staging project → Project Settings → Database → (reset if unknown)        |

The workflow reads only these three secrets. No Stripe, Sumsub, or Auth
secrets are needed at this stage.

## Running the workflow

1. Push the `staging` branch to `origin` (if not already present).
2. GitHub → **Actions** → **Staging Deploy (Supabase)** → **Run workflow**.
3. Branch: `staging`.
4. Confirmation: type `deploy-staging`.
5. Start the run.

Expected duration: ~8–12 minutes.

## What the workflow does

1. Verifies branch = `staging`, confirmation phrase, required secrets, and
   that the project ref is not production.
2. Installs the Supabase CLI.
3. `supabase link --project-ref $STAGING_REF`
4. `supabase db push` — replays every file in `supabase/migrations/` in order.
   Fails the job on the first migration error.
5. Iterates every directory under `supabase/functions/*` (excluding `_shared`,
   `tests`, `node_modules`) and runs `supabase functions deploy <name>` for each.
   Collects failures and fails the job at the end if any function did not
   deploy.
6. Prints `supabase functions list` for verification.
7. Uploads `db-push.log` as an artifact (retained 14 days).

## Success criteria

- Job status: green.
- `db-push.log` shows every migration applied with no errors.
- `functions list` step shows every function name from `supabase/functions/`.
- No `::error::` annotations in the run summary.

## Failure handling

- **Migration failure:** the `db push` step exits non-zero and the job fails.
  Read `db-push.log` (uploaded artifact) for the exact SQL error. Fix the
  migration in a PR against `develop`, promote through `staging`, re-run.
- **Function deploy failure:** the step continues past the failing function,
  collects the list, and fails the job at the end with the names. Re-running
  the workflow is idempotent.
- **Auth/token failure:** rotate `STAGING_SUPABASE_ACCESS_TOKEN` at
  <https://supabase.com/dashboard/account/tokens> and update the secret.

## What this workflow does NOT do (yet)

- Does not push edge function secrets (Stripe test keys, Sumsub sandbox,
  GatewayAPI, Resend, etc.). Add those in the Supabase dashboard → Edge Functions
  → Manage secrets, using `staging.secrets.example` as the checklist.
- Does not configure Auth providers. Do that in the dashboard →
  Authentication → Providers / URL Configuration.
- Does not deploy the frontend. That's a separate Lovable staging project.
- Does not seed demo data. Run `staging-validation/scenarios/seed-demo.ts`
  after Auth + secrets are in place.

## Rollback

The workflow is idempotent — re-running with the same commit reapplies the
same state. To roll back schema: check out the previous good commit on
`staging`, re-run the workflow. To roll back a single function: revert its
directory on `staging` and re-run. There is no destructive step; the
production project is never referenced.
