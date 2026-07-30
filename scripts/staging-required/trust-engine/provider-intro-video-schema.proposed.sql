-- Trust Engine Phase 1B: inert schema proposal.
--
-- IMPORTANT:
-- - This file is intentionally outside supabase/migrations.
-- - Do not run against production.
-- - Provider identity relationship must be confirmed before promotion.
-- - Bucket creation, Edge Functions and public signed-URL delivery are not included.

begin;

create table if not exists public.provider_intro_videos (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  thumbnail_storage_path text,
  duration_seconds integer not null check (duration_seconds between 1 and 30),
  content_type text not null check (
    content_type in ('video/webm', 'video/mp4', 'video/quicktime')
  ),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 52428800),
  language text,
  transcript text,
  recorded_in_mycleaner boolean not null default true,
  moderation_status text not null default 'draft' check (
    moderation_status in (
      'draft', 'uploading', 'pending', 'approved', 'rejected', 'archived'
    )
  ),
  moderation_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_intro_videos_canonical_path check (
    storage_path = provider_user_id::text || '/' || id::text || '/original.' ||
      case content_type
        when 'video/webm' then 'webm'
        when 'video/mp4' then 'mp4'
        when 'video/quicktime' then 'mov'
      end
  ),
  constraint provider_intro_videos_review_state check (
    (moderation_status = 'approved' and approved_at is not null and reviewed_at is not null and reviewed_by is not null)
    or moderation_status <> 'approved'
  ),
  constraint provider_intro_videos_publish_state check (
    published_at is null
    or (moderation_status = 'approved' and approved_at is not null and deleted_at is null)
  )
);

create unique index if not exists provider_intro_videos_one_current_per_provider
  on public.provider_intro_videos(provider_user_id)
  where deleted_at is null and moderation_status <> 'archived';

create index if not exists provider_intro_videos_moderation_queue
  on public.provider_intro_videos(moderation_status, submitted_at)
  where deleted_at is null;

alter table public.provider_intro_videos enable row level security;

revoke all on public.provider_intro_videos from anon, authenticated;
grant select, insert, update, delete on public.provider_intro_videos to authenticated;
grant all on public.provider_intro_videos to service_role;

-- Providers may read their own rows, including draft and moderation feedback.
create policy "Providers read own intro videos"
  on public.provider_intro_videos
  for select
  to authenticated
  using (provider_user_id = auth.uid());

-- Privileged staff may read the moderation queue.
create policy "Staff read intro videos"
  on public.provider_intro_videos
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'support')
  );

-- Providers may create only draft/uploading rows owned by themselves.
create policy "Providers create own intro video drafts"
  on public.provider_intro_videos
  for insert
  to authenticated
  with check (
    provider_user_id = auth.uid()
    and moderation_status in ('draft', 'uploading')
    and reviewed_by is null
    and reviewed_at is null
    and approved_at is null
    and published_at is null
    and deleted_at is null
  );

-- Direct client updates are deliberately narrow. Status transitions to pending,
-- approval/rejection and publish timestamps should ultimately move behind RPCs or
-- Edge Functions; this proposal blocks self-approval at the RLS boundary.
create policy "Providers update own non-approved intro videos"
  on public.provider_intro_videos
  for update
  to authenticated
  using (
    provider_user_id = auth.uid()
    and moderation_status in ('draft', 'uploading', 'pending', 'rejected')
    and approved_at is null
    and published_at is null
  )
  with check (
    provider_user_id = auth.uid()
    and moderation_status in ('draft', 'uploading', 'pending', 'rejected', 'archived')
    and reviewed_by is null
    and reviewed_at is null
    and approved_at is null
    and published_at is null
  );

create policy "Providers delete own unapproved intro videos"
  on public.provider_intro_videos
  for delete
  to authenticated
  using (
    provider_user_id = auth.uid()
    and moderation_status in ('draft', 'uploading', 'pending', 'rejected', 'archived')
    and approved_at is null
    and published_at is null
  );

-- Admin-only moderation. A dedicated RPC should additionally enforce the exact
-- state machine and immutable audit logging.
create policy "Admins moderate intro videos"
  on public.provider_intro_videos
  for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Public data surface: metadata only. No storage path, transcript or reviewer data.
-- Signed playback URLs must be generated by a server-side function after checking
-- this view; anonymous users must never receive direct storage SELECT access.
create or replace view public.public_provider_intro_videos
with (security_invoker = true)
as
select
  id,
  provider_user_id,
  duration_seconds,
  language,
  recorded_in_mycleaner,
  approved_at,
  published_at
from public.provider_intro_videos
where moderation_status = 'approved'
  and approved_at is not null
  and published_at is not null
  and deleted_at is null;

revoke all on public.public_provider_intro_videos from public;
grant select on public.public_provider_intro_videos to anon, authenticated;

-- Storage policy proposal. The private bucket must be created separately and
-- remain non-public. Keep disabled until the canonical path and provider identity
-- assumptions have passed isolated staging regression.
--
-- create policy "Providers manage own intro-video objects"
--   on storage.objects
--   for all
--   to authenticated
--   using (
--     bucket_id = 'provider-intro-videos'
--     and (storage.foldername(name))[1] = auth.uid()::text
--   )
--   with check (
--     bucket_id = 'provider-intro-videos'
--     and (storage.foldername(name))[1] = auth.uid()::text
--   );

-- Proposal verification only. Always roll back while this file remains here.
rollback;
