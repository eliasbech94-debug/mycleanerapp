-- Trust Engine Phase 1B: v6 inert schema and RPC contract proposal.
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

create table public.provider_intro_video_consent_versions (
  policy_version text primary key,
  active boolean not null default true,
  effective_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint provider_intro_video_consent_version_window check (
    retired_at is null or retired_at > effective_at
  )
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

-- Persistent object registry deliberately survives provider/video deletion.
-- original_video_id never changes and is used for path validation after video_id becomes null.
create table public.provider_intro_video_objects (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null,
  original_video_id uuid not null,
  video_id uuid references public.provider_intro_videos(id) on delete set null,
  bucket_id text not null default 'provider-intro-videos' check (bucket_id = 'provider-intro-videos'),
  kind public.provider_intro_video_object_kind not null,
  storage_path text not null,
  sha256 text,
  byte_length bigint check (byte_length is null or byte_length > 0),
  storage_version text,
  verified_at timestamptz,
  immutable boolean not null default false,
  cleanup_status text not null default 'retained'
    check (cleanup_status in ('retained','scheduled','held','deleted','failed')),
  cleanup_after timestamptz,
  legal_hold_id uuid references public.legal_holds(id) on delete restrict,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, storage_path),
  constraint provider_intro_video_object_sha check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint provider_intro_video_object_owner_path check (
    storage_path like provider_user_id::text || '/' || original_video_id::text || '/%'
  ),
  constraint provider_intro_video_incoming_path check (
    kind <> 'incoming' or storage_path ~ (
      '^' || provider_user_id::text || '/' || original_video_id::text || '/incoming/[0-9a-f-]{36}\\.(mp4|webm|mov)$'
    )
  ),
  constraint provider_intro_video_final_video_binding check (
    kind <> 'final_video' or (
      sha256 is not null and immutable
      and storage_path = provider_user_id::text || '/' || original_video_id::text || '/final/' || sha256 || '.mp4'
    )
  ),
  constraint provider_intro_video_thumbnail_binding check (
    kind <> 'thumbnail' or (
      sha256 is not null and immutable
      and storage_path = provider_user_id::text || '/' || original_video_id::text || '/thumbnail/' || sha256 || '.jpg'
    )
  ),
  constraint provider_intro_video_captions_binding check (
    kind <> 'captions' or (
      sha256 is not null and immutable
      and storage_path = provider_user_id::text || '/' || original_video_id::text || '/captions/' || sha256 || '.vtt'
    )
  ),
  constraint provider_intro_video_cleanup_contract check (
    (cleanup_status='scheduled' and cleanup_after is not null and legal_hold_id is null)
    or (cleanup_status='held' and legal_hold_id is not null)
    or (cleanup_status not in ('scheduled','held'))
  )
);

create index provider_intro_video_objects_cleanup_queue
  on public.provider_intro_video_objects(cleanup_status, cleanup_after)
  where cleanup_status in ('scheduled','failed');

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
  constraint provider_intro_video_job_retry check (
    (status='retry_wait' and next_attempt_at is not null and next_attempt_at > updated_at)
    or (status<>'retry_wait' and next_attempt_at is null)
  ),
  constraint provider_intro_video_job_lease check (
    (status in ('leased','processing') and locked_by is not null and lease_token is not null
      and lease_expires_at is not null and heartbeat_at is not null and lease_expires_at > heartbeat_at)
    or (status not in ('leased','processing') and locked_by is null and lease_token is null
      and lease_expires_at is null and heartbeat_at is null)
  ),
  constraint provider_intro_video_job_dead_letter check (
    status <> 'dead_letter' or (
      last_error_code is not null and dead_lettered_at is not null
      and attempt_count = max_attempts and next_attempt_at is null
    )
  ),
  constraint provider_intro_video_job_ready check (
    status <> 'ready_to_publish' or (publish_pending_at is not null and next_attempt_at is null)
  ),
  constraint provider_intro_video_job_completed check (
    status <> 'completed' or (completed_at is not null and publish_pending_at is not null)
  )
);

create unique index provider_intro_video_jobs_one_active
  on public.provider_intro_video_jobs(video_id)
  where status in ('queued','leased','processing','retry_wait','ready_to_publish');
create unique index provider_intro_video_jobs_lease_token_unique
  on public.provider_intro_video_jobs(lease_token) where lease_token is not null;
create index provider_intro_video_jobs_claim_queue
  on public.provider_intro_video_jobs(status, next_attempt_at, created_at)
  where status in ('queued','retry_wait');
create index provider_intro_video_jobs_ready
  on public.provider_intro_video_jobs(publish_pending_at)
  where status='ready_to_publish';
create index provider_intro_video_jobs_expired_leases
  on public.provider_intro_video_jobs(lease_expires_at)
  where status in ('leased','processing');

create table public.provider_intro_video_callback_nonces (
  nonce_digest text primary key check (nonce_digest ~ '^[a-f0-9]{64}$'),
  key_id text not null,
  job_id uuid not null references public.provider_intro_video_jobs(id) on delete cascade,
  callback_timestamp timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint provider_intro_video_nonce_window check (
    callback_timestamp between created_at - interval '5 minutes' and created_at + interval '5 minutes'
    and expires_at > callback_timestamp
    and expires_at <= callback_timestamp + interval '15 minutes'
  )
);
create index provider_intro_video_callback_nonces_expiry
  on public.provider_intro_video_callback_nonces(expires_at);

create table public.provider_intro_video_callback_results (
  idempotency_key text primary key,
  key_id text not null,
  job_id uuid not null references public.provider_intro_video_jobs(id) on delete restrict,
  request_body_sha256 text not null check (request_body_sha256 ~ '^[a-f0-9]{64}$'),
  response_status integer not null check (response_status between 100 and 599),
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  unique (idempotency_key, key_id, job_id, request_body_sha256)
);

create or replace function public.provider_intro_video_has_active_consent(
  _provider_user_id uuid,
  _consent_ledger_id uuid
) returns boolean
language sql stable
set search_path=public,pg_temp
as $$
  select exists (
    select 1
    from public.consent_ledger c
    join public.provider_intro_video_consent_versions v
      on v.policy_version=c.policy_version and v.active=true
    where c.id=_consent_ledger_id
      and c.user_id=_provider_user_id
      and c.consent_type='provider_intro_video_publication'
      and c.granted=true
      and c.id=(
        select c2.id from public.consent_ledger c2
        where c2.user_id=_provider_user_id
          and c2.consent_type='provider_intro_video_publication'
        order by c2.created_at desc, c2.id desc limit 1
      )
  );
$$;

create or replace function public.provider_intro_video_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare linked_provider uuid;
begin
  if tg_op='UPDATE' and new.provider_user_id is distinct from old.provider_user_id then
    raise exception 'provider_user_id is immutable';
  end if;

  if new.final_object_id is not null then
    select o.provider_user_id into linked_provider
    from public.provider_intro_video_objects o
    where o.id=new.final_object_id and o.kind='final_video';
    if linked_provider is distinct from new.provider_user_id then
      raise exception 'final object owner mismatch';
    end if;
  end if;

  if new.replaces_video_id is not null and not exists (
    select 1 from public.provider_intro_videos p
    where p.id=new.replaces_video_id and p.provider_user_id=new.provider_user_id
  ) then raise exception 'replacement provider mismatch'; end if;

  if new.moderation_status='published' and not public.provider_intro_video_has_active_consent(
    new.provider_user_id,new.consent_ledger_id
  ) then raise exception 'active provider intro video consent required'; end if;

  return new;
end $$;

create trigger trg_provider_intro_video_guard
before insert or update on public.provider_intro_videos
for each row execute function public.provider_intro_video_guard();

create or replace function public.provider_intro_video_job_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare owner_id uuid; video_status public.provider_intro_video_status; video_pending timestamptz;
begin
  select v.provider_user_id,v.moderation_status,v.publish_pending_at
    into owner_id,video_status,video_pending
  from public.provider_intro_videos v where v.id=new.video_id;
  if owner_id is distinct from new.provider_user_id then raise exception 'job/video owner mismatch'; end if;
  if tg_op='UPDATE' and new.provider_user_id is distinct from old.provider_user_id then
    raise exception 'provider_user_id is immutable';
  end if;
  if new.status='ready_to_publish' and video_pending is distinct from new.publish_pending_at then
    raise exception 'job/video publish_pending_at mismatch';
  end if;
  if new.status='completed' and video_status<>'published' then
    raise exception 'completed publish job requires published video';
  end if;
  return new;
end $$;

create trigger trg_provider_intro_video_job_guard
before insert or update on public.provider_intro_video_jobs
for each row execute function public.provider_intro_video_job_guard();

-- Transactional replacement publication. The predecessor is locked and archived before
-- the candidate becomes published, so the one-published unique index is never violated.
create or replace function public.provider_intro_video_publish_proposed(
  _candidate_id uuid,
  _expected_job_id uuid
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare candidate public.provider_intro_videos%rowtype; predecessor public.provider_intro_videos%rowtype;
begin
  select * into candidate from public.provider_intro_videos where id=_candidate_id for update;
  if candidate.moderation_status<>'approved' then raise exception 'candidate not approved'; end if;
  if not public.provider_intro_video_has_active_consent(candidate.provider_user_id,candidate.consent_ledger_id) then
    raise exception 'active consent required';
  end if;
  if candidate.replaces_video_id is not null then
    select * into predecessor from public.provider_intro_videos
      where id=candidate.replaces_video_id for update;
    if predecessor.provider_user_id<>candidate.provider_user_id or predecessor.moderation_status<>'published' then
      raise exception 'invalid published predecessor';
    end if;
    if predecessor.replaced_by_id is not null and predecessor.replaced_by_id<>candidate.id then
      raise exception 'predecessor already has successor';
    end if;
    if exists (
      with recursive chain(id,depth,visited) as (
        select candidate.id,0,array[candidate.id]
        union all
        select v.replaces_video_id,c.depth+1,c.visited||v.replaces_video_id
        from chain c join public.provider_intro_videos v on v.id=c.id
        where v.replaces_video_id is not null and c.depth<32
          and not v.replaces_video_id=any(c.visited)
      ) select 1 from chain where id=predecessor.id and depth>0
    ) then raise exception 'replacement cycle'; end if;

    update public.provider_intro_videos
      set moderation_status='archived',unpublished_at=now(),replaced_by_id=candidate.id
      where id=predecessor.id;
  end if;

  update public.provider_intro_videos
    set moderation_status='published',published_at=now(),unpublished_at=null
    where id=candidate.id;
  update public.provider_intro_video_jobs
    set status='completed',completed_at=now(),locked_by=null,lease_token=null,
        lease_expires_at=null,heartbeat_at=null,next_attempt_at=null
    where id=_expected_job_id and video_id=candidate.id and status='ready_to_publish';
  if not found then raise exception 'matching ready job required'; end if;
  return candidate.id;
end $$;
revoke execute on function public.provider_intro_video_publish_proposed(uuid,uuid) from public;
grant execute on function public.provider_intro_video_publish_proposed(uuid,uuid) to service_role;

create or replace function public.provider_intro_video_consent_revoke_unpublish()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.consent_type='provider_intro_video_publication' and new.granted=false then
    update public.provider_intro_videos
      set moderation_status='archived',unpublished_at=now()
      where provider_user_id=new.user_id and moderation_status='published';
    update public.provider_intro_video_objects o
      set cleanup_status=case when o.legal_hold_id is null then 'scheduled' else 'held' end,
          cleanup_after=case when o.legal_hold_id is null then now()+interval '30 days' else null end
      where o.provider_user_id=new.user_id and o.deleted_at is null;
  end if;
  return new;
end $$;
create trigger trg_provider_intro_video_consent_revoke
  after insert on public.consent_ledger
  for each row execute function public.provider_intro_video_consent_revoke_unpublish();

create or replace function public.provider_intro_video_dead_letter_release()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='dead_letter' and old.status is distinct from 'dead_letter' then
    update public.provider_intro_videos
      set moderation_status='failed',technical_failure_code=new.last_error_code,
          publish_pending_at=null,candidate_expires_at=now()
      where id=new.video_id and moderation_status in ('draft','uploading','processing','approved');
  end if;
  return new;
end $$;
create trigger trg_provider_intro_video_dead_letter_release
  after update of status on public.provider_intro_video_jobs
  for each row execute function public.provider_intro_video_dead_letter_release();

create trigger trg_provider_intro_videos_updated before update on public.provider_intro_videos
for each row execute function public.update_updated_at_column();
create trigger trg_provider_intro_video_objects_updated before update on public.provider_intro_video_objects
for each row execute function public.update_updated_at_column();
create trigger trg_provider_intro_video_jobs_updated before update on public.provider_intro_video_jobs
for each row execute function public.update_updated_at_column();

alter table public.provider_intro_videos enable row level security;
alter table public.provider_intro_video_jobs enable row level security;
alter table public.provider_intro_video_objects enable row level security;
alter table public.provider_intro_video_callback_nonces enable row level security;
alter table public.provider_intro_video_callback_results enable row level security;
alter table public.provider_intro_video_consent_versions enable row level security;

create or replace view public.provider_intro_videos_provider_safe
with (security_invoker=true, security_barrier=true) as
select id, moderation_status, technical_failure_code, submitted_at, reviewed_at,
       approved_at, published_at, unpublished_at, candidate_expires_at, expires_at,
       created_at, updated_at
from public.provider_intro_videos
where provider_user_id=auth.uid() and public.has_role(auth.uid(),'provider');

create or replace view public.provider_intro_videos_support_safe
with (security_invoker=true, security_barrier=true) as
select v.id,v.provider_user_id,v.moderation_status,v.technical_failure_code,
       j.status as job_status,j.attempt_count,j.max_attempts,j.next_attempt_at,
       j.processing_deadline_at,j.last_error_code,j.last_error_at
from public.provider_intro_videos v
left join public.provider_intro_video_jobs j on j.video_id=v.id
  and j.status in ('queued','leased','processing','retry_wait','ready_to_publish','dead_letter')
where public.has_role(auth.uid(),'support')
   or public.has_role(auth.uid(),'admin')
   or public.has_role(auth.uid(),'super_admin');

revoke all on public.provider_intro_videos,public.provider_intro_video_jobs,
  public.provider_intro_video_objects,public.provider_intro_video_callback_nonces,
  public.provider_intro_video_callback_results,public.provider_intro_video_consent_versions
  from anon,authenticated;
grant select on public.provider_intro_videos_provider_safe to authenticated;
grant select on public.provider_intro_videos_support_safe to authenticated;
grant all on all tables in schema public to service_role;

insert into public.data_retention_policies
  (record_type,description,retention_days,action,respects_legal_hold)
values
  ('provider_intro_video_quarantine','Abandoned or failed quarantine uploads',1,'delete',true),
  ('provider_intro_video_rejected_final','Rejected or failed processed intro videos',30,'delete',true),
  ('provider_intro_video_archived_final','Archived or replaced intro videos',90,'delete',true),
  ('provider_intro_video_expired_final','Expired intro videos',30,'delete',true)
on conflict (record_type) do nothing;

-- Soft-delete is the only application deletion operation. Physical video/provider deletion
-- is allowed only after jobs are terminal and object registry rows have been scheduled or held.
-- Callback verification must atomically insert nonce + result and reject an existing
-- idempotency key when key_id/job_id/body hash differ.
-- Claim/heartbeat/requeue RPCs must use FOR UPDATE SKIP LOCKED and current lease_token checks.
-- Every definer function must also be documented in docs/security/DEFINER_FUNCTIONS.md
-- in the eventual migration.

rollback;
