create or replace function public.get_providers_in_bounds(
  sw_lat double precision,
  sw_lng double precision,
  ne_lat double precision,
  ne_lng double precision
)
returns table (
  id uuid,
  provider_id text,
  full_name text,
  address text,
  country_code text,
  lat double precision,
  lng double precision,
  is_business boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.provider_id,
    p.full_name,
    p.address,
    p.country_code,
    p.lat,
    p.lng,
    (p.tax_type = 'business') as is_business
  from public.profiles p
  where p.provider_id is not null
    and p.deactivated_at is null
    and p.lat is not null
    and p.lng is not null
    and p.lat between sw_lat and ne_lat
    and p.lng between sw_lng and ne_lng;
$$;

grant execute on function public.get_providers_in_bounds(double precision, double precision, double precision, double precision) to anon, authenticated;