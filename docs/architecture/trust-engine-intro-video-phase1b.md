# Trust Engine Phase 1B — Provider intro video backend

Status: v5 architecture proposal only. Nothing in this document is deployed or applied.

## Boundary

Phase 1B covers one introduction video for the person represented by a provider account. Company/team worker videos remain out of scope. Browsers never set ownership, paths, technical metadata, moderation fields, consent state, publication state or timestamps.

## Canonical identity

- Owner key: `provider_profiles.user_id`.
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
- A dead-letter job moves the linked video to `failed` in the same database transaction.

## Persistent saga and leases

Storage and PostgreSQL cannot share one transaction. The workflow therefore uses persistent database records:

1. `provider_intro_videos` stores the product/moderation state.
2. `provider_intro_video_jobs` stores processing and publish-reconciliation state.
3. `provider_intro_video_objects` records every quarantine/final/thumbnail/caption object independently of the video row.
4. `provider_intro_video_callback_nonces` records callback nonces with expiry.
5. `provider_intro_video_callback_results` stores idempotent callback results.

Workers claim jobs using a database function with `FOR UPDATE SKIP LOCKED`. A lease records `locked_by`, `lease_token`, `lease_expires_at` and `heartbeat_at`. Only the holder of the current lease token may update the job. Expired leases are reclaimable.

Deletion of a provider/video does not delete the object registry immediately. Object rows are marked for cleanup and survive until the cleanup worker confirms physical deletion or legal retention.

## Reconciliation

A dedicated index covers `ready_to_publish`. Reconciliation:

1. claims one ready job under a lease;
2. verifies the final object registry row is present, immutable and recently verified;
3. invokes the database publish RPC;
4. marks the job `completed` only after the video is `published`;
5. returns the same result for a repeated idempotency key.

The job/video invariant is checked transactionally: a completed publish job must reference a published video; a ready job must have matching `publish_pending_at` on the video.

## Retry, timeout and dead letter

Default proposal:

- processing timeout: 15 minutes;
- lease: 60 seconds, heartbeat every 20 seconds;
- maximum attempts: 5;
- exponential backoff: `min(15 minutes, 30 seconds * 2^(attempt-1))` plus jitter;
- dead-letter alert through the existing observability pipeline.

`retry_wait` requires `next_attempt_at`. `dead_letter` requires an error code and timestamp. Attempt count may never exceed max attempts. Dead-lettering also changes the video to `failed`, records an audit event and frees the candidate slot.

## Media worker callback security

Callbacks are service-to-service only.

Required headers:

- `X-MyCleaner-Key-Id`
- `X-MyCleaner-Timestamp`
- `X-MyCleaner-Nonce`
- `X-MyCleaner-Idempotency-Key`
- `X-MyCleaner-Signature`

Canonical signed bytes:

`v1\n<key-id>\n<unix-seconds>\n<nonce>\n<idempotency-key>\n<job-id>\n<video-id>\n<sha256(body)>`

Signature: lowercase hex HMAC-SHA256. Timestamp tolerance: 300 seconds. Key id supports rotation with overlapping active keys. Nonces are unique per key id and expire after 15 minutes. Callback results are persisted by idempotency key so identical retries return the original status/body without repeating transitions or audit events.

## Media processing

Supabase Edge Functions orchestrate only. Heavy processing runs in an isolated container worker or managed media service.

Canonical public output:

- MP4, H.264 video, AAC audio;
- SHA-256 lowercase hex checksum;
- content-addressed path: `<provider-user-id>/<video-id>/final/<sha256>.mp4`;
- thumbnail/captions also use content-addressed paths and their own checksums;
- maximum long side 1920 px;
- maximum decoded pixels 2,150,400 to allow common 1920x1088 padding;
- minimum short side 360 px;
- 15–45 seconds recommended, 60 seconds hard maximum;
- 25 MB upload maximum.

Final objects are written with `upsert=false` and may never be overwritten. Object verification stores checksum, byte length, storage version/etag and `verified_at`. Publication requires verification no older than 10 minutes. A periodic integrity job re-verifies published objects.

## Storage policies

Private bucket: `provider-intro-videos`.

- No general provider write/read policy on `storage.objects`.
- Upload uses one exact short-lived signed URL to a server-generated quarantine path.
- Public playback uses an enumeration-safe endpoint and a signed URL with TTL <= 300 seconds.
- Bucket paths and checksums are never returned by client-facing table/view contracts.

## Replacement integrity

The publish RPC locks both candidate and predecessor rows with `FOR UPDATE` before validating.

It enforces:

- same provider for old/new rows;
- predecessor was `published` immediately before replacement;
- one successor per predecessor and one predecessor per successor;
- reciprocal links;
- no cycle using a recursive CTE with a visited UUID array and a hard depth limit of 32;
- all row, job and audit updates in one database transaction.

## Consent

A new allowed consent type is required: `provider_intro_video_publication`.

The referenced consent row must:

- belong to the same `provider_user_id`;
- be the newest row for that user/type;
- use an accepted policy version;
- have `granted=true`;
- have no newer revoke row.

A new consent ledger row with `granted=false` triggers immediate database unpublication and schedules object cleanup subject to legal hold. Publication cannot rely on a mere non-null FK.

## SECURITY DEFINER contract

Every privileged RPC:

- uses `SECURITY DEFINER`;
- sets `search_path = public, pg_temp`;
- fully qualifies `auth.*`, `storage.*` and extension references;
- revokes execute from `PUBLIC`;
- grants execute only to exact roles;
- validates `auth.uid()` and application role internally;
- rejects client paths and server-owned metadata;
- avoids dynamic SQL;
- documents the function in the same migration as required by `docs/security/DEFINER_FUNCTIONS.md`;
- writes immutable audit events.

State transitions and immutable fields are database-enforced by functions/triggers, not only application code.

## Client-safe exposure

Authenticated providers read a safe view containing status, timestamps, public-safe technical summary and moderation guidance. It excludes:

- incoming/final paths;
- checksums and object versions;
- worker/job identifiers;
- transcript unless a separate product decision permits it;
- internal moderation notes.

Admin/super_admin use a privileged operational view. Support receives a deliberately limited support projection with job status/error code but no paths, secrets, transcript or checksum. `employee` has no access unless explicitly designed later.

## Retention and cleanup

Persistent object rows define deterministic cleanup:

- quarantine objects: delete after 24 hours when abandoned/failed;
- rejected/failed final objects: delete after 30 days;
- archived/replaced objects: delete after 90 days;
- expired objects: delete after 30 days;
- legal hold blocks physical deletion but never required unpublication;
- account deletion schedules all objects while retaining required audit records.

Seed corresponding `data_retention_policies` records. Cleanup uses object rows rather than inferring paths from video rows.

## Promotion gates

Before migration/deployment:

1. implement lease claim/heartbeat/reconciliation RPCs;
2. implement callback verification, nonce and idempotent result storage;
3. implement active-consent predicate and revoke-unpublish trigger;
4. implement safe provider/support/admin views and column grants;
5. implement replacement/state/immutability guards;
6. implement object registry and retention worker;
7. implement executable isolated-staging regression with real fixtures, RPC calls, role impersonation and concurrency tests;
8. wire dead-letter alerts into observability;
9. obtain explicit approval before bucket creation, migration, function deployment or production changes.

## Current branch boundary

This branch contains documentation and inert SQL/regression proposals only. No migration, bucket, media worker, Edge Function, merge, deploy or production write is authorized.
