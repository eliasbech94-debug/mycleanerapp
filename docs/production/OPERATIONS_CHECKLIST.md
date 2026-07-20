# Production Operations Checklist — MyCleaner

Owner: Platform Ops · Review cadence: weekly during soft launch, monthly after

## 1. Database

### Backups
- **Automated**: Lovable Cloud (Supabase) runs daily point-in-time backups. Retention per plan.
- **Verify weekly**: Cloud → Database → Backups. Confirm the most recent backup timestamp is < 24h old.
- **Quarterly restore drill**: restore latest backup into a scratch project, run `scripts/rls-regression.sql`, confirm data integrity.

### Disaster Recovery
1. **Detect**: `db_health` returns degraded, or `AdminOps` P1 alerts.
2. **Contain**: flip `feature_flags.maintenance_mode` = true (blocks writes at the API edge).
3. **Assess**: check Cloud status page; check `error_events` last 15 min.
4. **Recover**:
   - Data corruption → restore latest PITR backup (RPO ≤ 24h, RTO ~30–60 min).
   - Regional outage → wait; no active-active. Communicate ETA to users.
5. **Post-mortem**: log incident in `incidents` and `incident_timeline`.

### Rollback Plan (application)
- Frontend: previous deploy is one click in Lovable → Publish → History.
- Edge functions: redeploy the previous revision from git.
- Migrations: **forward-only**. Every migration must have an inverse migration authored *before* deploy. Never roll back a migration in prod without a written inverse.

## 2. Monitoring

| Signal | Where | Threshold | Action |
|---|---|---|---|
| P1 alerts | `system_alerts` where `status='open' AND severity='critical'` | any | Page on-call |
| Error rate | `error_events` last 5 min | > 20/min | Investigate |
| Slow queries | `supabase--slow_queries` | mean > 500ms | Add index / refactor |
| Job failures | `job_runs` where `status='failed'` last 1h | > 5 | Inspect worker |
| Realtime disconnects | client logs | sustained > 5% | Check compute size |

Dashboards live at `/admin/ops` and `/admin/webhooks`.

## 3. Stripe monitoring
- **Webhook health**: `webhook_metrics` table + `/admin/webhooks` page. Alert if `failed_count > 0` in any 5-min window.
- **Reconciliation**: `finance-reconcile` job runs daily; investigate any row in `finance_reconciliation_alerts`.
- **Disputes**: `dispute_monitor` cron; new dispute → `system_alerts` + email to ops.
- **Live-mode key rotation**: quarterly. Update `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` via secrets tool; deploy `stripe-webhook`; verify a test event within 5 min.

## 4. Email monitoring
- Query `email_send_log` deduplicated by `message_id` for `dlq`/`failed` in last 1h.
- Bounce/complaint rate: `suppressed_emails` count last 24h < 2% of sent.
- Auth email queue backlog: alert if `pgmq.auth_emails` depth > 100 or oldest message > 5 min.
- SPF/DKIM/DMARC: check quarterly with `dig` + a Gmail test send → View Original → all three PASS.

## 5. Storage monitoring
- Buckets: `receipts`, `invoices`, `dispute-evidence`, `gdpr-exports`, `chat-attachments`.
- Weekly: total bytes per bucket (`storage.objects`); alert if > 80% of plan quota.
- GDPR export bucket: enforce 30-day retention via `gdpr-retention-worker` (verify last successful run in `retention_worker_runs`).

## 6. Daily Health Checks (5-min routine)
1. `/admin/ops` — zero open P1s?
2. `/admin/webhooks` — webhook success rate 100% last 24h?
3. `email_send_log` — no unexpected `dlq` spike?
4. `job_runs` — every scheduled worker ran in the last 24h?
5. `system_alerts` — no unresolved alerts older than SLA (P1: 1h, P2: 24h)?
6. Cloud → Database → CPU/mem — < 70% sustained?

If all six are green → carry on. Any red → follow the corresponding runbook.

## 7. Incident Response
- **P1** (data loss, prod down, payment failure, security breach): page immediately, open incident row, comms every 30 min.
- **P2** (degraded feature, elevated errors): 4h response, comms once per shift.
- **P3** (cosmetic/isolated): normal ticket.

Post-incident: fill `incident_timeline`, write RCA within 5 business days.

## 8. Pre-launch sign-off checklist

- [ ] Stripe LIVE keys installed and webhook receiving events
- [ ] Full happy-path booking in live mode (charge → payout → refund → dispute)
- [ ] Email domain configured; SPF/DKIM/DMARC PASS on Gmail, Outlook, iCloud test inbox
- [ ] `scripts/rls-regression.sql` runs green against prod snapshot
- [ ] `scripts/realtime-load.mjs` PASS at N=25 concurrent clients
- [ ] Turnstile solved counter increments after real signup
- [ ] Legal documents v1.0 published in every supported country
- [ ] Backup < 24h old confirmed
- [ ] On-call rotation and pager tested
- [ ] Rollback procedure dry-run completed once
