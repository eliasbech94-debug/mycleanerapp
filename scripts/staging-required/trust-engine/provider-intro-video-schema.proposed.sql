-- Trust Engine Phase 1B: v3 inert schema proposal.
--
-- IMPORTANT:
-- - Intentionally outside supabase/migrations.
-- - Review only; never run against production.
-- - No bucket, media worker, Edge Function, public RPC or deployment is created here.
-- - All mutations are server-authoritative; authenticated clients receive SELECT only.

begin;

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

  incoming_storage_path text unique,
  final_storage_path text unique,
  final_object_checksum text,
  media_job_id text unique,
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
    or (
      approved_at is not null
      and final_storage_path is not null
      and nullif(btrim(final_object_checksum), '') is not null
      and duration_seconds is not null
      and file_size_bytes is not null
      and width_pixels is not null
      and height_pixels is not null
      and has_audio is true
      and frame_count is not null
    )
  ),
  constraint provider_intro_videos_published_state check (
    moderation_status <> 'published'
    or (
      published_at is not null
      and approved_at is not null
      and final_storage_path is not null
      and nullif(btrim(final_object_checksum), '') is not null
      and consent_ledger_id is not null
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
  ),
  constraint provider_intro_videos_replaced_by_not_self check (
    replaced_by_id is null or replaced_by_id <> id
  )
);

-- One publicly published video per provider.
create unique index if not exists provider_intro_videos_one_published_per_provider
  on public.provider_intro_videos(provider_user_id)
  where moderation_status = 'published' and deleted_at is null;

-- One total candidate, including approved, while an existing published video may remain live.
create unique index if not exists provider_intro_videos_one_candidate_per_provider
  on public.provider_intro_videos(provider_user_id)
  where deleted_at is null
    and moderation_status in (
      'draft', 'uploading', 'processing', 'in_review', 'changes_requested', 'approved'
    );

create index if not exists provider_intro_videos_moderation_queue
  on public.provider_intro_videos(moderation_status, submitted_at)
  where deleted_at is null;

create index if not exists provider_intro_videos_expiry_queue
  on public.provider_intro_videos(expires_at)
  where moderation_status = 'published' and expires_at is not null and deleted_at is null;

alter table public.provider_intro_videos enable row level security;

drop policy if exists "Providers read own intro videos" on public.provider_intro_videos;
drop policy if exists "Staff read intro videos" on public.provider_intro_videos;

revoke all on public.provider_intro_videos from anon, authenticated;
grant select on public.provider_intro_videos to authenticated;
grant all on public.provider_intro_videos to service_role;

create policy "Providers read own intro videos"
  on public.provider_intro_videos
  for select
  to authenticated
  using (
    provider_user_id = auth.uid()
    and public.has_role(auth.uid(), 'provider')
  );

create policy "Staff read intro videos"
  on public.provider_intro_videos
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'support')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

-- No direct INSERT/UPDATE/DELETE grants or policies.
-- Exact transitions and replacement integrity must be enforced by fixed-search-path
-- SECURITY DEFINER RPCs or service-role Edge Functions.
--
-- Every RPC must:
--   * declare SECURITY DEFINER;
--   * SET search_path = public, auth, storage;
--   * REVOKE EXECUTE FROM PUBLIC;
--   * GRANT EXECUTE only to the exact required role;
--   * validate auth.uid() and application role;
--   * reject client-supplied paths and technical metadata;
--   * avoid dynamic SQL;
--   * write immutable audit events;
--   * fail closed on missing ownership, identity, visibility or consent.

-- Replacement publish transaction must verify:
--   * old/new provider_user_id are identical;
--   * neither link is self-referential;
--   * no replacement cycle exists;
--   * replaces_video_id/replaced_by_id are reciprocal;
--   * immutable final object and checksum were verified before approval/publication.

-- Storage/database saga:
--   1. signed upload to server-owned incoming path, upsert=false;
--   2. isolated media worker validates/transcodes/strips metadata;
--   3. worker writes immutable final asset and checksum;
--   4. server verifies final object;
--   5. database-only publish transaction archives old row and publishes new row;
--   6. cleanup worker removes orphaned objects after failures.

-- Public exposure is intentionally not implemented as an anon-readable view.
-- Extend the existing public provider profile RPC and require provider visibility,
-- published state, active consent, identity verification and safe slug-only output.

-- Required follow-up before promotion:
--   1. confirm consent_ledger FK and active-consent predicate;
--   2. add updated_at trigger;
--   3. implement fixed-search-path state-machine RPCs;
--   4. implement media-worker callback authentication and checksum verification;
--   5. implement replacement-cycle/same-provider validation;
--   6. integrate admin_audit_log, deletion requests and legal holds;
--   7. add rate limiting and enumeration-safe playback responses;
--   8. add isolated staging RLS/storage/state-machine/saga regression.

rollback;
