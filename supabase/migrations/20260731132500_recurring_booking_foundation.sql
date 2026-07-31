-- Recurring booking foundation.
-- Safe-by-default: schema only, no production data changes, no market activation.

create type public.booking_recurrence as enum ('weekly', 'biweekly', 'monthly');
create type public.booking_series_status as enum ('pending', 'active', 'paused', 'cancelled', 'completed');

create table public.recurring_discount_config (
  recurrence public.booking_recurrence primary key,
  discount_bps integer not null check (discount_bps between 0 and 5000),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

comment on table public.recurring_discount_config is
  'Platform-owned recurring discount rates. Providers may opt in, but cannot set percentages.';

insert into public.recurring_discount_config (recurrence, discount_bps)
values ('weekly', 1000), ('biweekly', 700), ('monthly', 500);

create table public.provider_recurring_discount_preferences (
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  recurrence public.booking_recurrence not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (provider_user_id, recurrence)
);

comment on table public.provider_recurring_discount_preferences is
  'Provider opt-in only. Discount percentage is resolved from recurring_discount_config.';

create table public.booking_series (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id),
  provider_user_id uuid not null references auth.users(id),
  recurrence public.booking_recurrence not null,
  status public.booking_series_status not null default 'pending',
  service_category text not null,
  country_code text not null check (char_length(country_code) = 2),
  currency text not null check (char_length(currency) = 3),
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  start_at timestamptz not null,
  next_occurrence_at timestamptz not null,
  timezone text not null,
  discount_bps integer not null check (discount_bps between 0 and 5000),
  discount_config_version integer not null check (discount_config_version > 0),
  base_rate_minor integer not null check (base_rate_minor > 0),
  discounted_rate_minor integer not null check (discounted_rate_minor > 0),
  stripe_customer_id text null,
  stripe_payment_method_id text null,
  payment_lead_hours integer not null default 24 check (payment_lead_hours between 1 and 168),
  cancelled_at timestamptz null,
  cancellation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.booking_series is
  'Frozen recurring booking agreement. Each occurrence is paid separately; historical terms never recalculate.';

create index booking_series_due_idx
  on public.booking_series (next_occurrence_at)
  where status = 'active';
create index booking_series_customer_idx on public.booking_series (customer_user_id, created_at desc);
create index booking_series_provider_idx on public.booking_series (provider_user_id, created_at desc);

alter table public.recurring_discount_config enable row level security;
alter table public.provider_recurring_discount_preferences enable row level security;
alter table public.booking_series enable row level security;

create policy recurring_discount_config_read
  on public.recurring_discount_config for select
  to authenticated
  using (active = true);

create policy provider_recurring_preferences_read_own
  on public.provider_recurring_discount_preferences for select
  to authenticated
  using (provider_user_id = auth.uid());

create policy provider_recurring_preferences_write_own
  on public.provider_recurring_discount_preferences for all
  to authenticated
  using (provider_user_id = auth.uid())
  with check (provider_user_id = auth.uid());

create policy booking_series_customer_read
  on public.booking_series for select
  to authenticated
  using (customer_user_id = auth.uid());

create policy booking_series_provider_read
  on public.booking_series for select
  to authenticated
  using (provider_user_id = auth.uid());

-- Creation, cancellation and payment-state changes must go through trusted server code.
-- No direct authenticated INSERT/UPDATE/DELETE policy is intentionally granted.

create or replace function public.resolve_recurring_discount(
  _provider_user_id uuid,
  _recurrence public.booking_recurrence
)
returns table(discount_bps integer, config_version integer)
language sql
security definer
set search_path = public
stable
as $$
  select c.discount_bps, c.version
  from public.recurring_discount_config c
  join public.provider_recurring_discount_preferences p
    on p.provider_user_id = _provider_user_id
   and p.recurrence = c.recurrence
   and p.enabled = true
  where c.recurrence = _recurrence
    and c.active = true;
$$;

revoke all on function public.resolve_recurring_discount(uuid, public.booking_recurrence) from public;
grant execute on function public.resolve_recurring_discount(uuid, public.booking_recurrence) to service_role;
