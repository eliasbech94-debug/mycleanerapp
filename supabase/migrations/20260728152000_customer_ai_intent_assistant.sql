-- Consent-based behavioral signals for the MyCleaner customer AI assistant.
-- Raw events are private to the customer, never expose exact visit counts in customer copy,
-- and are intended to be deleted after the configured retention period.

create table if not exists public.customer_ai_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  personalization_enabled boolean not null default false,
  proactive_suggestions_enabled boolean not null default false,
  calendar_context_enabled boolean not null default false,
  retention_days integer not null default 90 check (retention_days between 30 and 365),
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_behavior_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'provider_view',
    'service_search',
    'date_search',
    'checkout_started',
    'checkout_abandoned',
    'suggestion_opened',
    'suggestion_dismissed',
    'suggestion_converted'
  )),
  provider_id uuid,
  service_key text,
  requested_date date,
  session_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_behavior_events_user_created_idx
  on public.customer_behavior_events (user_id, created_at desc);
create index if not exists customer_behavior_events_provider_idx
  on public.customer_behavior_events (user_id, provider_id, created_at desc)
  where provider_id is not null;
create index if not exists customer_behavior_events_service_idx
  on public.customer_behavior_events (user_id, service_key, created_at desc)
  where service_key is not null;

alter table public.customer_ai_preferences enable row level security;
alter table public.customer_behavior_events enable row level security;

create policy "customers manage own ai preferences"
  on public.customer_ai_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "customers read own behavior events"
  on public.customer_behavior_events
  for select
  using (auth.uid() = user_id);

-- Direct inserts are intentionally blocked. All writes go through the consent-checking RPC.

create or replace function public.track_customer_behavior(
  p_event_type text,
  p_provider_id uuid default null,
  p_service_key text default null,
  p_requested_date date default null,
  p_session_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_enabled boolean;
begin
  if v_user_id is null then
    return;
  end if;

  select personalization_enabled
    into v_enabled
  from public.customer_ai_preferences
  where user_id = v_user_id;

  if coalesce(v_enabled, false) is not true then
    return;
  end if;

  if p_event_type not in (
    'provider_view', 'service_search', 'date_search', 'checkout_started',
    'checkout_abandoned', 'suggestion_opened', 'suggestion_dismissed',
    'suggestion_converted'
  ) then
    raise exception 'unsupported event type';
  end if;

  insert into public.customer_behavior_events (
    user_id, event_type, provider_id, service_key, requested_date,
    session_id, metadata
  ) values (
    v_user_id, p_event_type, p_provider_id, left(p_service_key, 120),
    p_requested_date, p_session_id, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.track_customer_behavior(text, uuid, text, date, uuid, jsonb) from public;
grant execute on function public.track_customer_behavior(text, uuid, text, date, uuid, jsonb) to authenticated;

create or replace function public.get_customer_ai_suggestions()
returns table (
  suggestion_key text,
  suggestion_type text,
  title text,
  body text,
  action_label text,
  action_href text,
  score integer,
  context jsonb
)
language sql
security definer
set search_path = public
as $$
  with prefs as (
    select proactive_suggestions_enabled
    from public.customer_ai_preferences
    where user_id = auth.uid()
  ),
  recent as (
    select *
    from public.customer_behavior_events
    where user_id = auth.uid()
      and created_at >= now() - interval '30 days'
  ),
  provider_interest as (
    select provider_id, count(*)::integer as views, max(created_at) as last_seen
    from recent
    where event_type = 'provider_view' and provider_id is not null
    group by provider_id
    having count(*) >= 3
    order by views desc, last_seen desc
    limit 1
  ),
  service_interest as (
    select service_key, count(*)::integer as searches, max(created_at) as last_seen
    from recent
    where event_type = 'service_search' and service_key is not null
    group by service_key
    having count(*) >= 2
    order by searches desc, last_seen desc
    limit 1
  ),
  date_interest as (
    select requested_date, count(*)::integer as searches, max(created_at) as last_seen
    from recent
    where event_type = 'date_search'
      and requested_date >= current_date
    group by requested_date
    having count(*) >= 2
    order by searches desc, last_seen desc
    limit 1
  )
  select
    'provider:' || provider_id::text,
    'provider_interest',
    'Skal vi hjælpe dig videre?',
    'En cleaner, du har overvejet, kan være et godt match. Se profil og ledige tider.',
    'Se cleaner',
    '/provider/' || provider_id::text,
    least(95, 55 + views * 8),
    jsonb_build_object('provider_id', provider_id)
  from provider_interest, prefs
  where prefs.proactive_suggestions_enabled

  union all

  select
    'service:' || service_key,
    'service_interest',
    'Leder du stadig efter den rette hjælp?',
    'Vi har samlet relevante cleaners til den service, du har kigget efter.',
    'Se muligheder',
    '/find-cleaner?service=' || replace(service_key, ' ', '%20'),
    least(90, 50 + searches * 10),
    jsonb_build_object('service_key', service_key)
  from service_interest, prefs
  where prefs.proactive_suggestions_enabled

  union all

  select
    'date:' || requested_date::text,
    'date_interest',
    'Har du stadig brug for hjælp den dag?',
    'Se cleaners og ledige tider, der passer til den dato, du har søgt efter.',
    'Find en tid',
    '/find-cleaner?date=' || requested_date::text,
    least(92, 52 + searches * 10),
    jsonb_build_object('requested_date', requested_date)
  from date_interest, prefs
  where prefs.proactive_suggestions_enabled

  order by score desc
  limit 3;
$$;

revoke all on function public.get_customer_ai_suggestions() from public;
grant execute on function public.get_customer_ai_suggestions() to authenticated;

-- Scheduled cleanup target. Invoke daily with a privileged scheduler.
create or replace function public.purge_expired_customer_behavior_events()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.customer_behavior_events e
  using public.customer_ai_preferences p
  where e.user_id = p.user_id
    and e.created_at < now() - make_interval(days => p.retention_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_customer_behavior_events() from public;

comment on table public.customer_behavior_events is
  'Private, consent-gated customer interaction signals used to generate helpful MyCleaner suggestions.';
