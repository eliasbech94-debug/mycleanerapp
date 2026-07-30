# Trust Engine Phase 1B — Provider intro video backend

Status: v3 architecture proposal only. Nothing in this document is deployed or applied.

## Confirmed boundary

Phase 1B is limited to one introduction video for the person represented by a provider account. Company/team worker videos remain out of scope.

The browser is never trusted to set ownership, paths, technical metadata, moderation fields, identity status, publication state or timestamps. Direct client INSERT/UPDATE/DELETE on the video table is not part of the design.

## Canonical identity

- Internal owner key: `provider_profiles.user_id`.
- Database FK: `provider_intro_videos.provider_user_id -> provider_profiles(user_id)`.
- Every server mutation requires `auth.uid()` to match the provider and requires the provider role.
- Public contracts expose only provider slug and safe video metadata.
- Identity/video verification badges are computed server-side from the canonical identity source used by the public provider profile RPC.
- Material identity relink or reverification immediately unpublishes the video and returns it to review.

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
- `failed` is technical failure; `rejected` is human moderation rejection.
- `approved` is a short server-only transition immediately before publication.
- `published` is the only public state.
- One provider may have at most one candidate across `draft`, `uploading`, `processing`, `in_review`, `changes_requested`, and `approved`.
- Re-review is required after material identity changes and may be required after 12–24 months.

## Media processing decision

Supabase Edge Functions orchestrate the workflow but do not perform heavy FFmpeg processing.

A dedicated isolated media worker must perform:

- magic-byte and container validation;
- codec, duration, dimensions, frame and audio validation;
- metadata/GPS stripping;
- transcoding to MP4 H.264 + AAC;
- thumbnail generation;
- checksum calculation;
- writing immutable final assets.

The exact worker vendor/runtime remains a deployment decision. Acceptable implementations include a locked-down container worker or a managed video service. No production implementation may assume FFmpeg is available inside a normal Deno Edge Function.

## Storage and database saga

Private bucket: `provider-intro-videos`.

Paths:

- quarantine: `<provider-user-id>/<video-id>/incoming/<server-generated-name>`
- immutable output: `<provider-user-id>/<video-id>/final/video.mp4`
- thumbnail: `<provider-user-id>/<video-id>/final/thumbnail.jpg`
- captions: `<provider-user-id>/<video-id>/final/captions.vtt`

There is no general provider write policy on `storage.objects`.

Because Storage operations and PostgreSQL updates cannot share one transaction, publication uses a saga:

1. Server creates the row and signed upload URL with `upsert = false`.
2. Provider uploads once to the exact quarantine path.
3. Media worker validates and writes immutable final assets.
4. Server verifies final-object existence, checksum and technical metadata.
5. A database-only transaction publishes the candidate, archives the previous video, validates replacement ownership, writes audit records and stores final metadata.
6. A cleanup worker removes orphaned quarantine/final objects after failures or abandoned jobs.

A database row must never enter `approved` or `published` until the immutable final object has been verified.

## Replacement integrity

A provider may have:

- at most one published video; and
- at most one candidate including `approved`.

The existing published video remains visible while the replacement is reviewed.

The publish RPC must enforce:

- old and new rows have the same `provider_user_id`;
- neither replacement link points to itself;
- no circular replacement chain;
- `replaces_video_id` and `replaced_by_id` are written consistently;
- the previous video is archived only after the new final object is verified;
- all database changes and audit entries occur in one database transaction.

## Public profile integration

Do not expose an independent anon-readable view over the base table.

Extend the existing server-controlled public provider profile contract, preferably `get_public_provider_profile_v2`, and return video metadata only when:

- provider profile is active and publicly visible;
- video state is `published`;
- `published_at` is set;
- `deleted_at` and `unpublished_at` are null;
- active versioned consent exists;
- identity verification satisfies the canonical badge rule.

Playback uses a separate rate-limited endpoint accepting only provider slug or opaque video ID. It re-checks publishability and returns a per-request signed URL with TTL no longer than 300 seconds. Missing, unpublished, rejected and unauthorized records return the same response.

## Server operations

1. `provider-intro-video-create-upload`
   - verifies `auth.uid()`, provider role and provider profile;
   - enforces one candidate including `approved`;
   - creates server-owned row/path;
   - returns signed upload URL with `upsert = false`.

2. `provider-intro-video-finalize`
   - verifies ownership and exact object;
   - changes `uploading -> processing`;
   - dispatches the isolated media worker;
   - records worker job ID without trusting client metadata.

3. `provider-intro-video-processing-callback`
   - authenticated service-to-service callback only;
   - verifies callback signature, job ID and checksum;
   - stores measured metadata and immutable final path;
   - changes `processing -> in_review` or `failed`.

4. `provider-intro-video-withdraw`
   - withdraws candidates;
   - immediately unpublishes when consent is withdrawn;
   - schedules deletion subject to retention and legal holds.

5. `provider-intro-video-moderate`
   - admin or super_admin only;
   - support remains read-only;
   - requires reasons for rejection/changes requested;
   - moves `in_review -> approved|rejected|changes_requested`.

6. `provider-intro-video-publish`
   - server-only database transaction;
   - verifies final object, checksum, moderation, active consent, identity and provider visibility;
   - validates replacement integrity;
   - atomically publishes the candidate and archives the old row.

7. `provider-intro-video-public-url`
   - rate-limited and enumeration-safe;
   - accepts no paths;
   - returns signed URL with TTL <= 300 seconds;
   - never logs tokens or full signed URLs.

## SECURITY DEFINER contract

Every database RPC must explicitly:

- use `SECURITY DEFINER`;
- set a fixed `search_path`, preferably `set search_path = public, auth, storage`;
- revoke execute from `PUBLIC`;
- grant execute only to the exact required database role;
- validate `auth.uid()` and application role internally;
- reject user-supplied storage paths and server-owned metadata;
- avoid dynamic SQL;
- write immutable audit events;
- fail closed on missing identity, consent, visibility or ownership state.

Service-role Edge Functions must apply the same checks even though service role bypasses RLS.

## Technical limits

- recommended duration: 15–45 seconds;
- hard maximum duration: 60 seconds;
- file size: 50 kB minimum, 25 MB maximum;
- accepted uploads: MP4, WebM, QuickTime/MOV;
- canonical output: MP4 H.264 + AAC;
- maximum output resolution: 1080p;
- at least one decodable video frame and an audio track;
- server-measured duration and metadata;
- MP4/MOV `ftyp` and WebM `1A 45 DF A3` signature validation;
- reject corrupt, truncated and polyglot files;
- strip location and other unnecessary metadata;
- one upload creation per provider per 10 minutes, plus abuse controls.

## Consent, retention and deletion

Publishing face and voice requires an active, versioned consent record in `consent_ledger`. The database publish operation must fail without it.

Withdrawal immediately unpublishes the video. Physical deletion integrates with account deletion requests, legal holds, audit retention and replacement retention windows.

Signed URLs can remain usable until expiry. Urgent takedown also moves or removes the final object where required.

## Required staging regression

Before promotion, isolated staging tests must verify:

- cross-provider read/write denial;
- no direct client mutation;
- no self-approval;
- one published and one total candidate maximum;
- `approved` cannot accumulate;
- replacement links cannot cross providers or form cycles;
- publish fails without active consent;
- publish fails without verified final object/checksum;
- provider visibility and identity gates;
- signed URL expiry and enumeration-safe responses;
- failed Storage/media jobs leave no published rows;
- cleanup removes orphaned objects;
- account deletion, withdrawal and legal-hold behavior;
- all privileged actions create audit records.

## Current branch boundary

This branch contains documentation and inert SQL proposals only. No migration, bucket, media worker, Edge Function, merge, deploy or production write is authorized.
