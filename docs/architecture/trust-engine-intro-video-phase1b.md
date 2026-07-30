# Trust Engine Phase 1B — Provider intro video backend

Status: v4 architecture proposal only. Nothing in this document is deployed or applied.

## Boundary

Phase 1B supports one introduction video for the person represented by a provider account. Company/team worker videos remain out of scope.

The browser is never trusted to set ownership, paths, technical metadata, moderation fields, identity status, publication state, consent state or timestamps. Direct client INSERT/UPDATE/DELETE on intro-video tables and Storage objects is not part of the design.

## Canonical identity

- Owner key: `provider_profiles.user_id`.
- FK: `provider_intro_videos.provider_user_id -> provider_profiles(user_id)`.
- Every provider operation validates `auth.uid()`, provider role and profile ownership.
- Public contracts expose provider slug and safe metadata only.
- Identity/video badges are calculated server-side from the canonical identity source used by the public provider profile RPC.
- A material identity relink or reverification unpublishes the video and returns it to review.

## State machine

Primary flow:

`draft -> uploading -> processing -> in_review -> approved -> published`

Side states:

- `changes_requested`
- `rejected`
- `failed`
- `archived`
- `expired`

Rules:

- `processing` is mandatory after upload.
- `failed` is a technical failure; `rejected` is a moderation decision.
- `approved` is a short server-only state.
- `published` is the only public state.
- One provider may have at most one candidate across `draft`, `uploading`, `processing`, `in_review`, `changes_requested`, and `approved`.
- Candidate rows have server-owned deadlines. Expired draft/upload/processing rows transition to `failed` or `expired` so they cannot lock a provider indefinitely.
- Providers can withdraw their own non-published candidate through a server-authoritative endpoint.

## Persistent saga and recovery

Storage and PostgreSQL cannot share one transaction. The workflow therefore uses a persistent saga record, not comments or best-effort cleanup.

Each processing/publication attempt has a row in `provider_intro_video_jobs` with:

- video id and provider id;
- immutable idempotency key;
- worker job id;
- job state;
- attempt count;
- next retry time;
- processing deadline;
- callback nonce digest;
- final-object verification state;
- publish-pending marker;
- last error code;
- timestamps.

Flow:

1. Server creates the candidate and saga job.
2. Server creates an exact quarantine path and signed upload URL with `upsert = false`.
3. Client uploads once.
4. Orchestrator dispatches the media worker with a server-generated job id and idempotency key already bound to the candidate row.
5. Worker writes a content-addressed immutable final object.
6. Callback verifies signature, timestamp, nonce, idempotency key and expected job/video binding.
7. Server independently verifies object existence, checksum and technical metadata.
8. Job becomes `ready_to_publish` and the candidate receives a persistent `publish_pending_at` marker.
9. A database-only publish RPC atomically archives the old row, publishes the new row, writes reciprocal replacement links and audit events, then marks the saga completed.
10. A reconciliation worker retries jobs in `ready_to_publish` after crashes.
11. A cleanup worker applies deterministic retention rules to abandoned quarantine objects and terminal final objects.

No verified final object is silently orphaned merely because the publish request crashed.

## Deterministic retention ownership

- `published`: retain while published and while consent remains active.
- `archived`: retain for the configured replacement retention window unless deletion is requested and no legal hold applies.
- `rejected`: retain only for the moderation appeal window, then delete.
- `failed`: delete quarantine and partial final objects after the short technical-failure window.
- `expired`: delete after the configured expiry grace period.
- account deletion or consent withdrawal: unpublish immediately; physical deletion follows legal-hold and retention rules.

Retention must be represented in `data_retention_policies` before promotion.

## Storage contract

Private bucket: `provider-intro-videos`.

Paths:

- quarantine: `<provider-user-id>/<video-id>/incoming/<server-generated-name>`
- immutable final: `<provider-user-id>/<video-id>/final/<sha256>.mp4`
- thumbnail: `<provider-user-id>/<video-id>/final/<sha256>.jpg`
- captions: `<provider-user-id>/<video-id>/final/<sha256>.vtt`

Requirements:

- no general provider INSERT/UPDATE/DELETE policy on `storage.objects`;
- bucket is private;
- signed upload URL is path-bound, single-use in application semantics, short-lived, and uses `upsert = false`;
- final paths are content-addressed and never overwritten;
- providers never supply paths;
- playback endpoints never return bucket paths;
- cleanup operates only from database-owned object references and retention state.

## Media worker contract

Supabase Edge Functions orchestrate but do not perform heavy FFmpeg processing.

The selected worker/runtime must be decided before migration promotion and documented with:

- checksum: SHA-256, lowercase hex;
- canonical output: MP4 H.264 High/Main-compatible profile + AAC-LC;
- maximum decoded pixels: 2,073,600;
- maximum long side: 1920 px;
- portrait and landscape supported;
- metadata and GPS stripped;
- retry policy: exponential backoff with bounded attempts;
- processing timeout and dead-letter state;
- deterministic idempotent output path.

Worker callback authentication:

- HMAC-SHA256 over canonical request bytes plus timestamp, nonce, job id and idempotency key;
- maximum clock skew 5 minutes;
- nonce stored as a digest and accepted once only;
- constant-time signature comparison;
- callback retries return the previous result for the same idempotency key;
- mismatched video/job/provider binding fails closed;
- no signed URLs, secrets or raw tokens in logs.

## Replacement integrity

A provider may have at most one published video and one total candidate.

The publish RPC and a defensive trigger must enforce:

- old and new rows belong to the same provider;
- neither replacement link points to itself;
- no cycle exists;
- links are reciprocal;
- one successor per predecessor and one predecessor per successor;
- only a currently published row may be replaced;
- the old row is archived only after the new object is independently verified;
- all database changes and audit events occur in one transaction.

Service-role access is not treated as permission to violate these invariants.

## Consent model

The existing `consent_ledger` is append-only. Phase 1B requires a new allowed `consent_type`, for example `provider_intro_video_publication`, added in a separate reviewed migration.

Active consent means:

- latest ledger row for the provider and consent type;
- `granted = true`;
- policy version matches an accepted version;
- consent row belongs to the same provider;
- no newer revoke row exists.

`consent_ledger_id` must reference `public.consent_ledger(id)`. A publish RPC must verify the active-consent predicate; a not-null check is insufficient.

A new consent-ledger INSERT trigger or event handler must immediately unpublish a published video when the newest row for this consent type has `granted = false`. Physical deletion then follows retention and legal-hold rules.

## Checksum and object immutability

- checksum algorithm is SHA-256;
- format is lowercase 64-character hexadecimal;
- final path includes the checksum;
- database checks require the path suffix and stored checksum to agree;
- final objects use `upsert = false` and cannot be replaced in place;
- approval and publication require independent server verification of bytes at the exact path;
- any later mismatch immediately unpublishes and raises a security audit event.

## SECURITY DEFINER contract

Every database RPC must:

- use `SECURITY DEFINER`;
- use `SET search_path = public, pg_temp`;
- fully qualify `auth.*`, `storage.*` and other cross-schema references;
- follow `docs/security/DEFINER_FUNCTIONS.md` and be documented in the same migration;
- revoke execute from `PUBLIC`;
- grant execute only to exact required database roles;
- validate `auth.uid()` and application role internally;
- reject user-supplied paths and trusted metadata;
- avoid dynamic SQL;
- acquire row locks for state transitions;
- enforce expected previous state;
- write immutable audit events;
- fail closed on missing ownership, identity, visibility, consent or object verification.

A defensive trigger guards immutable/trusted columns and valid state transitions even when a service-role function is implemented incorrectly.

## Public profile integration

Do not expose an anon-readable base-table view.

Extend the existing server-controlled public provider profile contract, preferably `get_public_provider_profile_v2`, and return safe video metadata only when:

- provider profile is active and publicly visible;
- video state is `published`;
- active consent exists;
- identity verification passes;
- final-object verification is current;
- deletion/unpublication timestamps are null.

Playback uses a rate-limited endpoint accepting provider slug or opaque video id only. It rechecks all gates and returns a signed playback URL with TTL no longer than 300 seconds. Missing, unpublished, rejected and unauthorized records receive the same response.

## Technical limits

- recommended duration: 15–45 seconds;
- hard maximum duration: 60 seconds;
- file size: 50 kB–25 MB;
- accepted uploads: MP4, WebM, QuickTime/MOV;
- canonical output: MP4 H.264 + AAC;
- maximum long side: 1920 px;
- maximum decoded pixels: 2,073,600;
- portrait and landscape allowed;
- at least one decodable video frame and an audio track;
- magic-byte/container/codec validation;
- corrupt, truncated and polyglot files rejected;
- metadata and location stripped;
- upload creation limited to one per provider per 10 minutes plus abuse controls.

## Executable staging regression

The branch includes a review-only regression specification under:

`scripts/staging-required/trust-engine/provider-intro-video-regression.proposed.sql`

Before promotion it must be converted into an executable isolated-staging harness with fixtures and assertions for:

- cross-provider denial;
- no direct client mutation;
- no self-approval;
- one published and one candidate maximum;
- stale candidate expiry and provider recovery;
- callback replay, signature failure and idempotent retry;
- worker timeout/dead-letter recovery;
- crash after object verification but before publish;
- reconciliation of `ready_to_publish` jobs;
- replacement cross-provider, fork and cycle prevention;
- active-consent enforcement and immediate revoke unpublish;
- checksum format/path binding and object-swap prevention;
- double-publish races;
- visibility and identity gates;
- retention, deletion and legal holds;
- complete privileged audit coverage.

## Current branch boundary

This branch contains documentation and inert SQL proposals only. No migration, bucket, media worker, Edge Function, merge, deploy or production write is authorized.