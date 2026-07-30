-- Trust Engine Phase 1B: v5 inert schema proposal.
-- REVIEW ONLY. Outside supabase/migrations. Never run against production.

begin;

create type public.provider_intro_video_status as enum (
  'draft','uploading','processing','in_review','changes_requested','approved',
  'published','rejected','failed','archived','expired'
);

create type public.provider_intro_video_job_status as enum (
  'queued','leased','processing','retry_wait','ready_to_publish','completed',
  'failed','dead_letter','cancelled'
);

create type public.provider_intro_video_object_kind as enum (
  'incoming','final_video','thumbnail','captions'
);

create table public.provider_intro_videos (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references public.provider_profiles(user_id) on delete restrict,
  moderation_status public.provider_intro_video_status not null default 'draft',
  moderation_reason text,
  technical_failure_code text,
  duration_seconds integer check (duration_seconds between 1 and 60),
  content_type text check (content_type is null or content_type = 'video/mp4'),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 51200 and 26214400),
  width_pixels integer check (width_pixels is null or width_pixels > 0),
  height_pixels integer check (height_pixels is null or height_pixels > 0),
  has_audio boolean,
  frame_count bigint check (frame_count is null or frame_count > 0),
  final_object_id uuid,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  publish_pending_at timestamptz,
  candidate_expires_at timestamptz,
  expires_at timestamptz,
  consent_ledger_id uuid references public.consent_ledger(id) on delete restrict,
  replaces_video_id uuid references public.provider_intro_videos(id) on delete restrict,
  replaced_by_id uuid references public.provider_intro_videos(id) on delete restrict,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_intro_video_dimensions check (
    width_pixels is null or height_pixels is null or (
      greatest(width_pixels,height_pixels) <= 1920
      and least(width_pixels,height_pixels) >= 360
      and width_pixels::bigint * height_pixels::bigint <= 2150400
    )
  ),
  constraint provider_intro_video_not_self_replaces check (replaces_video_id is null or replaces_video_id <> id),
  constraint provider_intro_video_not_self_replaced_by check (replaced_by_id is null or replaced_by_id <> id),
  constraint provider_intro_video_review_state check (
    moderation_status not in ('approved','published','rejected','changes_requested')
    or (reviewed_at is not null and reviewed_by is not null)
  ),
  constraint provider_intro_video_publish_state check (
    moderation_status <> 'published' or (
      published_at is not null and approved_at is not null and final_object_id is not null
      and consent_ledger_id is not null and deleted_at is null and unpublished_at is null
    )
  )
);

create unique index provider_intro_videos_one_published_per_provider
  on public.provider_intro_videos(provider_user_id)
  where moderation_status='published' and deleted_at is null;

create unique index provider_intro_videos_one_candidate_per_provider
  on public.provider_intro_videos(provider_user_id)
  where deleted_at is null and moderation_status in (
    'draft','uploading','processing','in_review','changes_requested','approved'
  );

create unique index provider_intro_videos_one_successor
  on public.provider_intro_videos(replaces_video_id) where replaces_video_id is not null;
create unique index provider_intro_videos_one_predecessor
  on public.provider_intro_videos(replaced_by_id) where replaced_by_id is not null;

create table public.provider_intro_video_objects (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references public.provider_profiles(user_id) on delete restrict,
  video_id uuid references public.provider_intro_videos(id) on delete set null,
  kind public.provider_intro_video_object_kind not null,
  storage_path text not null unique,
  sha256 text,
  byte_length bigint,
  storage_version text,
  verified_at timestamptz,
  immutable boolean not null default false,
  cleanup_status text not null default 'retained' check (cleanup_status in ('retained','scheduled','held','deleted','failed')),
  cleanup_after timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_intro_video_object_sha check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint provider_intro_video_object_path check (
    storage_path = provider_user_id::text || '/' || coalesce(video_id::text,'orphan') || '/' ||
      case kind
        when 'incoming' then 'incoming/'
        when 'final_video' then 'final/'
        when 'thumbnail' then 'thumbnail/'
        when 'captions' then 'captions/'
      end || split_part(storage_path,'/',4)
  ),
  constraint provider_intro_video_final_binding check (
    kind <> 'final_video' or (
      sha256 is not null and immutable and storage_path like '%/' || sha256 || '.mp4'
    )
  )
);

alter table public.provider_intro_videos
  add constraint provider_intro_video_final_object_fk
  foreign key (final_object_id) references public.provider_intro_video_objects(id) on delete restrict;

create table public.provider_intro_video_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.provider_intro_videos(id) on delete restrict,
  provider_user_id uuid not null references public.provider_profiles(user_id) on delete restrict,
  status public.provider_intro_video_job_status not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz,
  processing_deadline_at timestamptz,
  publish_pending_at timestamptz,
  locked_by text,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  worker_job_id text unique,
  last_error_code text,
  last_error_at timestamptz,
  dead_lettered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_intro_video_job_attempts check (attempt_count between 0 and max_attempts),
  constraint provider_intro_video_job_retry check (status <> 'retry_wait' or next_attempt_at is not null),
  constraint provider_intro_video_job_lease check (
    status not in ('leased','processing') or
    (locked_by is not null and lease_token is not null and lease_expires_at is not null)
  ),
  constraint provider_intro_video_job_dead_letter check (
    status <> 'dead_letter' or (last_error_code is not null and dead_lettered_at is not null)
  ),
  constraint provider_intro_video_job_ready check (
    status <> 'ready_to_publish' or publish_pending_at is not null
  )
);

create unique index provider_intro_video_jobs_one_active
  on public.provider_intro_video_jobs(video_id)
  where status in ('queued','leased','processing','retry_wait','ready_to_publish');
create index provider_intro_video_jobs_ready
  on public.provider_intro_video_jobs(publish_pending_at)
  where status='ready_to_publish';
create index provider_intro_video_jobs_retry
  on public.provider_intro_video_jobs(next_attempt_at)
  where status='retry_wait';
create index provider_intro_video_jobs_expired_leases
  on public.provider_intro_video_jobs(lease_expires_at)
  where status in ('leased','processing');

create table public.provider_intro_video_callback_nonces (
  key_id text not null,
  nonce_digest text not null check (nonce_digest ~ '^[a-f0-9]{64}$'),
  job_id uuid not null references public.provider_intro_video_jobs(id) on delete cascade,
  callback_timestamp timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (key_id, nonce_digest)
);

create table public.provider_intro_video_callback_results (
  idempotency_key text primary key,
  job_id uuid not null references public.provider_intro_video_jobs(id) on delete restrict,
  request_body_sha256 text not null check (request_body_sha256 ~ '^[a-f0-9]{64}$'),
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.provider_intro_video_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  linked_provider uuid;
  consent_user uuid;
  predecessor_status public.provider_intro_video_status;
begin
  if new.consent_ledger_id is not null then
    select c.user_id into consent_user from public.consent_ledger c where c.id=new.consent_ledger_id;
    if consent_user is distinct from new.provider_user_id then
      raise exception 'consent owner mismatch';
    end if;
  end if;

  if new.final_object_id is not null then
    select o.provider_user_id into linked_provider from public.provider_intro_video_objects o where o.id=new.final_object_id;
    if linked_provider is distinct from new.provider_user_id then
      raise exception 'final object owner mismatch';
    end if;
  end if;

  if new.replaces_video_id is not null then
    select v.provider_user_id, v.moderation_status
      into linked_provider, predecessor_status
      from public.provider_intro_videos v where v.id=new.replaces_video_id;
    if linked_provider is distinct from new.provider_user_id then raise exception 'replacement provider mismatch'; end if;
    if new.moderation_status='published' and predecessor_status <> 'published' then
      raise exception 'predecessor must be published';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_provider_intro_video_guard on public.provider_intro_videos;
create trigger trg_provider_intro_video_guard
before insert or update on public.provider_intro_videos
for each row execute function public.provider_intro_video_guard();

create or replace function public.provider_intro_video_job_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare owner_id uuid;
begin
  select v.provider_user_id into owner_id from public.provider_intro_videos v where v.id=new.video_id;
  if owner_id is distinct from new.provider_user_id then raise exception 'job/video owner mismatch'; end if;
  if new.status='completed' and not exists (
    select 1 from public.provider_intro_videos v where v.id=new.video_id and v.moderation_status='published'
  ) then raise exception 'completed publish job requires published video'; end if;
  return new;
end $$;

drop trigger if exists trg_provider_intro_video_job_guard on public.provider_intro_video_jobs;
create trigger trg_provider_intro_video_job_guard
before insert or update on public.provider_intro_video_jobs
for each row execute function public.provider_intro_video_job_guard();

drop trigger if exists trg_provider_intro_videos_updated on public.provider_intro_videos;
create trigger trg_provider_intro_videos_updated before update on public.provider_intro_videos
for each row execute function public.update_updated_at_column();
drop trigger if exists trg_provider_intro_video_objects_updated on public.provider_intro_video_objects;
create trigger trg_provider_intro_video_objects_updated before update on public.provider_intro_video_objects
for each row execute function public.update_updated_at_column();
drop trigger if exists trg_provider_intro_video_jobs_updated on public.provider_intro_video_jobs;
create trigger trg_provider_intro_video_jobs_updated before update on public.provider_intro_video_jobs
for each row execute function public.update_updated_at_column();

create or replace view public.provider_intro_videos_provider_safe as
select id, provider_user_id, moderation_status, technical_failure_code,
       submitted_at, reviewed_at, approved_at, published_at, unpublished_at,
       candidate_expires_at, expires_at, created_at, updated_at
from public.provider_intro_videos;

create or replace view public.provider_intro_videos_support_safe as
select v.id, v.provider_user_id, v.moderation_status, v.technical_failure_code,
       j.status as job_status, j.attempt_count, j.max_attempts,
       j.next_attempt_at, j.processing_deadline_at, j.last_error_code, j.last_error_at
from public.provider_intro_videos v
left join public.provider_intro_video_jobs j on j.video_id=v.id
  and j.status in ('queued','leased','processing','retry_wait','ready_to_publish','dead_letter');

revoke all on public.provider_intro_videos, public.provider_intro_video_jobs,
  public.provider_intro_video_objects, public.provider_intro_video_callback_nonces,
  public.provider_intro_video_callback_results from anon, authenticated;
grant select on public.provider_intro_videos_provider_safe to authenticated;
grant select on public.provider_intro_videos_support_safe to authenticated;
grant all on all tables in schema public to service_role;

alter table public.provider_intro_videos enable row level security;
alter table public.provider_intro_video_jobs enable row level security;
alter table public.provider_intro_video_objects enable row level security;

-- Production migration must add view-compatible RLS/security-barrier access, active-consent
-- predicate + revoke-unpublish trigger, lease claim/heartbeat/reconcile/publish RPCs,
-- replacement cycle validation (visited set + depth 32), audit integration and retention seeds.
-- Every RPC: SECURITY DEFINER, SET search_path=public,pg_temp, fully-qualified auth/storage,
-- revoke PUBLIC execute, exact grants, no dynamic SQL.

rollback;
