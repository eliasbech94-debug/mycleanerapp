# GitHub Development Workflow — MyCleaner

Repository: `eliasbech94-debug/mycleanerapp`

This document defines the branching model, the staging validation workflow,
required GitHub Secrets, and the rollback procedure. It is the single source
of truth for how code moves from development to production.

## 1. Branch model

| Branch     | Purpose                                                       | Who writes here                          |
| ---------- | ------------------------------------------------------------- | ---------------------------------------- |
| `develop`  | Active development. All feature work branches from here.      | Engineers, Lovable agent.                |
| `staging`  | Release testing & staging validation (RC harness runs here).  | Merge-only from `develop` after review.  |
| `main`     | Production-ready code. Deployed / published from here only.   | Merge-only from `staging` after sign-off.|

Branches are never force-pushed. Branches are never deleted.

## 2. Development flow

```
feature/*  ──►  develop  ──►  staging  ──►  main
                                │
                                └── GitHub Actions: P0.1 staging evidence
```

1. Create a short-lived feature branch off `develop`.
2. Open a PR into `develop`. Squash-merge after review.
3. When a release candidate is ready, open a PR `develop → staging`.
4. On `staging`, trigger the P0.1 evidence workflow (see §4). Do not merge
   into `main` until the workflow reports PASS with redaction self-check OK.
5. Open a PR `staging → main`. Merge only after the RC gate is closed by an
   approver who has reviewed the uploaded evidence artifact.

Never commit directly to `staging` or `main`.

## 3. Required GitHub Secrets

Add these under **Repository Settings → Secrets and variables → Actions →
Repository secrets**. Names must match exactly (they are read by
`staging-validation/config.ts`).

Core (required by scenario 16):

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY` — evidence inspection & Customer B seed only
- `STAGING_PG_CONN`
- `STAGING_APP_URL`
- `STRIPE_TEST_SECRET_KEY` (must start with `sk_test_`)
- `STRIPE_TEST_PUBLISHABLE_KEY` (must start with `pk_test_`)
- `STRIPE_TEST_WEBHOOK_SECRET` (must start with `whsec_`)
- `STRIPE_WEBHOOK_URL`
- `TEST_EMAIL_DOMAIN`
- `TEST_PASSWORD`

Required by the shared harness config (Sumsub sandbox):

- `SUMSUB_APP_TOKEN` (must contain `sbx`)
- `SUMSUB_SECRET_KEY`
- `SUMSUB_WEBHOOK_SECRET`
- `SUMSUB_WEBHOOK_URL`

The destructive-tests acknowledgement (`RC2_ALLOW_DESTRUCTIVE_STAGING_TESTS`)
is hard-coded to `"true"` inside the workflow — it is the operator's
acknowledgement that this is a disposable staging environment. It is not a
secret.

No live keys, no production Supabase project ref, no production hostnames
are ever accepted — `config.ts` aborts on detection.

## 4. Running the P0.1 staging workflow

1. GitHub → **Actions** → **P0.1 Pricing & Checkout — Staging Evidence**.
2. Click **Run workflow**. Branch selector must be `staging`.
3. The job runs `bun install --frozen-lockfile` then `bun run rc2:p0.1` in
   `staging-validation/`.
4. Scenario 16 executes its redactor self-check before any network call. If
   a canary leaks the run fails immediately.
5. On completion, download the artifact **`p0-1-staging-evidence`** (14-day
   retention) from the run summary page. It contains only:
   - `evidence/**/reports/rc2.json`
   - `evidence/**/report.json`
   - `evidence/**/report.md`
   - `evidence/**/manifest.json`

Raw HTTP transcripts, screenshots, and `.env` files are never uploaded.

## 5. Security rules

- Secrets are only ever referenced via `${{ secrets.* }}` mappings. They are
  never `echo`d, printed, or written to logs.
- JWTs and Authorization headers are stripped by `staging-validation/lib/redact.ts`.
- `.env` is git-ignored (`staging-validation/.gitignore`) and must never be
  committed.
- The service-role key is used only by test setup (Customer B seed) and
  evidence inspection (reading `pricing_calculations` to compare against
  the Stripe PaymentIntent amount). All user authorization assertions run
  under the anon key + real user JWT — never under service role.
- Never paste JWTs, service-role keys, Stripe secrets, or database
  passwords into chat, PRs, issues, or commit messages. If a value leaks,
  rotate it in Supabase / Stripe immediately and update the secret in
  GitHub.

## 6. Failure semantics

The workflow distinguishes:

- **PASS** — assertion succeeded.
- **FAIL** — assertion failed; run exits non-zero.
- **BLOCKED** — external dependency prevented execution (surfaced by
  `BlockedError` in the harness). Never reported as PASS.
- **SKIPPED** — intentionally not executed (documented reason).

A failing or blocked run does not deploy anything, does not modify
production, and does not open the production release gate. It may leave
seeded test data behind (rows tagged `rc2-<run-id>`); run
`staging-validation/cleanup-rc2.sh` locally to purge.

## 7. Rollback

If a change reaches `main` and needs to be reverted:

1. `git revert <merge-commit>` on `main` via a PR (never force-push).
2. Cherry-pick the revert down to `staging` and `develop` so branches
   stay in sync.
3. Re-run the P0.1 workflow on `staging` to confirm the revert restored a
   PASS state before considering the incident closed.

Never delete `main`, `staging`, or `develop`. Never rewrite their history.

## 8. Manual GitHub steps still required

The Lovable agent cannot perform any of the following — they must be done
by a human with repo admin rights:

- Create the `develop` and `staging` branches from the current `main` tip
  and push them.
- Set branch protection on `main` and `staging` (require PR, require review,
  disallow force-push, disallow deletion).
- Add each secret listed in §3 under Repository Settings → Actions →
  Secrets.
- Trigger the first run of the P0.1 workflow.
