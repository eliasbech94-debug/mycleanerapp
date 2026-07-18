# Task 7B — Production Monitoring Integrations (PRE-LAUNCH BLOCKER)

Status: **OPEN — MANDATORY BEFORE PUBLIC PRODUCTION LAUNCH**
Owner: Platform / DevOps
Does not block Task 8 application development. Does block the public launch.

Task 7A (observability architecture + application instrumentation) is CLOSED.
Task 7B replaces the placeholder providers with live ones and verifies end-to-end.

---

## 1. Provider configuration

- [ ] **Email provider (Resend or equivalent)** — add secret `RESEND_API_KEY`,
      set verified sender domain, wire into `notification-outbox-worker`
      `sendEmail()`.
- [ ] **SMS provider (GatewayAPI or Twilio)** — add secret `SMS_PROVIDER_KEY`
      (or `TWILIO_AUTH_TOKEN` + `TWILIO_ACCOUNT_SID` + `TWILIO_FROM`), wire
      into `notification-outbox-worker` `sendSms()` and `sms-send-code`.
- [ ] **Push provider (FCM)** — add secret `FCM_SERVER_KEY`, register device
      tokens on the profile, wire into `notification-outbox-worker`
      `sendPush()`.

## 2. Frontend error monitoring

- [ ] **Sentry DSN** — set `VITE_SENTRY_DSN` (+ optional `VITE_SENTRY_TRACES`).
      Confirm ingestion in Sentry with a forced test error.
- [ ] **Source maps** — configure CI to upload maps to Sentry via authenticated
      release step, then **strip maps from the deployed public bundle**
      (`build.sourcemap: 'hidden'` in `vite.config.ts` at release time).
- [ ] **Release + deployment tags** — CI must inject `VITE_APP_RELEASE`,
      `VITE_APP_DEPLOYMENT`, `VITE_APP_ENVIRONMENT` at build.

## 3. Deployment recording

- [ ] Wire CI/CD (post-deploy step) to `POST /functions/v1/deployment-record`
      with `{ release, environment, git_commit, migration_version,
      edge_function_versions, status }` using the service-role key.
- [ ] Verify a deployment row appears after the next release.

## 4. Remaining function instrumentation

- [x] `booking-expire-pending` — wrapped in `monitored()` + `startJobRun()`.
- [x] `booking-plan-reminders` — wrapped in `monitored()` + `startJobRun()`.
- [x] 17 critical Edge Functions already instrumented in Task 7A.

## 5. Live verification checklist

Run in staging with production-equivalent secrets, then re-run once on
production before opening to public traffic.

### Stripe webhooks
- [ ] Valid signature → 2xx, row in `stripe_webhook_events`, correlation logged.
- [ ] Invalid signature → 400, `error_events` row with category
      `webhook_invalid_signature`.
- [ ] Duplicate `event.id` → processed exactly once (idempotency guard).
- [ ] Stripe retry (same event, 5xx first) → succeeds on retry, no double effect.

### Notifications
- [ ] Email delivery success recorded, `notification_outbox.status='sent'`.
- [ ] Email delivery failure after 5 retries → `status='failed'` +
      `system_alerts` entry.
- [ ] SMS delivery success + failure paths.
- [ ] Push delivery success + failure paths.
- [ ] Admin alert email — force a `system_alerts` critical row and confirm the
      admin distribution list receives it.

### Correlation chain
- [ ] Book a service end-to-end (customer → payment intent →
      `stripe-webhook` → `booking-decide` → `notification-outbox-worker`).
      Confirm a single `correlation_id` links every `error_events` /
      `job_runs` / `webhook_metrics` / `notification_outbox` row and the
      customer's `customer_notifications` entry.

### Deployment linkage
- [ ] Force a client error after a new deployment marker exists. Confirm
      `error_events.release` matches the latest `deployments.release`, and
      Sentry event's release tag matches.

---

## Sign-off

Public production launch is **blocked** until every checkbox above is
verified in the production environment and this file's status flipped to
CLOSED with the sign-off date + operator initials.
