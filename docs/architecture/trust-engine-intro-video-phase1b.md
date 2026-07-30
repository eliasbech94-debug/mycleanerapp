# Trust Engine Phase 1B — Provider intro video backend

Status: revised architecture proposal only. Nothing in this document is deployed or applied.

## Confirmed boundary

Phase 1B is limited to one introduction video for the person represented by a provider account. Company/team worker videos are out of scope until ownership, consent and deletion semantics are designed separately.

The browser is never trusted to set ownership, paths, technical metadata, moderation fields, identity status, publication state or timestamps. Direct client INSERT/UPDATE/DELETE on the video table is not part of the design; all mutations go through server-authoritative Edge Functions or SECURITY DEFINER RPCs.

## Canonical identity

- Internal owner key: `provider_profiles.user_id`.
- Database FK: `provider_intro_videos.provider_user_id -> provider_profiles(user_id)`.
- Every server mutation also requires the authenticated user to have the provider role.
- Public contracts expose only `provider_slug` and video metadata; `auth.users.id` is never returned publicly.
- The verified-video badge is calculated server-side from the canonical identity-verification source used by the provider profile RPC. The client must not combine independent flags.
- A material identity relink/reverification event immediately unpublishes the video and returns it to `in_review`.

## State machine

Moderation and publication are separate:

`draft -> uploading -> processing -> in_review -> approved -> published`

Side states:

- `changes_requested`
- `rejected`
- `failed`
- `archived`
- `expired`

Rules:

- `processing` is mandatory after upload. The server validates bytes, container, codecs, duration, dimensions, audio/video tracks, metadata and path.
- `failed` means technical validation failed; `rejected` means human moderation rejected the content.
- `approved` means moderation passed but the asset is not yet public.
- `published` is the only publicly playable state.
- Unpublishing is immediate and does not erase the moderation result.
- Re-review is required after material identity changes and may be required after 12–24 months.

## Replacement model

A provider may have:

- at most one published video; and
- at most one open replacement in `draft`, `uploading`, `processing`, `in_review` or `changes_requested`.

The existing published video remains visible while a replacement is reviewed. On publication of the replacement, a single server transaction:

1. unpublishes and archives the previous video;
2. moves/records the new immutable final object;
3. publishes the replacement;
4. links both rows through `replaces_video_id` / `replaced_by_id`;
5. writes an immutable audit event.

## Storage

Private bucket: `provider-intro-videos`.

Proposed paths:

- upload quarantine: `<provider-user-id>/<video-id>/incoming/<server-generated-name>`
- immutable approved asset: `<provider-user-id>/<video-id>/final/video.mp4`
- thumbnail: `<provider-user-id>/<video-id>/final/thumbnail.jpg`
- captions: `<provider-user-id>/<video-id>/final/captions.vtt`

There is no general provider write policy on `storage.objects`.

Upload flow:

1. Server creates the draft row and exact incoming path.
2. Server returns a short-lived signed upload URL with `upsert = false`.
3. Client uploads once.
4. Finalize endpoint validates the stored object and moves/copies a sanitized transcoded asset into `final/`.
5. Approved/final objects are immutable to providers.

Providers never supply an arbitrary storage path. Anonymous users never receive bucket access.

## Public profile integration

Do not expose an independent anon-readable view over the base table.

Extend the existing server-controlled public provider profile contract, preferably `get_public_provider_profile_v2`, so the video is returned only when all conditions are true:

- provider profile is active and publicly visible;
- video state is `published`;
- `published_at` is set;
- `deleted_at` is null;
- identity verification satisfies the canonical badge rule.

The public response contains slug-linked metadata only. Playback requires a separate endpoint that accepts a provider slug or opaque video id, re-checks publishability, and returns a signed playback URL with TTL no longer than 300 seconds.

The endpoint must return the same not-found response for missing, unpublished, rejected and unauthorized records to prevent enumeration.

## Server operations

1. `provider-intro-video-create-upload`
   - verifies provider role and provider profile;
   - enforces one open in-flight replacement;
   - creates a draft row with server-owned fields;
   - creates an exact incoming path;
   - returns a signed upload URL with `upsert = false`.

2. `provider-intro-video-finalize`
   - verifies ownership and expected object;
   - changes `uploading -> processing`;
   - performs magic-byte/container validation;
   - measures duration and dimensions server-side;
   - rejects zero-frame, silent/corrupt and unsupported files;
   - strips metadata and transcodes to the canonical playback format;
   - changes `processing -> in_review` or `failed`.

3. `provider-intro-video-withdraw`
   - withdraws drafts and in-review replacements;
   - immediately unpublishes a currently published video when consent is withdrawn;
   - schedules physical deletion subject to retention and legal holds.

4. `provider-intro-video-moderate`
   - admin or super_admin only unless a later policy explicitly delegates moderation;
   - support is read-only;
   - enforces the exact state machine;
   - requires a reason for rejection/changes requested;
   - writes audit events.

5. `provider-intro-video-publish`
   - server-only transaction;
   - verifies moderation, identity and provider visibility;
   - atomically replaces the previous published row.

6. `provider-intro-video-public-url`
   - rate-limited;
   - accepts only slug/opaque id, never a path;
   - returns a per-request signed URL with TTL <= 300 seconds;
   - never logs tokens or URLs.

## Technical limits

Upload acceptance:

- duration: 15–45 seconds recommended; hard maximum 60 seconds;
- size: 50 kB minimum, 25 MB maximum;
- accepted upload containers: MP4, WebM and QuickTime/MOV;
- canonical public output: MP4 H.264 video + AAC audio;
- maximum output resolution: 1080p;
- at least one decodable video frame and an audio track are required.

Validation is server-side and includes:

- MP4/MOV `ftyp` box verification;
- WebM/Matroska `1A 45 DF A3` signature verification;
- codec/container validation;
- measured duration, not client-declared duration;
- metadata stripping, including location metadata;
- filename/path independence;
- rejection of polyglot, corrupt and truncated files.

Rate limit proposal: one upload creation per provider per 10 minutes, with stricter abuse limits server-side.

## Consent, retention and deletion

Publishing face and voice requires a versioned consent record in `consent_ledger`. Withdrawal must immediately unpublish the video.

Physical deletion must integrate with:

- account deletion requests;
- legal holds;
- moderation/audit retention rules;
- replacement retention windows.

Signed URLs may remain usable until their short expiry. For urgent takedowns, the final object must also be moved or removed so previously issued URLs fail as soon as Storage permits.

## Audit requirements

Create immutable audit records for creation, upload finalization, validation failure, submission, changes requested, approval, rejection, publication, unpublication, replacement, expiry, withdrawal and deletion.

Each event records actor, role, video id, previous/new state, reason code, request/correlation id and timestamp. Integrate privileged actions with `admin_audit_log`.

## Promotion gates

Before any file moves into `supabase/migrations/`:

1. confirm the exact provider role and identity-verification source;
2. design the extension to `get_public_provider_profile_v2`;
3. add transactional state-machine functions/RPCs;
4. add Storage quarantine/finalization functions;
5. add MIME/container validation and metadata stripping;
6. add rate limiting;
7. add consent, withdrawal, retention and legal-hold behavior;
8. add immutable audit integration;
9. add isolated staging RLS/Storage/state-machine regression tests;
10. obtain explicit approval before creating a bucket, applying a migration or deploying functions.

## Current branch boundary

This branch contains documentation and inert SQL proposals only. No migration, bucket, Edge Function, merge, deploy or production write is authorized.