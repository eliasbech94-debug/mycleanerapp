# Trust Engine Phase 1B — Provider intro video backend

Status: architecture proposal only. Nothing in this document is deployed or applied.

## Goal

Add a secure backend for the existing frontend-only `Meet Your Cleaner` experience:

- providers record a short introduction in MyCleaner;
- the original file remains private;
- a provider can replace or delete a draft/pending video;
- moderators approve or reject submissions;
- only approved videos can be exposed to public provider profiles;
- no client can promote its own video to `approved`.

## Security boundary

The browser must never be trusted to set moderation fields, public URLs, ownership, or approval timestamps.

Public profile reads must use a server-controlled view/RPC that returns only rows where:

- `moderation_status = 'approved'`;
- `deleted_at IS NULL`;
- `published_at IS NOT NULL`;
- the provider profile is otherwise publicly visible.

Draft, uploading, pending, rejected, archived, and deleted records remain private to the provider and privileged staff.

## Proposed database model

Table: `public.provider_intro_videos`

Key fields:

- `id uuid primary key`
- `provider_user_id uuid references auth.users(id)`
- `storage_path text unique`
- `thumbnail_storage_path text`
- `duration_seconds integer`
- `content_type text`
- `file_size_bytes bigint`
- `language text`
- `transcript text`
- `recorded_in_mycleaner boolean`
- `moderation_status text`
- `moderation_reason text`
- `submitted_at timestamptz`
- `reviewed_at timestamptz`
- `reviewed_by uuid`
- `approved_at timestamptz`
- `published_at timestamptz`
- `deleted_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Only one non-deleted active intro video is allowed per provider.

Allowed states:

`draft -> uploading -> pending -> approved | rejected -> archived`

Replacement archives the old approved row only after the new file has been safely persisted. The public profile keeps showing the previous approved video until the replacement is approved.

## Storage

Private bucket: `provider-intro-videos`

Canonical object path:

`<provider-user-id>/<video-id>/original.<extension>`

Optional derived assets:

- `<provider-user-id>/<video-id>/thumbnail.jpg`
- `<provider-user-id>/<video-id>/transcript.vtt`

Rules:

- provider can create/read/delete files only under their own first path segment;
- provider cannot read another provider's object;
- anonymous/public users never receive direct bucket access;
- moderators may read objects through a privileged server path;
- approved public playback uses a short-lived signed URL generated server-side;
- storage path validation is repeated in the database/Edge Function, not only in RLS.

## API/Edge Functions

Recommended server-authoritative operations:

1. `provider-intro-video-create-upload`
   - verifies authenticated provider;
   - validates active-record constraints;
   - creates a draft row;
   - returns a short-lived signed upload URL for the exact canonical path.

2. `provider-intro-video-submit`
   - verifies ownership;
   - checks object metadata, duration, MIME type, size, and path;
   - changes `draft/uploading -> pending`;
   - providers cannot submit arbitrary storage paths.

3. `provider-intro-video-delete`
   - provider may delete draft/pending/rejected records;
   - approved videos are archived first and deleted asynchronously after a retention window.

4. `provider-intro-video-moderate`
   - staff/admin only;
   - changes `pending -> approved|rejected`;
   - writes reviewer, reason, and timestamps;
   - records an audit event.

5. `provider-intro-video-public-url`
   - accepts provider slug or video id;
   - verifies the record is currently publishable;
   - returns a short-lived signed playback URL;
   - never returns storage paths for non-approved records.

## Validation limits

Initial proposal:

- maximum duration: 30 seconds;
- maximum file size: 50 MB;
- accepted MIME types: `video/webm`, `video/mp4`, `video/quicktime`;
- no autoplay;
- no user-supplied HTML in transcript or moderation reason;
- server rejects empty, missing, oversized, unsupported, or path-mismatched objects.

Exact browser/container compatibility should be verified on staging before production.

## Moderation and audit

Every submission, approval, rejection, archive, delete, and replacement should create an immutable audit event containing:

- actor user id;
- actor role;
- video id;
- previous status;
- new status;
- reason code;
- timestamp;
- request/correlation id.

Do not store sensitive identity documents or unrelated personal data in the video table.

## Rollout gates

Before moving the SQL proposal into `supabase/migrations/`:

1. confirm the canonical provider identity relationship in the current schema;
2. run the RLS regression against isolated staging;
3. verify storage ownership and cross-provider denial;
4. verify providers cannot self-approve or alter moderation fields;
5. verify anonymous users cannot enumerate bucket objects;
6. verify approved playback URLs expire;
7. verify replacement preserves the old approved video until the new one is approved;
8. add generated Supabase types and frontend integration;
9. add retention/deletion worker design;
10. obtain explicit approval before applying migrations or creating the bucket.

## Current branch boundary

This branch may contain documentation and inert SQL/regression proposals only.

It must not:

- deploy an Edge Function;
- create a bucket;
- apply a migration;
- modify production configuration;
- merge automatically;
- expose draft or pending videos publicly.
