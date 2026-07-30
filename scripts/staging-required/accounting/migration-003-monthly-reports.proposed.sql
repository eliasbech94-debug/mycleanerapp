-- =============================================================================
-- PROPOSED MIGRATION 003 — monthly accounting reports
-- STATUS: PROPOSAL ONLY. Not applied to staging or production by this change.
-- Additive only. No existing column is dropped or retyped.
-- All money is stored in integer minor units. No floats anywhere.
-- =============================================================================

-- 1. Report status / kind enums -----------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'monthly_report_status') then
    create type public.monthly_report_status as enum (
      'scheduled', 'generating', 'ready', 'ready_with_warnings', 'failed', 'superseded'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'monthly_report_kind') then
    create type public.monthly_report_kind as enum ('scheduled_month_end', 'provisional');
  end if;
end $$;

-- 2. Report table --------------------------------------------------------------
create table if not exists public.provider_monthly_accounting_reports (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null,

  report_year integer not null check (report_year between 2020 and 2200),
  report_month integer not null check (report_month between 1 and 12),
  period_start date not null,
  period_end date not null,

  status public.monthly_report_status not null default 'scheduled',
  report_kind public.monthly_report_kind not null default 'scheduled_month_end',

  report_version integer not null default 1 check (report_version >= 1),
  supersedes_report_id uuid references public.provider_monthly_accounting_reports(id) on delete set null,
  is_current_version boolean not null default true,

  registration_country text,
  jurisdiction_code text,
  accounting_currency text,
  rule_pack_id uuid,
  rule_pack_version text,
  calculation_version text,

  -- Frozen figures, minor units.
  total_income_minor bigint,
  mycleaner_income_minor bigint,
  external_income_minor bigint,
  platform_fees_minor bigint,
  included_expenses_minor bigint,
  mileage_amount_minor bigint,
  preliminary_result_minor bigint,
  indirect_tax_payable_minor bigint,
  indirect_tax_receivable_minor bigint,
  review_required_count integer not null default 0,

  -- Frozen input snapshot used to build the PDF. Never recomputed.
  snapshot jsonb,
  snapshot_version text,
  snapshot_sha256 text,

  pdf_file_name text,
  pdf_storage_path text,
  pdf_sha256 text,
  pdf_byte_size bigint,
  pdf_generated_at timestamptz,

  generation_attempts integer not null default 0,
  generation_error_code text,
  generation_error_message text,
  idempotency_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.provider_monthly_accounting_reports is
  'Monthly preliminary accounting report per provider. Not a tax filing.';

create unique index if not exists provider_monthly_reports_idempotency_uidx
  on public.provider_monthly_accounting_reports (idempotency_key);

-- Exactly one current version per provider/month.
create unique index if not exists provider_monthly_reports_current_uidx
  on public.provider_monthly_accounting_reports (provider_id, report_year, report_month)
  where is_current_version;

create index if not exists provider_monthly_reports_provider_idx
  on public.provider_monthly_accounting_reports (provider_id, report_year desc, report_month desc);

create index if not exists provider_monthly_reports_status_idx
  on public.provider_monthly_accounting_reports (status)
  where status in ('scheduled', 'generating', 'failed');

-- 3. Grants (required — PostgREST has no default privileges on public) ---------
grant select on public.provider_monthly_accounting_reports to authenticated;
grant all on public.provider_monthly_accounting_reports to service_role;

-- 4. RLS ------------------------------------------------------------------------
alter table public.provider_monthly_accounting_reports enable row level security;

-- Providers read their own reports. Writes are service-role only (the generator).
create policy "providers read own monthly reports"
  on public.provider_monthly_accounting_reports
  for select to authenticated
  using (provider_id = auth.uid());

-- Admins see operational metadata only; report content lives in `snapshot`
-- and is filtered out by the admin edge function, never by the client.
create policy "admins read monthly report metadata"
  on public.provider_monthly_accounting_reports
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

-- 5. updated_at trigger ----------------------------------------------------------
drop trigger if exists trg_provider_monthly_reports_touch
  on public.provider_monthly_accounting_reports;
create trigger trg_provider_monthly_reports_touch
  before update on public.provider_monthly_accounting_reports
  for each row execute function public._touch_updated_at();

-- 6. Supersede guard --------------------------------------------------------------
create or replace function public.provider_monthly_report_supersede()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_current_version then
    update public.provider_monthly_accounting_reports
       set is_current_version = false,
           status = 'superseded'
     where provider_id = new.provider_id
       and report_year = new.report_year
       and report_month = new.report_month
       and id <> new.id
       and is_current_version;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_provider_monthly_report_supersede
  on public.provider_monthly_accounting_reports;
create trigger trg_provider_monthly_report_supersede
  before insert on public.provider_monthly_accounting_reports
  for each row execute function public.provider_monthly_report_supersede();

-- 7. Access audit ------------------------------------------------------------------
create table if not exists public.provider_monthly_report_access_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.provider_monthly_accounting_reports(id) on delete cascade,
  accessed_by uuid not null,
  access_role text not null,
  access_kind text not null check (access_kind in ('list', 'download_url', 'admin_metadata')),
  ip_hash text,
  created_at timestamptz not null default now()
);

grant select on public.provider_monthly_report_access_log to authenticated;
grant all on public.provider_monthly_report_access_log to service_role;

alter table public.provider_monthly_report_access_log enable row level security;

create policy "admins read report access log"
  on public.provider_monthly_report_access_log
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

-- 8. Private storage bucket ----------------------------------------------------------
-- Bucket `provider-accounting-reports` MUST be created privately through the
-- storage tool, never via SQL. Object policies:
--
--   create policy "providers read own accounting report files"
--     on storage.objects for select to authenticated
--     using (
--       bucket_id = 'provider-accounting-reports'
--       and (storage.foldername(name))[1] = auth.uid()::text
--     );
--
-- No insert/update/delete policy for `authenticated`: only the generator
-- (service role) writes report files, and files are immutable once written.
