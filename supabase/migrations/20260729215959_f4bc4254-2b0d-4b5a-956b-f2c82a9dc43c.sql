CREATE OR REPLACE FUNCTION public.get_public_provider_profile_v2(_slug text)
RETURNS TABLE(
  provider_slug text,
  display_name text,
  avatar_url text,
  marketplace_score smallint,
  provider_tier provider_tier,
  country_code text,
  city text,
  approx_lat numeric,
  approx_lng numeric,
  service_categories text[],
  languages text[],
  years_experience smallint,
  price_from integer,
  service_radius_km smallint,
  public_bio text,
  headline text,
  equipment_badges jsonb,
  avg_response_minutes integer,
  identity_verified_badge boolean,
  address_verified boolean,
  average_rating numeric,
  total_reviews integer,
  completed_bookings integer,
  years_on_platform integer,
  insurance_valid boolean,
  services jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    p.provider_slug::text,
    p.display_name,
    p.photo_path,
    p.provider_score,
    p.provider_tier,
    p.base_country_code,
    NULLIF(
      btrim(regexp_replace(
        COALESCE(split_part(p.base_address_formatted, ',', 2), ''),
        '\d{3,5}', '', 'g'
      )),
      ''
    ),
    round(p.base_lat::numeric, 2),
    round(p.base_lng::numeric, 2),
    p.service_categories,
    p.languages,
    p.years_experience,
    p.hourly_rate,
    p.service_area_radius_km,
    p.public_bio,
    p.headline,
    p.equipment_badges,
    p.avg_response_minutes,
    (p.identity_status = 'approved'),
    (p.base_address_place_id IS NOT NULL),
    NULL::numeric,
    NULL::integer,
    COALESCE((SELECT count(*)::int FROM public.bookings b
               WHERE b.provider_id = p.user_id::text
                 AND b.status::text = 'completed'), 0),
    GREATEST(0, EXTRACT(YEAR FROM age(now(), p.created_at))::int),
    (p.insurance_expires_on IS NOT NULL AND p.insurance_expires_on > current_date),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'service_code', c,
        'amount_minor', (p.hourly_rate * 100)::int,
        'currency', CASE p.base_country_code WHEN 'DK' THEN 'DKK' WHEN 'SE' THEN 'SEK'
                                             WHEN 'NO' THEN 'NOK' WHEN 'GB' THEN 'GBP' ELSE 'EUR' END,
        'unit', 'hour'
      ) ORDER BY c)
      FROM unnest(COALESCE(p.service_categories, '{}'::text[])) AS c
      WHERE p.hourly_rate IS NOT NULL
    ), '[]'::jsonb)
  FROM public.provider_profiles p
  WHERE p.provider_slug = _slug
    AND p.is_public = true
    AND p.status = 'active'
    AND p.visibility = 'public'
    AND coalesce(p.payout_frozen, false) = false
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_provider_profile_v2(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_provider_work_history_v1(_slug text)
RETURNS TABLE(
  company_name text,
  role_title text,
  city text,
  started_on date,
  ended_on date,
  currently_employed boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT w.company_name, w.role_title, w.city, w.started_on, w.ended_on, w.currently_employed
  FROM public.cleaner_work_history w
  JOIN public.cleaner_career_profiles cp ON cp.id = w.career_profile_id
  JOIN public.provider_profiles p ON p.user_id = cp.user_id
  WHERE p.provider_slug = _slug
    AND p.is_public = true
    AND p.status = 'active'
    AND p.visibility = 'public'
    AND w.verification_status = 'verified'
  ORDER BY w.started_on DESC
  LIMIT 20;
$function$;

GRANT EXECUTE ON FUNCTION public.list_public_provider_work_history_v1(text) TO anon, authenticated;