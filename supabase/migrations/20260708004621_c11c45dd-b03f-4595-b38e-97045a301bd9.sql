
alter table public.profiles add column if not exists address_country_code text;
alter table public.customer_addresses add column if not exists address_country_code text;

create table if not exists public.place_validations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  country_code text not null,
  formatted_address text not null,
  lat double precision,
  lng double precision,
  validated_at timestamptz not null default now()
);
create index if not exists idx_place_validations_user_place
  on public.place_validations(user_id, place_id, validated_at desc);

grant select on public.place_validations to authenticated;
grant all on public.place_validations to service_role;

alter table public.place_validations enable row level security;

drop policy if exists "own validations readable" on public.place_validations;
create policy "own validations readable"
  on public.place_validations
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.enforce_address_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_country text;
  v_val record;
  v_place_changed boolean;
begin
  if tg_table_name = 'profiles' then
    v_user := new.id;
    v_country := new.country_code;
  else
    v_user := new.user_id;
    select country_code into v_country from public.profiles where id = v_user;
  end if;

  if new.address_place_id is null then
    new.address_country_code := null;
    return new;
  end if;

  v_place_changed := (tg_op = 'INSERT')
    or (old.address_place_id is distinct from new.address_place_id);

  if v_place_changed then
    if v_country is null then
      raise exception 'profile_country_missing: set your country before saving an address';
    end if;

    select * into v_val
    from public.place_validations
    where user_id = v_user
      and place_id = new.address_place_id
      and validated_at > now() - interval '30 minutes'
    order by validated_at desc
    limit 1;

    if not found then
      raise exception 'address_not_validated: address was not validated server-side; pick a suggestion again';
    end if;

    if upper(v_val.country_code) <> upper(v_country) then
      raise exception 'address_country_mismatch: address is in % but your profile country is %',
        v_val.country_code, v_country;
    end if;

    new.address := v_val.formatted_address;
    new.lat := v_val.lat;
    new.lng := v_val.lng;
    new.address_country_code := upper(v_val.country_code);
  else
    if new.address_country_code is not null
       and v_country is not null
       and upper(new.address_country_code) <> upper(v_country) then
      raise exception 'address_country_mismatch: your saved address is in % but your profile country is now %',
        new.address_country_code, v_country;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_address_country_profiles on public.profiles;
create trigger trg_enforce_address_country_profiles
before insert or update of address, address_place_id, lat, lng, country_code, address_country_code
on public.profiles
for each row
execute function public.enforce_address_country();

drop trigger if exists trg_enforce_address_country_addresses on public.customer_addresses;
create trigger trg_enforce_address_country_addresses
before insert or update of address, address_place_id, lat, lng, address_country_code
on public.customer_addresses
for each row
execute function public.enforce_address_country();
