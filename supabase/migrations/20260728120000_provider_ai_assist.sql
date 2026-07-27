-- MyCleaner Assist: booking-bound AI guidance for providers

create table if not exists public.provider_assist_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  area text not null,
  status text not null default 'draft' check (status in ('draft','analyzing','completed','escalated','failed')),
  risk_level text check (risk_level in ('green','yellow','red')),
  confidence numeric(5,4),
  detected_surface text,
  detected_issue text,
  summary text,
  guidance jsonb,
  warnings jsonb,
  escalation_reason text,
  locale text not null default 'da-DK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.provider_assist_images (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.provider_assist_sessions(id) on delete cascade,
  storage_path text not null,
  image_kind text not null check (image_kind in ('overview','closeup','product_front','product_back')),
  captured_at timestamptz not null default now(),
  latitude numeric,
  longitude numeric,
  deleted_at timestamptz
);

create table if not exists public.provider_assist_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.provider_assist_sessions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists provider_assist_sessions_booking_idx on public.provider_assist_sessions(booking_id, created_at desc);
create index if not exists provider_assist_sessions_provider_idx on public.provider_assist_sessions(provider_id, created_at desc);
create index if not exists provider_assist_images_session_idx on public.provider_assist_images(session_id);

alter table public.provider_assist_sessions enable row level security;
alter table public.provider_assist_images enable row level security;
alter table public.provider_assist_events enable row level security;

create policy "Providers can read own assist sessions"
on public.provider_assist_sessions for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','support')
  )
);

create policy "Providers can create own booking assist sessions"
on public.provider_assist_sessions for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    join public.bookings b on b.provider_id = p.provider_id
    where p.id = auth.uid()
      and b.id = booking_id
      and b.status in ('accepted','completed')
  )
);

create policy "Providers can update own assist sessions"
on public.provider_assist_sessions for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Session owners can read assist images"
on public.provider_assist_images for select
to authenticated
using (
  exists (
    select 1 from public.provider_assist_sessions s
    where s.id = session_id and (
      s.created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin','support')
      )
    )
  )
);

create policy "Session owners can create assist images"
on public.provider_assist_images for insert
to authenticated
with check (
  exists (
    select 1 from public.provider_assist_sessions s
    where s.id = session_id and s.created_by = auth.uid()
  )
);

create policy "Session owners can read assist events"
on public.provider_assist_events for select
to authenticated
using (
  exists (
    select 1 from public.provider_assist_sessions s
    where s.id = session_id and (
      s.created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin','support')
      )
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-assist', 'provider-assist', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Providers upload own assist images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'provider-assist'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Providers read own assist images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'provider-assist'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin','support')
    )
  )
);

comment on table public.provider_assist_sessions is 'Privacy-conscious, booking-bound AI guidance sessions for providers.';
comment on table public.provider_assist_images is 'Ephemeral camera captures used by MyCleaner Assist.';
