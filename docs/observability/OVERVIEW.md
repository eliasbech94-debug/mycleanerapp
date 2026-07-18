# Observability, alerting & incident response

## Architecture

```
              ┌────────────────────┐
Browser ────► │ src/lib/monitoring │ scrub → captureError()
              └─────────┬──────────┘
                        │  correlation_id, release, route
                        ▼
              ┌────────────────────┐
              │ client-error fn    │ ← rate-limited, re-scrubbed
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │ error_events table │ ─┐
              └────────────────────┘  │
                                      │ same correlation_id
Edge fn ─► _shared/logger.ts ─► JSON  │ (x-correlation-id header)
                    │                 │
                    ▼                 ▼
              ┌────────────────────────────────────┐
              │  ops-summary  →  AdminOps dashboard│
              └────────────────────────────────────┘
                    ▲
                    │  raise_system_alert() / resolve_system_alert()
              ┌─────┴──────────┐
              │ system_alerts  │  (dedup on alert_key)
              └────────────────┘
```

## Database changes
`error_events`, `job_runs`, `webhook_metrics`, `system_alerts`, `incidents`,
`incident_timeline`, `deployments` + helper functions `raise_system_alert`
and `resolve_system_alert` (service-role only).

## Logging schema
Every edge-function log line is a single JSON object with:
`ts, level, release, environment, function_name, correlation_id, user_id,
booking_id, payment_id, dispute_id, job_id, message, …scrubbed metadata`.
Sensitive keys (`password`, `token`, `secret`, `otp`, `cpr`, `cvr`, `iban`,
`card`, `cvv`, `signed_url`, …) are replaced with `[redacted]` by
`scrubForLog`. Bearer-shaped JWTs anywhere in a string are replaced with
`[redacted-jwt]`.

## Correlation IDs
1. Frontend generates `x-correlation-id` per user action via
   `newActionCorrelationId()`.
2. Edge functions read it in `_shared/logger.ts` via `correlationId(req)` and
   attach it to every log line + response headers.
3. `job_runs`, `webhook_metrics`, `system_alerts`, `error_events` all store
   the same `correlation_id` column — a single trace joins them.

## Alert thresholds
- Notification backlog ≥ 100 → **warning**
- Reconciliation mismatch ≥ 1 → **critical**
- Open disputes ≥ 5 → **warning**
- Webhook failures (dead_letter / signature_invalid) → **critical** immediately
- Job failed / stuck > 2× expected duration → **warning**, > 4× → **critical**

Alerts are deduplicated via unique index
`system_alerts_open_key_idx (alert_key) WHERE status <> 'resolved'`. Second
occurrence bumps `seen_count` and `last_seen_at`. `resolve_system_alert`
closes the row when the condition clears.

## Health check
Public `GET /functions/v1/health` returns only:
```json
{ "status": "healthy" | "degraded" | "unhealthy" }
```
No counts, versions, secrets. Admin-only detail lives in `ops-summary`.

## Incident response
Severity ladder:
- **SEV-1** — payment / auth outage, data loss suspicion
- **SEV-2** — degraded core flow (checkout, payout, invoice)
- **SEV-3** — single subsystem degraded (SMS, notifications)
- **SEV-4** — cosmetic or single-user issue

Playbooks (write once, revisit quarterly):
- **Payment outage** → verify Stripe status page → check
  `webhook_metrics(result='failed')` last hour → freeze checkout via
  feature flag if failure rate > 20% → open SEV-1.
- **Stripe webhook outage** → replay events from Stripe dashboard →
  confirm `stripe_webhook_events` idempotency guard holds → alert key
  `stripe_webhook_down`.
- **GDPR request failure** → check `gdpr_export_jobs.status='failed'` for
  correlation_id → decide re-run vs. manual export → notify user within SLA.
- **Mass notification failure** → inspect `notification_outbox` backlog →
  provider status → drain worker → alert key `notification_backlog_high`.
- **Payout mismatch** → cross-check `finance_reconciliation_alerts` →
  open SEV-2 → freeze payouts until root cause found.
- **Database degradation** → check Cloud status → escalate; do not run
  migrations until healthy.
- **Data breach suspicion** → open SEV-1, rotate keys via secret tools,
  preserve audit logs, notify DPO within 24h.

## Deployment tracking
`deployments` records release, environment, commit SHA, edge function
versions and migration version. Correlate new errors with the latest
deployment via `error_events.release`.

## Redaction review
- `_shared/logger.ts` `scrubForLog` strips 20+ key patterns before write.
- `client-error` re-runs the scrub server-side.
- Response bodies never logged verbatim; only allow-listed metadata keys.
- Signed URLs redacted; `stack` truncated at 8 KB; `message` at 2 KB.

## Remaining risks
- Third-party Sentry is opt-in via `VITE_SENTRY_DSN` + a global `Sentry`
  object — the codebase never bundles the Sentry SDK to keep client size
  lean; enabling it is a hosting-side decision.
- Source-map upload happens at Lovable publish time, so a manual DSN
  configuration step is required to enable full stack-trace symbolication.
- Alert notification channels (email/Slack) are declared but not wired —
  in-app admin alerts fire immediately; adding email/Slack is one extra
  edge function fan-out on `raise_system_alert`.
- Frontend perf tracing is captured on failure only; RUM sampling requires
  an external provider.
