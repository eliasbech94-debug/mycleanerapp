-- Trust Engine Phase 1B: revised inert schema proposal.
--
-- IMPORTANT:
-- - Intentionally outside supabase/migrations.
-- - Review only; never run against production.
-- - No bucket, Edge Function, public RPC or deployment is created here.
-- - All mutations are server-authoritative; authenticated clients receive SELECT only.

begin;

-- Idempotent enum proposal.
do $$
begin
  create type public.provider_intro_video_status as enum (
    'draft',
    'uploading',
    'processing',
    'in_review',
    'changes_requested',
    'approved',
    'published',
    'rejected',
    'failed',
    'archived',
    'expired'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.provider_intro_videos (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references public.provider_profiles(user_id) on delete cascade,

  -- Server-owned paths. Incoming objects are quarantined; final assets are immutable.
  incoming_storage_path text unique,
  final_storage_path text unique,
  thumbnail_storage_path text,
  captions_storage_path text,

  duration_seconds integer check (duration_seconds between 1 and 60),
  content_type text check (content_type in ('video/mp4', 'video/webm')),
  upload_content_type text check (upload_content_type in ('video/mp4', 'video/webm', 'video/quicktime')),
  file_size_bytes bigint check (file_size_bytes between 51200 and 26214400),
  width_pixels integer check (width_pixels is null or width_pixels between 1 and 1920),
  height_pixels integer check (height_pixels is null or height_pixels between 1 and 1080),
  has_audio boolean,
  frame_count bigint check (frame_count is null or frame_count > 0),
  language text,
  transcript text,
  recorded_in_mycleaner boolean not null default true,

  moderation_status public.provider_intro_video_status not null default 'draft',
  moderation_reason text,
  technical_failure_code text,

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  expires_at timestamptz,
  consent_ledger_id uuid,

  replaces_video_id uuid references public.provider_intro_videos(id) on delete set null,
  replaced_by_id uuid references public.provider_intro_videos(id) on delete set null,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint provider_intro_videos_submission_state check (
    moderation_status not in ('in_review', 'changes_requested', 'approved', 'published', 'rejected')
    or submitted_at is not null
  ),
  constraint provider_intro_videos_review_state check (
    moderation_status not in ('approved', 'published', 'rejected', 'changes_requested')
    or (reviewed_at is not null and reviewed_by is not null)
  ),
  constraint provider_intro_videos_approved_state check (
    moderation_status not in ('approved', 'published')
    or approved_at is not null
  ),
  constraint provider_intro_videos_published_state check (
    moderation_status <> 'published'
    or (
      published_at is not null
      and approved_at is not null
      and final_storage_path is not null
      and deleted_at is null
      and unpublished_at is null
    )
  ),
  constraint provider_intro_videos_rejection_reason check (
    moderation_status not in ('rejected', 'changes_requested')
    or nullif(btrim(moderation_reason), '') is not null
  ),
  constraint provider_intro_videos_failed_reason check (
    moderation_status <> 'failed'
    or nullif(btrim(technical_failure_code), '') is not null
  ),
  constraint provider_intro_videos_final_asset_state check (
    final_storage_path is null
    or moderation_status in ('in_review', 'changes_requested', 'approved', 'published', 'rejected', 'archived', 'expired')
  ),
  constraint provider_intro_videos_replacement_not_self check (
    replaces_video_id is null or replaces_video_id <> id
  )
);

-- One publicly published video per provider.
create unique index if not exists provider_intro_videos_one_published_per_provider
  on public.provider_intro_videos(provider_user_id)
  where moderation_status = 'published' and deleted_at is null;

-- One open replacement/draft per provider while an existing published video may remain live.
create unique index if not exists provider_intro_videos_one_inflight_per_provider
  on public.provider_intro_videos(provider_user_id)
  where deleted_at is null
    and moderation_status in ('draft', 'uploading', 'processing', 'in_review', 'changes_requested');

create index if not exists provider_intro_videos_moderation_queue
  on public.provider_intro_videos(moderation_status, submitted_at)
  where deleted_at is null;

create index if not exists provider_intro_videos_expiry_queue
  on public.provider_intro_videos(expires_at)
  where moderation_status = 'published' and expires_at is not null and deleted_at is null;

alter table public.provider_intro_videos enable row level security;

-- Proposal must be repeatable during review.
drop policy if exists "Providers read own intro videos" on public.provider_intro_videos;
drop policy if exists "Staff read intro videos" on public.provider_intro_videos;

revoke all on public.provider_intro_videos from anon, authenticated;
grant select on public.provider_intro_videos to authenticated;
grant all on public.provider_intro_videos to service_role;

-- Providers may read their own rows only. Mutation is server-only.
create policy "Providers read own intro videos"
  on public.provider_intro_videos
  for select
  to authenticated
  using (
    provider_user_id = auth.uid()
    and public.has_role(auth.uid(), 'provider')
  );

-- Support is read-only; admin and super_admin may read moderation records.
create policy "Staff read intro videos"
  on public.provider_intro_videos
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'support')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

-- Direct INSERT/UPDATE/DELETE grants and policies are intentionally absent.
-- Exact state transitions, field immutability, audit logging, consent checks,
-- provider visibility checks and role checks must live in SECURITY DEFINER RPCs
-- or Edge Functions using service-role access.

-- Public exposure is intentionally NOT implemented as a standalone anon view.
-- Extend the existing server-controlled public provider profile RPC instead.
-- It must:
--   * join through provider_profiles.user_id internally;
--   * require provider_profiles visibility/publication gates;
--   * return only rows in moderation_status = 'published';
--   * never expose provider_user_id, storage paths, transcript or reviewer data;
--   * compute the identity/video badge server-side from the canonical identity source;
--   * expose only provider_slug plus safe metadata.

-- Storage policy proposal:
--   * private bucket only;
--   * no general provider INSERT/UPDATE/DELETE policy on storage.objects;
--   * upload only through server-generated signed URL with upsert = false;
--   * server chooses the exact incoming path;
--   * finalize validates magic bytes/container/codec/duration/frames/audio/size;
--   * metadata is stripped and output transcoded to immutable final/video.mp4;
--   * approved/final assets cannot be overwritten by providers.

-- Required follow-up before promotion:
--   1. updated_at trigger;
--   2. state-machine RPCs and column guards;
--   3. admin_audit_log integration;
--   4. consent_ledger FK/source confirmation and withdrawal flow;
--   5. account_deletion_requests/legal_holds integration;
--   6. rate limiting and enumeration-safe responses;
--   7. isolated staging RLS/storage/state-machine regression;
--   8. exact provider visibility and identity-verification joins.

-- Proposal verification only. Always roll back while this file remains here.
rollback;
