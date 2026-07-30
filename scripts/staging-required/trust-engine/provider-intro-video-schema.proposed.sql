-- Trust Engine Phase 1B: v4 inert schema proposal.
-- Review only. Intentionally outside supabase/migrations.
-- Never run against production. Always rolls back.

begin;

do $$
begin
  create type public.provider_intro_video_status as enum (
    'draft','uploading','processing','in_review','changes_requested',
    'approved','published','rejected','failed','archived','expired'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.provider_intro_video_job_status as enum (
    'created','uploading','queued','processing','ready_to_publish',
    'publishing','completed','retry_wait','dead_letter','cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.provider_intro_videos (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references public.provider_profiles(user_id) on delete cascade,

  incoming_storage_path text unique,
  final_storage_path text unique,
  final_object_checksum text,
  final_object_verified_at timestamptz,
  thumbnail_storage_path text,
  captions_storage_path text,

  duration_seconds integer check (duration_seconds between 1 and 60),
  content_type text check (content_type in ('video/mp4','video/webm')),
  upload_content_type text check (upload_content_type in ('video/mp4','video/webm','video/quicktime')),
  file_size_bytes bigint check (file_size_bytes between 51200 and 26214400),
  width_pixels integer check (width_pixels is null or width_pixels between 1 and 1920),
  height_pixels integer check (height_pixels is null or height_pixels between 1 and 1920),
  pixel_count bigint generated always as (
    case when width_pixels is null or height_pixels is null then null
         else width_pixels::bigint * height_pixels::bigint end
  ) stored,
  has_audio boolean,
  frame_count bigint check (frame_count is null or frame_count > 0),
  language text,
  transcript text,
  recorded_in_mycleaner boolean not null default true,

  moderation_status public.provider_intro_video_status not null default 'draft',
  moderation_reason text,
  technical_failure_code text,

  candidate_expires_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  publish_pending_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  expires_at timestamptz,
  consent_ledger_id uuid references public.consent_ledger(id) on delete restrict,

  replaces_video_id uuid references public.provider_intro_videos(id) on delete set null,
  replaced_by_id uuid references public.provider_intro_videos(id) on delete set null,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint provider_intro_videos_checksum_format check (
    final_object_checksum is null or final_object_checksum ~ '^[a-f0-9]{64}$'
  ),
  constraint provider_intro_videos_pixel_limit check (
    pixel_count is null or pixel_count <= 2073600
  ),
  constraint provider_intro_videos_submission_state check (
    moderation_status not in ('in_review','changes_requested','approved','published','rejected')
    or submitted_at is not null
  ),
  constraint provider_intro_videos_review_state check (
    moderation_status not in ('approved','published','rejected','changes_requested')
    or (reviewed_at is not null and reviewed_by is not null)
  ),
  constraint provider_intro_videos_approved_state check (
    moderation_status not in ('approved','published')
    or (
      approved_at is not null
      and final_storage_path is not null
      and final_object_checksum is not null
      and final_object_verified_at is not null
      and final_storage_path like '%/' || final_object_checksum || '.mp4'
      and duration_seconds is not null
      and file_size_bytes is not null
      and pixel_count is not null
      and has_audio is true
      and frame_count is not null
    )
  ),
  constraint provider_intro_videos_published_state check (
    moderation_status <> 'published'
    or (
      published_at is not null
      and approved_at is not null
      and final_object_verified_at is not null
      and consent_ledger_id is not null
      and deleted_at is null
      and unpublished_at is null
    )
  ),
  constraint provider_intro_videos_rejection_reason check (
    moderation_status not in ('rejected','changes_requested')
    or nullif(btrim(moderation_reason),'') is not null
  ),
  constraint provider_intro_videos_failed_reason check (
    moderation_status <> 'failed'
    or nullif(btrim(technical_failure_code),'') is not null
  ),
  constraint provider_intro_videos_final_asset_state check (
    final_storage_path is null
    or moderation_status in ('in_review','changes_requested','approved','published','rejected','archived','expired')
  ),
  constraint provider_intro_videos_replacement_not_self check (
    replaces_video_id is null or replaces_video_id <> id
  ),
  constraint provider_intro_videos_replaced_by_not_self check (
    replaced_by_id is null or replaced_by_id <> id
  )
);

create unique index if not exists provider_intro_videos_one_published_per_provider
  on public.provider_intro_videos(provider_user_id)
  where moderation_status = 'published' and deleted_at is null;

create unique index if not exists provider_intro_videos_one_candidate_per_provider
  on public.provider_intro_videos(provider_user_id)
  where deleted_at is null
    and moderation_status in ('draft','uploading','processing','in_review','changes_requested','approved');

create unique index if not exists provider_intro_videos_unique_predecessor
  on public.provider_intro_videos(replaces_video_id)
  where replaces_video_id is not null;

create unique index if not exists provider_intro_videos_unique_successor
  on public.provider_intro_videos(replaced_by_id)
  where replaced_by_id is not null;

create index if not exists provider_intro_videos_candidate_expiry_queue
  on public.provider_intro_videos(candidate_expires_at)
  where moderation_status in ('draft','uploading','processing') and deleted_at is null;

create table if not exists public.provider_intro_video_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null unique references public.provider_intro_videos(id) on delete cascade,
  provider_user_id uuid not null references public.provider_profiles(user_id) on delete cascade,
  idempotency_key uuid not null unique default gen_random_uuid(),
  worker_job_id text unique,
  status public.provider_intro_video_job_status not null default 'created',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz,
  processing_deadline_at timestamptz,
  callback_nonce_digest text,
  callback_received_at timestamptz,
  final_object_verified_at timestamptz,
  publish_pending_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_intro_video_jobs_nonce_digest_format check (
    callback_nonce_digest is null or callback_nonce_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint provider_intro_video_jobs_ready_state check (
    status <> 'ready_to_publish'
    or (final_object_verified_at is not null and publish_pending_at is not null)
  ),
  constraint provider_intro_video_jobs_completed_state check (
    status <> 'completed' or completed_at is not null
  )
);

create index if not exists provider_intro_video_jobs_retry_queue
  on public.provider_intro_video_jobs(next_attempt_at)
  where status = 'retry_wait';

create index if not exists provider_intro_video_jobs_processing_timeout
  on public.provider_intro_video_jobs(processing_deadline_at)
  where status = 'processing';

create or replace function public.provider_intro_video_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  predecessor public.provider_intro_videos%rowtype;
  successor public.provider_intro_videos%rowtype;
  cycle_exists boolean;
begin
  if tg_op = 'UPDATE' then
    if old.provider_user_id <> new.provider_user_id then
      raise exception 'provider_user_id is immutable';
    end if;
    if old.final_storage_path is not null and new.final_storage_path is distinct from old.final_storage_path then
      raise exception 'final_storage_path is immutable once set';
    end if;
    if old.final_object_checksum is not null and new.final_object_checksum is distinct from old.final_object_checksum then
      raise exception 'final_object_checksum is immutable once set';
    end if;
    if old.published_at is not null and new.published_at is distinct from old.published_at then
      raise exception 'published_at is immutable once set';
    end if;
  end if;

  if new.replaces_video_id is not null then
    select * into predecessor from public.provider_intro_videos where id = new.replaces_video_id for update;
    if not found or predecessor.provider_user_id <> new.provider_user_id then
      raise exception 'replacement predecessor must belong to same provider';
    end if;
    if predecessor.replaced_by_id is not null and predecessor.replaced_by_id <> new.id then
      raise exception 'replacement fork is not allowed';
    end if;
    with recursive chain(id, next_id) as (
      select new.replaces_video_id, predecessor.replaces_video_id
      union all
      select v.id, v.replaces_video_id
      from public.provider_intro_videos v
      join chain c on v.id = c.next_id
      where c.next_id is not null
    )
    select exists(select 1 from chain where id = new.id) into cycle_exists;
    if cycle_exists then raise exception 'replacement cycle is not allowed'; end if;
  end if;

  if new.replaced_by_id is not null then
    select * into successor from public.provider_intro_videos where id = new.replaced_by_id;
    if found and successor.provider_user_id <> new.provider_user_id then
      raise exception 'replacement successor must belong to same provider';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_provider_intro_video_guard
  before insert or update on public.provider_intro_videos
  for each row execute function public.provider_intro_video_guard();

create trigger trg_provider_intro_videos_updated
  before update on public.provider_intro_videos
  for each row execute function public.update_updated_at_column();

create trigger trg_provider_intro_video_jobs_updated
  before update on public.provider_intro_video_jobs
  for each row execute function public.update_updated_at_column();

alter table public.provider_intro_videos enable row level security;
alter table public.provider_intro_video_jobs enable row level security;

revoke all on public.provider_intro_videos from anon, authenticated;
revoke all on public.provider_intro_video_jobs from anon, authenticated;
grant select on public.provider_intro_videos to authenticated;
grant select on public.provider_intro_video_jobs to authenticated;
grant all on public.provider_intro_videos to service_role;
grant all on public.provider_intro_video_jobs to service_role;

create policy "Providers read own intro videos"
  on public.provider_intro_videos for select to authenticated
  using (provider_user_id = auth.uid() and public.has_role(auth.uid(),'provider'));

create policy "Providers read own intro video jobs"
  on public.provider_intro_video_jobs for select to authenticated
  using (provider_user_id = auth.uid() and public.has_role(auth.uid(),'provider'));

create policy "Staff read intro videos"
  on public.provider_intro_videos for select to authenticated
  using (
    public.has_role(auth.uid(),'support')
    or public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'super_admin')
  );

create policy "Staff read intro video jobs"
  on public.provider_intro_video_jobs for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'super_admin')
  );

-- Promotion requirements not implemented by this inert proposal:
-- 1. Add provider_intro_video_publication to consent_ledger consent_type safely.
-- 2. Implement active-consent predicate as latest append-only ledger row, granted=true,
--    accepted policy version, same provider, and no newer revoke row.
-- 3. Add consent INSERT trigger/event to unpublish immediately on newest granted=false row.
-- 4. Implement SECURITY DEFINER RPCs with SET search_path = public, pg_temp,
--    fully-qualified auth/storage references, exact grants and row locks.
-- 5. Implement HMAC-SHA256 callback verification, timestamp/nonce replay protection,
--    idempotent callback result and worker job/video/provider binding.
-- 6. Implement deterministic retention policies and reconciliation/cleanup workers.
-- 7. Restrict support-facing reads through a safe projection that excludes transcript and paths.
-- 8. Convert the proposed regression specification into isolated staging execution.

rollback;