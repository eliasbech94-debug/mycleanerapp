-- RCS/SMS notification outbox
-- Provider-neutral, idempotent queue used by the rcs-dispatch edge function.

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  booking_id uuid null,
  recipient_user_id uuid null references auth.users(id) on delete set null,
  recipient_phone_e164 text not null,
  event_type text not null check (event_type in (
    'booking_confirmed', 'provider_travelling', 'provider_arrived',
    'work_started', 'work_completed', 'booking_cancelled',
    'booking_rescheduled', 'review_requested', 'custom'
  )),
  locale text not null default 'da-DK',
  payload jsonb not null default '{}'::jsonb,
  preferred_channel text not null default 'rcs' check (preferred_channel in ('rcs','sms')),
  status text not null default 'pending' check (status in (
    'pending','processing','rcs_sent','sms_sent','delivered','read','failed','cancelled'
  )),
  rcs_message_id text null,
  sms_message_id text null,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text null,
  sent_at timestamptz null,
  delivered_at timestamptz null,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_outbox_dispatch_idx
  on public.notification_outbox (status, next_attempt_at, created_at)
  where status in ('pending','failed');

create index if not exists notification_outbox_booking_idx
  on public.notification_outbox (booking_id, created_at desc);

alter table public.notification_outbox enable row level security;

-- Outbound messages and phone numbers are private operational data.
-- Only service-role/SECURITY DEFINER functions may access this table.
revoke all on public.notification_outbox from anon, authenticated;

create or replace function public.enqueue_transactional_notification_v1(
  _idempotency_key text,
  _recipient_phone_e164 text,
  _event_type text,
  _payload jsonb default '{}'::jsonb,
  _booking_id uuid default null,
  _recipient_user_id uuid default null,
  _locale text default 'da-DK',
  _preferred_channel text default 'rcs'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if coalesce(_idempotency_key, '') = '' then
    raise exception 'idempotency key is required';
  end if;
  if _recipient_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'recipient phone must be E.164';
  end if;

  insert into public.notification_outbox (
    idempotency_key, recipient_phone_e164, event_type, payload,
    booking_id, recipient_user_id, locale, preferred_channel
  ) values (
    _idempotency_key, _recipient_phone_e164, _event_type, coalesce(_payload, '{}'::jsonb),
    _booking_id, _recipient_user_id, coalesce(_locale, 'da-DK'), coalesce(_preferred_channel, 'rcs')
  )
  on conflict (idempotency_key) do update
    set updated_at = now()
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.enqueue_transactional_notification_v1(text,text,text,jsonb,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_transactional_notification_v1(text,text,text,jsonb,uuid,uuid,text,text) to service_role;

create or replace function public.claim_notification_batch_v1(_limit integer default 20)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.notification_outbox
    where status in ('pending','failed')
      and next_attempt_at <= now()
      and attempt_count < 8
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(_limit, 20), 100))
  )
  update public.notification_outbox n
     set status = 'processing',
         attempt_count = n.attempt_count + 1,
         updated_at = now()
    from picked
   where n.id = picked.id
  returning n.*;
end;
$$;

revoke all on function public.claim_notification_batch_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch_v1(integer) to service_role;

comment on table public.notification_outbox is
  'Idempotent transactional messaging queue. RCS is attempted first and SMS is used only after a definite unsupported/permanent RCS result.';
