
-- MyCleaner Career Identity foundation (PR #32) — hardened
create extension if not exists pgcrypto;

-- 1. TABLES ------------------------------------------------------------------

create table if not exists public.cleaner_career_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  mycleaner_id text not null unique,
  professional_headline text,
  career_summary text,
  visibility text not null default 'private' check (visibility in ('private','customers','public','link_only')),
  searchable_by_name boolean not null default false,
  searchable_by_id boolean not null default true,
  share_slug text unique,
  identity_verified boolean not null default false,
  career_score numeric(5,2) not null default 0 check (career_score between 0 and 100),
  reliability_score numeric(5,2) not null default 0 check (reliability_score between 0 and 100),
  punctuality_score numeric(5,2) not null default 0 check (punctuality_score between 0 and 100),
  total_completed_jobs integer not null default 0 check (total_completed_jobs >= 0),
  total_verified_hours numeric(10,2) not null default 0 check (total_verified_hours >= 0),
  average_rating numeric(3,2) check (average_rating is null or average_rating between 0 and 5),
  no_show_rate numeric(5,2) not null default 0 check (no_show_rate between 0 and 100),
  cancellation_rate numeric(5,2) not null default 0 check (cancellation_rate between 0 and 100),
  repeat_customer_rate numeric(5,2) not null default 0 check (repeat_customer_rate between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cleaner_work_history (
  id uuid primary key default gen_random_uuid(),
  career_profile_id uuid not null references public.cleaner_career_profiles(id) on delete cascade,
  company_name text not null,
  role_title text,
  city text,
  country_code text,
  started_on date not null,
  ended_on date,
  currently_employed boolean not null default false,
  description text,
  verification_status text not null default 'self_reported' check (verification_status in ('self_reported','pending','verified','rejected','expired')),
  verification_method text check (verification_method is null or verification_method in ('employer','employment_contract','payslip_redacted','reference_letter','manual_review')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  evidence_storage_path text,
  evidence_review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on),
  check ((currently_employed and ended_on is null) or not currently_employed)
);

create table if not exists public.cleaner_certifications (
  id uuid primary key default gen_random_uuid(),
  career_profile_id uuid not null references public.cleaner_career_profiles(id) on delete cascade,
  certificate_name text not null,
  issuer text,
  issued_on date,
  expires_on date,
  verification_status text not null default 'self_reported' check (verification_status in ('self_reported','pending','verified','rejected','expired')),
  evidence_storage_path text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

-- 2. GRANTS (mandatory for PostgREST) ---------------------------------------

grant select, insert, update, delete on public.cleaner_career_profiles to authenticated;
grant all on public.cleaner_career_profiles to service_role;

grant select, insert, update, delete on public.cleaner_work_history to authenticated;
grant all on public.cleaner_work_history to service_role;

grant select, insert, update, delete on public.cleaner_certifications to authenticated;
grant all on public.cleaner_certifications to service_role;

-- 3. INDEXES ----------------------------------------------------------------

create index if not exists cleaner_career_profiles_user_id_idx on public.cleaner_career_profiles(user_id);
create index if not exists cleaner_career_profiles_mycleaner_id_idx on public.cleaner_career_profiles(mycleaner_id);
create index if not exists cleaner_career_profiles_share_slug_idx on public.cleaner_career_profiles(share_slug);
create index if not exists cleaner_work_history_profile_idx on public.cleaner_work_history(career_profile_id);
create index if not exists cleaner_certifications_profile_idx on public.cleaner_certifications(career_profile_id);

-- 4. TRIGGERS ---------------------------------------------------------------

create or replace function public._career_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cleaner_career_profiles_set_updated_at on public.cleaner_career_profiles;
create trigger cleaner_career_profiles_set_updated_at
before update on public.cleaner_career_profiles
for each row execute function public._career_touch_updated_at();

drop trigger if exists cleaner_work_history_set_updated_at on public.cleaner_work_history;
create trigger cleaner_work_history_set_updated_at
before update on public.cleaner_work_history
for each row execute function public._career_touch_updated_at();

drop trigger if exists cleaner_certifications_set_updated_at on public.cleaner_certifications;
create trigger cleaner_certifications_set_updated_at
before update on public.cleaner_certifications
for each row execute function public._career_touch_updated_at();

-- 5. ID GENERATION ----------------------------------------------------------

create sequence if not exists public.mycleaner_identity_seq start 100000;

create or replace function public.generate_mycleaner_id(country_code text default 'DK')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_country text;
  next_number bigint;
begin
  normalized_country := upper(regexp_replace(coalesce(country_code, 'DK'), '[^A-Z]', '', 'g'));
  if length(normalized_country) <> 2 then
    normalized_country := 'DK';
  end if;
  next_number := nextval('public.mycleaner_identity_seq');
  return 'MC-' || normalized_country || '-' || lpad(next_number::text, 8, '0');
end;
$$;

create or replace function public.ensure_cleaner_career_profile(p_country_code text default 'DK')
returns public.cleaner_career_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.cleaner_career_profiles;
  new_slug text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into result
  from public.cleaner_career_profiles
  where user_id = auth.uid();

  if found then
    return result;
  end if;

  new_slug := lower(encode(gen_random_bytes(12), 'hex'));

  insert into public.cleaner_career_profiles (user_id, mycleaner_id, share_slug)
  values (auth.uid(), public.generate_mycleaner_id(p_country_code), new_slug)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.ensure_cleaner_career_profile(text) to authenticated;
revoke execute on function public.generate_mycleaner_id(text) from public;

-- 6. RLS --------------------------------------------------------------------

alter table public.cleaner_career_profiles enable row level security;
alter table public.cleaner_work_history enable row level security;
alter table public.cleaner_certifications enable row level security;

-- Owner policies
create policy career_profile_owner_select
on public.cleaner_career_profiles for select
to authenticated
using (user_id = auth.uid());

create policy career_profile_owner_insert
on public.cleaner_career_profiles for insert
to authenticated
with check (user_id = auth.uid());

create policy career_profile_owner_update
on public.cleaner_career_profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy work_history_owner_all
on public.cleaner_work_history for all
to authenticated
using (
  exists (
    select 1 from public.cleaner_career_profiles p
    where p.id = career_profile_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.cleaner_career_profiles p
    where p.id = career_profile_id and p.user_id = auth.uid()
  )
);

create policy certification_owner_all
on public.cleaner_certifications for all
to authenticated
using (
  exists (
    select 1 from public.cleaner_career_profiles p
    where p.id = career_profile_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.cleaner_career_profiles p
    where p.id = career_profile_id and p.user_id = auth.uid()
  )
);

-- Admin / support policies for Verification Center
create policy career_profile_admin_read
on public.cleaner_career_profiles for select
to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'support'));

create policy career_profile_admin_update
on public.cleaner_career_profiles for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy work_history_admin_read
on public.cleaner_work_history for select
to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'support'));

create policy work_history_admin_update
on public.cleaner_work_history for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy certification_admin_read
on public.cleaner_certifications for select
to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'support'));

create policy certification_admin_update
on public.cleaner_certifications for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- 7. PUBLIC VIEW ------------------------------------------------------------

create or replace view public.public_cleaner_career_profiles
with (security_invoker = true)
as
select
  p.mycleaner_id,
  p.share_slug,
  p.professional_headline,
  p.career_summary,
  p.identity_verified,
  p.career_score,
  p.reliability_score,
  p.punctuality_score,
  p.total_completed_jobs,
  p.total_verified_hours,
  p.average_rating,
  p.repeat_customer_rate,
  p.created_at,
  wh.company_name,
  wh.role_title,
  wh.started_on,
  wh.ended_on,
  wh.currently_employed,
  wh.verification_status
from public.cleaner_career_profiles p
left join public.cleaner_work_history wh
  on wh.career_profile_id = p.id
  and wh.verification_status = 'verified'
where p.visibility = 'public';

grant select on public.public_cleaner_career_profiles to anon, authenticated;

comment on table public.cleaner_career_profiles is 'Permanent, user-controlled professional identity for cleaners.';
comment on column public.cleaner_work_history.evidence_storage_path is 'Private verification evidence path — never exposed to public view.';
