# Incident Evidence — Security Design (Phase 2 Hardening)

> **Status:** STAGING_REQUIRED. Nothing described here is applied to the shared
> production backend yet. Promotion is gated on isolated-staging validation of
> the migration, edge-function patches, orphan worker (dry-run), and legal
> sign-off on retention windows.

## 1. Threat model

| Threat | Mitigation |
| --- | --- |
| Provider forges DB row referencing another incident's storage | Client `INSERT/UPDATE/DELETE` on `incident_evidence` revoked; writes only via edge fn (`service_role`). RLS `SELECT` uses `can_access_incident_report`. |
| Client uploads polyglot (HTML/SVG/EXE with `.jpg` extension) | `finalize` streams actual bytes, sniffs magic bytes, ignores declared MIME + client filename, chooses extension server-side. |
| Client claims wrong SHA-256 to disguise tamper | Server recomputes hash; `mismatch` → `quarantined`, download blocked. |
| Client races two finalize calls to duplicate evidence | Server-generated idempotency key + `UNIQUE(user_id, idempotency_key)`; replay returns existing `evidence_id`. |
| Two clients race the same pending path | Path is server-generated (`crypto.randomUUID()`); no collisions. Copy target checked before insert; unique index on `(incident_id, final_storage_path)`. |
| Storage token TTL longer than intended session | MyCleaner enforces `expires_at` (15 min) in `incident_evidence_upload_sessions`; expired sessions cannot finalize regardless of token validity. |
| CMS editor gains evidence access via CMS role bleed | `can_access_incident_report` never checks `has_knowledge_editor_role`. |
| Rate abuse (mass upload, mass download) | `incident_evidence_rate_events` counters — 20 inits/hr/user, 10 finalizes/hr/incident, 60 downloads/hr/user, `429` + `Retry-After`, generic errors. |
| Orphan Storage objects after `ON DELETE CASCADE` on `incident_reports` | Reconciliation view + `incident-evidence-orphan-worker` (dry-run by default; kill-switch env var). |
| Existence-leak via download errors | `incident-evidence-url` collapses all denial paths to a single `404 not_available`. |

## 2. Role & assignment matrix

| Role | Read own incident? | Read others? | Write metadata (client)? | Download verified? |
| --- | :-: | :-: | :-: | :-: |
| provider (owner) | ✅ | ❌ | ❌ | ✅ |
| customer | ❌ | ❌ | ❌ | ❌ |
| editor (CMS) | ❌ | ❌ | ❌ | ❌ |
| publisher (CMS) | ❌ | ❌ | ❌ | ❌ |
| support | ❌ (no assignment model yet) | ❌ | ❌ | ❌ |
| employee | ❌ (no assignment model yet) | ❌ | ❌ | ❌ |
| admin | ✅ | ✅ | ❌ | ✅ (audited) |
| super_admin | ✅ | ✅ | ❌ | ✅ (audited) |

**Known gap:** we currently deny support/employee by default because no
incident-assignment table exists. When it is introduced, extend
`can_access_incident_report` with an `EXISTS` lookup — do not widen the role
check itself.

## 3. Object lifecycle

```
[init]                       [finalize]                       [download]
client              server              storage                  server
  │  step=init         │                    │                       │
  │──────────────────▶│  createSignedUploadUrl(pending/…/obj.bin)   │
  │  PUT object       │                    │                       │
  ├──────────────────────────────────────▶ pending/                 │
  │  step=finalize    │                    │                       │
  │──────────────────▶│  download bytes    │                       │
  │                    │  sniff MIME + SHA │                       │
  │                    │  copy → final/    │                       │
  │                    │  insert row       │                       │
  │                    │  status=verified  │                       │
  │                                                            step=url
  │                                                           ─────▶│
  │                                              signed(final/…)◀───│
```

Failure states: `mismatch → quarantined`, unknown MIME → `quarantined`,
copy failure → `quarantined`, session expired → `410 session_expired`.
`quarantined`/`rejected` objects are non-downloadable and swept by the worker
after retention.

## 4. MIME + hash verification

- Allowed detected MIME: JPEG, PNG, WebP, PDF only. Any other → `quarantined`.
- Extension is derived from detected MIME (never client-supplied).
- SHA-256 recomputed server-side; client `claimed_file_hash` is compared only
  as a transport-integrity check. Mismatch aborts finalize.

## 5. Signed URL & session TTL

| Concept | Value | Enforcement |
| --- | --- | --- |
| Supabase Storage signed-upload token TTL | ~2h (SDK default; can be lower/higher, but not treated as authoritative) | Storage |
| MyCleaner upload-session TTL | 15 min | `expires_at` check in `finalize` |
| Signed download URL TTL | ≤120s (default 120) | Enforced by Zod schema |

Tokens & signed URLs are **never logged**.

## 6. Rate limits

Backed by `incident_evidence_rate_events`. Idempotent finalize replays MUST
NOT increment counters. All error responses use uniform text; `Retry-After`
included on `429`.

## 7. Retention & legal hold

| Class | Default retention | Legal-hold override |
| --- | --- | --- |
| Verified evidence | Indefinite until incident closure + jurisdictional retention window | `legal_hold=true` blocks all deletion |
| Quarantined/rejected | 30 days | `legal_hold=true` blocks |
| Expired pending session | 24h grace, then purged | N/A |

`ON DELETE CASCADE` on `incident_reports` deletes the DB row but **not** the
Storage object — the worker reconciles. Incident deletion / anonymisation is
not considered complete until the worker logs successful storage removal for
that incident.

## 8. GDPR / privacy exceptions

Verified evidence linked to a legal hold is retained even if the data subject
requests erasure — the retention override must be recorded with a lawful
basis in `incident_evidence.legal_hold_reason`. Anonymisation may still be
performed on associated metadata (captions, uploader IDs) where allowed.

## 9. Orphan cleanup — governance

The worker requires all of:

1. Cron secret env var `EVIDENCE_WORKER_CRON_SECRET` (rejected otherwise).
2. `EVIDENCE_WORKER_KILL=1` disables execution.
3. Defaults to `dry_run=true`. Live mode requires explicit `{"dry_run": false}`
   payload from the cron job.
4. Every tick writes an audit entry with counts and reasons (no PII).

## 10. Staging requirements before promotion

- Hardening migration applied on isolated staging DB.
- `scripts/knowledge-incident-evidence-rls-regression.sql` and
  `scripts/knowledge-incident-evidence-hardening-regression.sql` run green.
- Manual: init/finalize happy path, size cap, MIME spoofs (JPG-as-HTML,
  PNG-as-SVG, PDF-as-EXE, empty, oversized), expired session, hash mismatch,
  double finalize, download of quarantined/revoked evidence, cross-tenant
  access attempt, rate-limit trip.
- Worker dry-run reviewed for one retention cycle.

## 11. Known residual risks

- **No support/employee assignment model:** these roles are denied entirely,
  which will block support workflows once evidence review is required.
  Tracked separately.
- **Storage copy is not transactional with the DB insert:** worst case is a
  `final/*` object without a DB row; the orphan worker will flag but never
  auto-delete verified-looking objects.
- **Cron secret rotation** must be part of the standard secret-rotation
  playbook; not yet wired.
- **Backup exposure:** deleted evidence remains in DB backups until the
  standard retention window elapses. Document this in the DSAR playbook.
