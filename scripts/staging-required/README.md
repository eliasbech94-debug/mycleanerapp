# STAGING_REQUIRED — Incident Evidence Hardening Patch

⚠️ **DO NOT APPLY / DO NOT DEPLOY AGAINST THE SHARED PRODUCTION BACKEND.**

Everything in this directory is a design-complete, deploy-ready patch that MUST
be validated on an isolated staging environment before being promoted to
`supabase/migrations/`, `supabase/functions/`, or the workspace cron
configuration.

Preview currently shares the production Supabase project, so:

- The SQL migration is `incident-evidence-hardening.sql` (NOT under
  `supabase/migrations/` — moving it there triggers an approval + apply).
- The edge-function patches live under `edge-functions/` (NOT under
  `supabase/functions/` — moving them there triggers a deploy).
- The orphan cleanup worker + cron scaffold are here too. Do not register the
  cron entry until staging validation of dry-run mode + retention policy
  approval is complete.

## Promotion checklist (staging only)

1. Bring up an isolated staging DB seeded with fixtures from
   `staging-validation/seed/create-test-users.ts`.
2. Move `incident-evidence-hardening.sql` into `supabase/migrations/` under a
   fresh timestamp; approve + apply.
3. Move each `edge-functions/<name>/index.ts` into
   `supabase/functions/<name>/index.ts`; deploy via
   `supabase--deploy_edge_functions`.
4. Create the `incident-evidence` bucket as private (via
   `supabase--storage_create_bucket`) if it doesn't already exist on staging.
5. Run `scripts/knowledge-incident-evidence-rls-regression.sql` end-to-end on
   the staging DB (never production).
6. Run the orphan worker in `dry_run=true` mode; inspect audit output.
7. Only then register the cron entry defined in `cron-schedule.sql`.

## Files

| File | Purpose |
| --- | --- |
| `incident-evidence-hardening.sql` | Full migration: revokes client metadata writes, adds `can_access_incident_report`, quarantine columns, idempotency + uniqueness, rate limits, upload sessions |
| `edge-functions/incident-evidence-upload/index.ts` | Two-phase upload with idempotency key + server-side byte verification |
| `edge-functions/incident-evidence-url/index.ts` | Download gated on `verified` status + `can_access_incident_report` |
| `edge-functions/incident-evidence-orphan-worker/index.ts` | Retention/cleanup worker with dry-run + kill-switch |
| `edge-functions/_shared/mime-sniff.ts` | Magic-byte MIME detection (no external deps) |
| `edge-functions/_shared/rate-limit.ts` | Server-side per-user + per-incident limiter |
| `cron-schedule.sql` | Cron registration — DO NOT RUN UNTIL STAGING SIGN-OFF |
