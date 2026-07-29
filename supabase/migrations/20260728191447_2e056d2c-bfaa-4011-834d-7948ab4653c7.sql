-- =====================================================================
-- CAREER IDENTITY — PHASE 2: EVIDENCE & VERIFICATION
-- =====================================================================

-- 1. Extend verification status vocabulary --------------------------------

alter table public.cleaner_work_history
  drop constraint if exists cleaner_work_history_verification_status_check;
alter table public.cleaner_work_history
  add constraint cleaner_work_history_verification_status_check
  check (verification_status in (
    'self_reported','pending','under_review','more_information_required',
    'verified','rejected','expired'
  ));

alter table public.cleaner_certifications
  drop constraint if exists cleaner_certifications_verification_status_check;
alter table public.cleaner_certifications
  add constraint cleaner_certifications_verification_status_check
  check (verification_status in (
    'self_reported','pending','under_review','more_information_required',
    'verified','rejected','expired'
  ));

-- 2. Document metadata table ----------------------------------------------

create table if not exists public.career_evidence_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_history_id uuid references public.cleaner_work_history(id) on delete cascade,
  certification_id uuid references public.cleaner_certifications(id) on delete cascade,
  storage_path text not null unique,
  original_filename text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10 * 1024 * 1024),
  evidence_type text not null check (evidence_type in ('work_history','certification')),
  status text not null default 'pending' check (status in (
    'pending','under_review','more_information_required','verified','rejected','expired'
  )),
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_evidence_target_exactly_one check (
    (work_history_id is not null)::int + (certification_id is not null)::int = 1
  ),
  constraint career_evidence_type_matches check (
    (evidence_type = 'work_history' and work_history_id is not null)
    or (evidence_type = 'certification' and certification_id is not null)
  ),
  constraint career_evidence_mime_allowed check (
    mime_type in ('application/pdf','image/jpeg','image/png','image/webp')
  )
);

grant select, insert, update, delete on public.career_evidence_documents to authenticated;
grant all on public.career_evidence_documents to service_role;

create index if not exists career_evidence_documents_user_idx
  on public.career_evidence_documents(user_id);
create index if not exists career_evidence_documents_work_idx
  on public.career_evidence_documents(work_history_id);
create index if not exists career_evidence_documents_cert_idx
  on public.career_evidence_documents(certification_id);
create index if not exists career_evidence_documents_status_idx
  on public.career_evidence_documents(status);

drop trigger if exists career_evidence_documents_set_updated_at
  on public.career_evidence_documents;
create trigger career_evidence_documents_set_updated_at
before update on public.career_evidence_documents
for each row execute function public._career_touch_updated_at();

alter table public.career_evidence_documents enable row level security;

-- Owner reads own document metadata
create policy career_evidence_owner_select
on public.career_evidence_documents for select
to authenticated
using (user_id = auth.uid());

-- Owner inserts only their own rows AND row must belong to a career record they own
create policy career_evidence_owner_insert
on public.career_evidence_documents for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    (work_history_id is not null and exists (
      select 1 from public.cleaner_work_history wh
      join public.cleaner_career_profiles p on p.id = wh.career_profile_id
      where wh.id = work_history_id and p.user_id = auth.uid()
    ))
    or (certification_id is not null and exists (
      select 1 from public.cleaner_certifications c
      join public.cleaner_career_profiles p on p.id = c.career_profile_id
      where c.id = certification_id and p.user_id = auth.uid()
    ))
  )
);

-- Owner may delete own documents only while not verified (row trigger enforces column safety)
create policy career_evidence_owner_delete
on public.career_evidence_documents for delete
to authenticated
using (
  user_id = auth.uid()
  and status not in ('verified','under_review')
);

-- Admin full read, admin update, support read only
create policy career_evidence_admin_read
on public.career_evidence_documents for select
to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'support'));

create policy career_evidence_admin_update
on public.career_evidence_documents for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- 3. Trigger: provider cannot change protected columns --------------------

create or replace function public._career_evidence_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  is_admin boolean := public.has_role(actor, 'admin');
begin
  if tg_op = 'UPDATE' then
    if not is_admin then
      -- Providers may not touch review/status columns
      if new.status is distinct from old.status
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at
         or new.rejection_reason is distinct from old.rejection_reason
         or new.storage_path is distinct from old.storage_path
         or new.user_id is distinct from old.user_id
         or new.work_history_id is distinct from old.work_history_id
         or new.certification_id is distinct from old.certification_id
         or new.size_bytes is distinct from old.size_bytes
         or new.mime_type is distinct from old.mime_type then
        raise exception 'evidence_owner_cannot_modify_protected_columns';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    if not is_admin and old.status in ('verified','under_review') then
      raise exception 'verified_evidence_cannot_be_deleted';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists career_evidence_guard on public.career_evidence_documents;
create trigger career_evidence_guard
before update or delete on public.career_evidence_documents
for each row execute function public._career_evidence_guard();

-- 4. Provider cannot self-verify work history / certifications ------------

create or replace function public._career_record_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  is_admin boolean := public.has_role(actor, 'admin');
begin
  if tg_op = 'UPDATE' and not is_admin then
    if new.verification_status is distinct from old.verification_status
       and new.verification_status in ('verified','under_review','rejected','more_information_required') then
      raise exception 'provider_cannot_change_verification_status';
    end if;
    if new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by then
      raise exception 'provider_cannot_change_reviewer_fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cleaner_work_history_owner_guard on public.cleaner_work_history;
create trigger cleaner_work_history_owner_guard
before update on public.cleaner_work_history
for each row execute function public._career_record_owner_guard();

drop trigger if exists cleaner_certifications_owner_guard on public.cleaner_certifications;
create trigger cleaner_certifications_owner_guard
before update on public.cleaner_certifications
for each row execute function public._career_record_owner_guard();

-- 5. Audit log ------------------------------------------------------------

create table if not exists public.career_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);

grant select on public.career_audit_log to authenticated;
grant all on public.career_audit_log to service_role;

create index if not exists career_audit_log_entity_idx
  on public.career_audit_log(entity_type, entity_id);
create index if not exists career_audit_log_actor_idx
  on public.career_audit_log(actor_user_id);

alter table public.career_audit_log enable row level security;

-- Only admin/support see audit log; providers must NEVER read
create policy career_audit_log_staff_read
on public.career_audit_log for select
to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'support'));

-- Immutable: no updates, no deletes from any authenticated role (service_role bypasses RLS)
create policy career_audit_log_no_update
on public.career_audit_log for update
to authenticated
using (false)
with check (false);

create policy career_audit_log_no_delete
on public.career_audit_log for delete
to authenticated
using (false);

-- 6. Storage RLS on storage.objects for `career-evidence` bucket ----------

-- Path convention: {user_id}/{evidence_type}/{record_id}/{uuid}.{ext}
-- storage.foldername(name) returns an array; index 1 = user_id.

drop policy if exists career_evidence_storage_owner_read on storage.objects;
create policy career_evidence_storage_owner_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'career-evidence'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists career_evidence_storage_owner_insert on storage.objects;
create policy career_evidence_storage_owner_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'career-evidence'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists career_evidence_storage_owner_delete on storage.objects;
create policy career_evidence_storage_owner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'career-evidence'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists career_evidence_storage_admin_read on storage.objects;
create policy career_evidence_storage_admin_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'career-evidence'
  and public.has_role(auth.uid(), 'admin')
);

-- (Support intentionally has no direct storage.objects access — signed URL
--  path in edge function will only issue for admin.)

comment on table public.career_evidence_documents is
  'Private evidence uploads for MyCleaner Career verification. storage_path is never exposed to public views.';
comment on table public.career_audit_log is
  'Append-only audit trail for career verification actions. Providers must not read.';
