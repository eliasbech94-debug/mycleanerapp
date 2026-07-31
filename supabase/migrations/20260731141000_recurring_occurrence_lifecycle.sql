-- Recurring occurrence and payment-attempt lifecycle.
-- Safe-by-default: no scheduler, Stripe call, trigger or production activation.

create type public.booking_series_occurrence_status as enum (
  'scheduled',
  'payment_pending',
  'payment_requires_action',
  'payment_failed',
  'paid',
  'cancelled',
  'completed'
);

create type public.recurring_payment_attempt_status as enum (
  'created',
  'processing',
  'requires_action',
  'succeeded',
  'failed',
  'cancelled'
);

create table public.booking_series_occurrences (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.booking_series(id) on delete cascade,
  occurrence_number integer not null check (occurrence_number > 0),
  scheduled_start_at timestamptz not null,
  payment_due_at timestamptz not null,
  status public.booking_series_occurrence_status not null default 'scheduled',
  pricing_calculation_id uuid null references public.pricing_calculations(id),
  booking_id uuid null references public.bookings(id),
  base_rate_minor integer not null check (base_rate_minor > 0),
  discount_bps integer not null check (discount_bps between 0 and 5000),
  discounted_rate_minor integer not null check (discounted_rate_minor > 0),
  subtotal_minor integer not null check (subtotal_minor >= 0),
  customer_total_minor integer not null check (customer_total_minor >= 0),
  provider_net_minor integer not null check (provider_net_minor >= 0),
  platform_fee_minor integer not null check (platform_fee_minor >= 0),
  currency text not null check (char_length(currency) = 3),
  skipped_at timestamptz null,
  cancelled_at timestamptz null,
  cancellation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, occurrence_number),
  unique (series_id, scheduled_start_at),
  constraint occurrence_money_consistent check (
    customer_total_minor - provider_net_minor = platform_fee_minor
  )
);

comment on table public.booking_series_occurrences is
  'Immutable-price occurrence within a recurring series. One occurrence maps to at most one booking.';

create table public.recurring_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.booking_series_occurrences(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status public.recurring_payment_attempt_status not null default 'created',
  stripe_payment_intent_id text null,
  stripe_request_id text null,
  idempotency_key text not null,
  failure_code text null,
  failure_message text null,
  requires_action_client_secret text null,
  attempted_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (occurrence_id, attempt_number),
  unique (idempotency_key),
  unique (stripe_payment_intent_id)
);

comment on table public.recurring_payment_attempts is
  'Append-only audit log for off-session payment attempts. Secrets are never exposed by RLS.';

create index booking_series_occurrences_due_idx
  on public.booking_series_occurrences (payment_due_at)
  where status in ('scheduled', 'payment_pending', 'payment_failed');

create index recurring_payment_attempts_occurrence_idx
  on public.recurring_payment_attempts (occurrence_id, attempt_number desc);

alter table public.booking_series_occurrences enable row level security;
alter table public.recurring_payment_attempts enable row level security;

create policy booking_series_occurrences_customer_read
  on public.booking_series_occurrences for select
  to authenticated
  using (
    exists (
      select 1 from public.booking_series s
      where s.id = series_id and s.customer_user_id = auth.uid()
    )
  );

create policy booking_series_occurrences_provider_read
  on public.booking_series_occurrences for select
  to authenticated
  using (
    exists (
      select 1 from public.booking_series s
      where s.id = series_id and s.provider_user_id = auth.uid()
    )
  );

-- Payment-attempt rows deliberately have no client SELECT policy because they may
-- contain processor diagnostics and a short-lived client secret. Trusted server
-- endpoints must return only an explicitly allow-listed status payload.
-- No authenticated INSERT/UPDATE/DELETE policies are granted on either table.
