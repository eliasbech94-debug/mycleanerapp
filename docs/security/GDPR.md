# GDPR & Privacy — Architecture

## Overview
Task 6 delivers user-facing GDPR rights (art. 15 export, art. 17 deletion,
art. 7 consent) plus internal retention and legal-hold enforcement. All
workflows are gated by authentication, RLS and the immutable audit log.

## Tables
| Table | Purpose |
| --- | --- |
| `gdpr_export_jobs` | Async data export requests (queued → running → ready/failed/expired). One active row per user. |
| `account_deletion_requests` | Deactivation + scheduled deletion workflow. One active row per user. |
| `consent_ledger` | Append-only versioned consent history (terms, privacy, marketing, push, analytics). |
| `data_retention_policies` | Configurable retention windows per record type. |
| `legal_holds` | Admin-declared overrides that block automated deletion/anonymisation. |
| `retention_worker_runs` | Audit trail of retention worker executions (dry-run supported). |

Bucket **`gdpr-exports`** is private; downloads only via short-lived (5 min)
signed URLs from `gdpr-export-download`.

## Edge functions
| Function | Auth | Role |
| --- | --- | --- |
| `gdpr-export-request` | user | Enqueue export job; rate-limited 3/24h; audit-logged. |
| `gdpr-export-worker` | service-role | Builds JSON bundle via `_shared/gdpr.ts`; uploads to private bucket; sets 7-day expiry. |
| `gdpr-export-download` | owner-only | 5-minute signed URL, increments `download_count`, audit-logged. |
| `gdpr-delete-request` | user | Deactivates profile, revokes sessions, withdraws marketing consents, schedules deletion 30d out. Auto-routes to `legal_retention` if open disputes / pending payouts / active legal hold. |
| `gdpr-consent` | user | GET latest state; POST append. Append-only enforced by trigger. |
| `gdpr-retention-worker` | admin / service | Iterates enabled policies; supports `dry_run`; writes report to `retention_worker_runs`. |
| `gdpr-legal-hold` | admin | Create / list / release holds; every mutation audit-logged. |

## Data export contents
`_shared/gdpr.ts` `collectUserData` returns:
- Profile (scrubbed), addresses, bookings (as customer + provider), cleaning plans
- Support threads/messages, notifications (in-app + outbox), consent history
- SMS verification metadata, provider receipts
- Payments, refund requests, cancellations, disputes (both roles)
- Settlements, payouts, platform fee invoices, credit notes
- Deletion request history, previous export jobs
- Tax profile with `vat_number_masked` (no plaintext); `tax_identity_masked` from profile last-4
- Roles and last 500 audit entries where user was actor

**Never included:** `password*`, `*_enc`, `*_encrypted`, Stripe secret keys,
webhook secrets, `fraud_*`, internal notes (`FORBIDDEN_FIELDS` in `gdpr.ts`).

## Deletion / anonymisation flow
1. User confirms deletion → `gdpr-delete-request`.
2. Immediate: `profiles.deactivated_at = now()`, marketing consents withdrawn,
   `auth.admin.signOut(uid)` revokes sessions.
3. Route:
   - `legal_retention` if `is_under_legal_hold('user', uid)` OR open disputes
     (`needs_response`, `under_review`, warning variants) OR pending payouts
     (`pending`, `in_transit`).
   - Otherwise `scheduled`, with `scheduled_delete_at = now() + 30d`.
4. After the retention window, admin/operator finalises via anonymisation —
   name replaced with pseudonymous ID, phone/email/avatar cleared, personal
   uploads removed, while `bookings`, `platform_fee_invoices`,
   `provider_settlement_statements`, `platform_credit_notes`, `finance_payouts`
   and `admin_audit_log` remain for statutory retention.

## Retention matrix (seeded)
| Record | Days | Action | Legal hold |
| --- | --- | --- | --- |
| unverified_accounts | 30 | delete | ✅ |
| dormant_accounts | 1095 | anonymise | ✅ |
| sms_verifications | 7 | delete | – |
| notification_outbox | 90 | delete | – |
| gdpr_export_files | 7 | delete | – |
| dispute_evidence | 1825 | delete | ✅ |
| support_messages | 730 | anonymise | ✅ |
| admin_audit_log | 2555 | archive | ✅ |
| bookings | 1825 | anonymise | ✅ |
| finance_documents | 3650 | archive | ✅ |

## Legal holds
`is_under_legal_hold(target_type, target_id)` — used by deletion request and
retention worker. Any `legal_holds` row with `active=true` and unexpired
`ends_at` prevents automated deletion/anonymisation. Only `admin` role can
call `gdpr-legal-hold`; every create/release is audit-logged with before/after
state.

## Security posture
- All privacy tables have RLS; users see only their own rows.
- `consent_ledger` blocks UPDATE/DELETE (trigger) — append-only.
- `admin_audit_log` remains append-only (see `DEFINER_FUNCTIONS.md`).
- Encrypted fields (`tax_id_enc`, etc.) never leave the DB — export uses
  `tax_id_last4` + masked helpers instead.
- Download URLs are 5-minute signed and require a fresh authenticated call.
- Deletion revokes all sessions immediately via `auth.admin.signOut`.

## Scheduling
Add these cron jobs (via `pg_cron` + `pg_net`) once the user approves:
```
select cron.schedule('gdpr-retention-daily', '15 3 * * *',
  $$ select net.http_post(
    url:='https://<project>.supabase.co/functions/v1/gdpr-retention-worker',
    headers:='{"Content-Type":"application/json","apikey":"<ANON>"}'::jsonb,
    body:='{"dry_run":false}'::jsonb) $$);
```

## Remaining risks
- Final physical erasure of `auth.users` requires an operator-run job (kept
  manual to satisfy legal review before permanent removal).
- Export bundle currently JSON-only; HTML/PDF summary is a follow-up.
- Retention worker currently implements the four highest-volume policies
  (SMS, outbox, export files, unverified account count); other policies are
  declared and dry-runnable but require domain-specific anonymisation code
  before enabling `enabled=true` in production.
