# Trust Engine Phase 1B — Provider intro video backend

Status: v6 architecture proposal only. Nothing in this document is deployed or applied.

## Boundary

Phase 1B covers one introduction video for the person represented by a provider account. Company/team worker videos remain out of scope. Browsers never set ownership, paths, technical metadata, moderation fields, consent state, publication state or timestamps.

## Canonical identity

- Owner key: `provider_profiles.user_id`.
- `provider_user_id` is immutable after insert on video and job rows.
- Every video, job, object and consent check is bound to the same provider user id.
- Public contracts expose only provider slug and safe metadata.
- Material identity relink/reverification immediately unpublishes the video and returns it to review.

## State model

Video flow:

`draft -> uploading -> processing -> in_review -> approved -> published`

Side states: `changes_requested`, `rejected`, `failed`, `archived`, `expired`.

Job flow:

`queued -> leased -> processing -> retry_wait -> ready_to_publish -> completed`

Terminal job states: `failed`, `dead_letter`, `cancelled`.

Rules:

- One provider may have at most one published video and one active candidate.
- Candidate states are `draft`, `uploading`, `processing`, `in_review`, `changes_requested`, `approved`.
- Candidate expiry/withdrawal must free the slot.
- `approved` is a short server-only transition immediately before publication.
- A dead-letter transition moves the linked candidate to `failed` in the same database transaction.

## Persistent saga, objects and deletion

Storage and PostgreSQL cannot share one transaction. The workflow uses persistent database records:

1. `provider_intro_videos` stores product/moderation state.
2. `provider_intro_video_jobs` stores processing and publish-reconciliation state.
3. `provider_intro_video_objects` records every quarantine/final/thumbnail/caption object independently of provider/video lifetime.
4. `provider_intro_video_callback_nonces` records globally unique callback nonces with expiry.
5. `provider_intro_video_callback_results` stores callback idempotency results bound to key, job and request-body hash.

Object rows keep `provider_user_id` and immutable `original_video_id` without a cascading provider FK. Their nullable `video_id` may become null while the original path remains valid. This avoids losing the only cleanup record when account/video data is removed.

Application deletion is soft-delete only. Physical provider/video deletion is allowed only after jobs are terminal and every object is either deleted, scheduled for cleanup or held by a legal hold. The object registry survives until physical Storage deletion is confirmed.

## Worker leases

Workers claim jobs with a database RPC using `FOR UPDATE SKIP LOCKED` over the `(status, next_attempt_at, created_at)` claim index.

A valid lease has:

- `locked_by`;
- globally unique `lease_token`;
- `heartbeat_at`;
- `lease_expires_at > heartbeat_at`.

Only `leased` and `processing` may retain lease fields. Queued, retry and terminal states must have all lease fields cleared. Heartbeat and state updates require the current lease token. Expired leases are reclaimable.

Default proposal:

- lease: 60 seconds;
- heartbeat every 20 seconds;
- processing timeout: 15 minutes;
- maximum attempts: 5;
- exponential backoff: `min(15 minutes, 30 seconds * 2^(attempt-1))` plus jitter.

`retry_wait` requires a future `next_attempt_at`; all other states require it to be null. `dead_letter` requires `attempt_count=max_attempts`, error code and timestamp. Dead-lettering frees the provider's candidate slot by atomically transitioning the candidate to `failed`.

## Ready-to-publish reconciliation

A dedicated partial index covers `ready_to_publish`.

The ready job and linked video must have identical `publish_pending_at`. Reconciliation:

1. claims one ready job under a lease;
2. verifies the final object is immutable, checksum-bound and recently verified;
3. locks candidate, predecessor and job rows;
4. invokes the publish transaction;
5. marks the job completed only after the candidate is published;
6. returns the persisted prior result for an identical idempotency retry.

The reverse lifecycle is explicit: unpublishing or archiving a video does not erase job history. A completed job means the publish transaction completed at that time, not that the video must remain published forever.

## Replacement publication

Replacement is one database transaction:

1. lock candidate and predecessor with `FOR UPDATE`;
2. verify the candidate is approved and has active consent;
3. verify the predecessor belongs to the same provider and is currently published;
4. verify predecessor/successor uniqueness;
5. detect cycles with a visited UUID array and hard depth limit of 32;
6. archive the predecessor and set its `replaced_by_id`;
7. publish the candidate;
8. complete the matching ready job.

The predecessor is archived before the candidate becomes published. Therefore the one-published unique index remains valid throughout the transaction. Reciprocical links are written by the same transaction, never by independent client updates.

## Consent

A new allowed consent type is required in the existing `consent_ledger` constraint:

`provider_intro_video_publication`

Accepted policy versions are stored in `provider_intro_video_consent_versions`.

Publication requires the referenced consent row to:

- belong to the same provider;
- use `provider_intro_video_publication`;
- be the newest row for that user/type;
- use an active accepted policy version;
- have `granted=true`.

A newer append-only row with `granted=false` invalidates the previous grant. An insert trigger immediately unpublishes any published intro video and schedules its objects for cleanup, unless a legal hold changes cleanup state to `held`.

A non-null FK alone is never sufficient.

## Callback authentication and replay protection

Required headers:

- `X-MyCleaner-Key-Id`
- `X-MyCleaner-Timestamp`
- `X-MyCleaner-Nonce`
- `X-MyCleaner-Idempotency-Key`
- `X-MyCleaner-Signature`

Canonical signed bytes:

`v1\n<key-id>\n<unix-seconds>\n<nonce>\n<idempotency-key>\n<job-id>\n<video-id>\n<sha256(body)>`

Signature: lowercase hex HMAC-SHA256. Timestamp tolerance: ±300 seconds. Key rotation may overlap active keys, but nonce uniqueness is global across key ids, preventing replay during rotation.

Nonce rows expire no later than 15 minutes after callback timestamp and have an expiry index. Callback results bind the idempotency key to `key_id`, `job_id` and `request_body_sha256`. Reusing the same idempotency key with different binding data is rejected; an identical retry returns the persisted response without repeating transitions or audit events.

## Media processing and object paths

Heavy processing runs in an isolated container worker or managed media service. Edge Functions orchestrate only.

Canonical public output:

- MP4 H.264 + AAC;
- lowercase SHA-256;
- final video path: `<provider>/<video>/final/<sha256>.mp4`;
- thumbnail path: `<provider>/<video>/thumbnail/<sha256>.jpg`;
- captions path: `<provider>/<video>/captions/<sha256>.vtt`;
- incoming path: `<provider>/<video>/incoming/<server-uuid>.(mp4|webm|mov)`;
- maximum long side 1920 px;
- maximum decoded pixels 2,150,400, allowing 1920×1088 padding;
- minimum short side 360 px;
- 60-second hard maximum;
- 25 MB upload maximum.

Every object row includes `bucket_id`; uniqueness is `(bucket_id, storage_path)`. Final assets are immutable and content-addressed. Paths reject empty names, traversal and arbitrary extensions.

Final objects are written with `upsert=false`. Verification stores checksum, byte length, Storage version/etag and `verified_at`. Publication requires recent verification; a periodic integrity task re-verifies published objects and unpublishes on mismatch or disappearance.

## Safe client exposure

Base tables are not readable by `anon` or normal authenticated clients. All sensitive tables, including nonce/result tables, have RLS enabled.

Provider view:

- `security_invoker=true` and `security_barrier=true`;
- filters to `provider_user_id=auth.uid()` and provider role;
- excludes Storage paths, checksums, transcript, internal notes, worker ids and lease data.

Support view:

- `security_invoker=true` and `security_barrier=true`;
- visible only to support/admin/super_admin through an explicit role predicate;
- contains limited status/error diagnostics;
- excludes paths, checksums, transcript, secrets and lease tokens.

`employee` receives no access unless separately designed.

## Retention and legal hold

Objects carry explicit cleanup state, cleanup date and optional `legal_hold_id`.

- `scheduled` requires `cleanup_after` and no legal hold.
- `held` requires a legal hold and no cleanup date.
- cleanup workers use `(cleanup_status, cleanup_after)` partial index.

Seeded retention proposals:

- quarantine/abandoned: 1 day;
- rejected/failed final: 30 days;
- archived/replaced final: 90 days;
- expired final: 30 days.

Legal hold blocks physical deletion but never mandatory unpublication.

## SECURITY DEFINER rules

Every privileged RPC:

- uses `SECURITY DEFINER`;
- sets `search_path=public,pg_temp`;
- fully qualifies `auth.*`, `storage.*` and extension references;
- revokes execute from `PUBLIC`;
- grants execute only to exact roles;
- validates ownership, role, current lease token, consent and state internally;
- rejects client paths and technical metadata;
- avoids dynamic SQL;
- writes immutable audit events;
- is documented in the same migration under `docs/security/DEFINER_FUNCTIONS.md`.

## Regression boundary

The v6 SQL regression file is intentionally a self-contained schema/RPC contract test. It no longer references nonexistent RPC names or a nonexistent test registry.

It checks:

- schema and RLS presence;
- safe-view options/columns;
- dimension constraints;
- candidate uniqueness;
- immutable ownership;
- job ownership and lease-state constraints;
- global nonce replay protection;
- callback result binding;
- strict object paths;
- active/latest consent behavior;
- retention seeds and cleanup index.

It is not falsely presented as the complete deployment gate. A later implementation PR must add and run a separate endpoint/worker/concurrency harness covering:

1. two-session `SKIP LOCKED` claims and heartbeat ownership;
2. real HTTP HMAC validation and key rotation;
3. crash/reconciliation between verification and publication;
4. concurrent double-publish and replacement races;
5. signed-upload overwrite denial and object swap;
6. role-impersonated view isolation;
7. legal-hold cleanup and immutable audit coverage.

Until that harness exists and is green, promotion remains blocked.

## Current branch boundary

This branch contains documentation and inert SQL/regression proposals only. No migration, bucket, Storage policy, media worker, Edge Function, merge, deploy or production write is authorized.
