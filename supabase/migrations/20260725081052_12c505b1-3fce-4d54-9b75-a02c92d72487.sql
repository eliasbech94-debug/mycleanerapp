DROP FUNCTION IF EXISTS public.get_providers_in_bounds(double precision, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_providers_in_bounds(sw_lat double precision, sw_lng double precision, ne_lat double precision, ne_lng double precision)
 RETURNS TABLE(id uuid, provider_id text, provider_slug text, full_name text, address text, country_code text, lat double precision, lng double precision, is_business boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.provider_id,
    pp.provider_slug,
    p.full_name,
    p.address,
    p.country_code,
    p.lat,
    p.lng,
    (p.tax_type = 'business') as is_business
  from public.profiles p
  left join public.provider_profiles pp
    on pp.user_id = p.id
   and pp.is_public = true
   and pp.status = 'active'
   and pp.visibility = 'public'
  where p.provider_id is not null
    and p.deactivated_at is null
    and p.lat is not null
    and p.lng is not null
    and p.lat between sw_lat and ne_lat
    and p.lng between sw_lng and ne_lng;
$function$;