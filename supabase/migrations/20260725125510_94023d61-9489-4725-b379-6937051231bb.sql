-- Root cause: provider_profiles.provider_slug is `citext`, but three public
-- marketplace-facing functions declare `provider_slug text` in their RETURNS
-- TABLE(...) contract. PostgreSQL's plpgsql RETURN QUERY enforces exact
-- type equality on the first column, causing 42804 on the search RPC.
-- Fix: cast to ::text inside the SELECT. Public contract unchanged.

-- 1) search_marketplace_providers_v1
CREATE OR REPLACE FUNCTION public.search_marketplace_providers_v1(
  _country_code text DEFAULT NULL::text,
  _service_category text DEFAULT NULL::text,
  _min_score integer DEFAULT NULL::integer,
  _min_tier provider_tier DEFAULT NULL::provider_tier,
  _language text DEFAULT NULL::text,
  _max_hourly_rate integer DEFAULT NULL::integer,
  _search text DEFAULT NULL::text,
  _sort text DEFAULT 'score'::text,
  _limit integer DEFAULT 24,
  _offset integer DEFAULT 0
)
RETURNS TABLE(provider_slug text, display_name text, avatar_url text, marketplace_score smallint, provider_tier provider_tier, country_code text, service_categories text[], languages text[], years_experience smallint, price_from integer, service_radius_km smallint, public_bio text, equipment_badges jsonb, avg_response_minutes integer, approximate_service_area jsonb, identity_verified_badge boolean, repeat_customer_badge boolean, average_rating numeric, total_reviews integer, completed_bookings integer, years_on_platform integer, total_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  lim integer := LEAST(GREATEST(coalesce(_limit, 24), 1), 100);
  off integer := GREATEST(coalesce(_offset, 0), 0);
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.user_id,
      p.provider_slug::text AS provider_slug,           -- FIX: citext → text
      p.display_name,
      p.photo_path AS avatar_url,
      p.provider_score AS marketplace_score, p.provider_tier,
      p.base_country_code AS country_code,
      p.service_categories, p.languages, p.years_experience,
      p.hourly_rate AS price_from,
      p.service_area_radius_km AS service_radius_km,
      p.public_bio, p.equipment_badges, p.avg_response_minutes,
      jsonb_build_object('country', p.base_country_code, 'radius_km', coalesce(p.service_area_radius_km, 10)) AS approximate_service_area,
      (p.identity_status = 'approved') AS identity_verified_badge,
      false AS repeat_customer_badge,
      0::numeric AS average_rating, 0 AS total_reviews,
      COALESCE((SELECT count(*)::int FROM public.bookings b
        WHERE b.provider_id = p.user_id::text AND b.status::text = 'completed'), 0) AS completed_bookings,
      GREATEST(0, EXTRACT(YEAR FROM age(now(), p.created_at))::int) AS years_on_platform,
      p.created_at
    FROM public.provider_profiles p
    WHERE p.is_public = true
      AND p.status = 'active'
      AND p.visibility = 'public'
      AND coalesce(p.payout_frozen, false) = false
      AND (_country_code IS NULL OR p.base_country_code = upper(_country_code))
      AND (_service_category IS NULL OR _service_category = ANY(p.service_categories))
      AND (_min_score IS NULL OR coalesce(p.provider_score, 0) >= _min_score)
      AND (_language IS NULL OR _language = ANY(p.languages))
      AND (_max_hourly_rate IS NULL OR coalesce(p.hourly_rate, 0) <= _max_hourly_rate)
      AND (_search IS NULL OR p.display_name ILIKE '%' || _search || '%')
      AND (_min_tier IS NULL OR array_position(
        ARRAY['new','verified','experienced','top_rated','elite','partner']::text[], p.provider_tier::text
      ) >= array_position(
        ARRAY['new','verified','experienced','top_rated','elite','partner']::text[], _min_tier::text
      ))
  ),
  counted AS (SELECT count(*)::int AS c FROM base)
  SELECT b.provider_slug, b.display_name, b.avatar_url, b.marketplace_score, b.provider_tier,
    b.country_code, b.service_categories, b.languages, b.years_experience,
    b.price_from, b.service_radius_km, b.public_bio, b.equipment_badges,
    b.avg_response_minutes, b.approximate_service_area,
    b.identity_verified_badge, b.repeat_customer_badge,
    b.average_rating, b.total_reviews, b.completed_bookings, b.years_on_platform,
    (SELECT c FROM counted)
  FROM base b
  ORDER BY
    CASE WHEN _sort = 'price_asc'  THEN b.price_from END ASC NULLS LAST,
    CASE WHEN _sort = 'price_desc' THEN b.price_from END DESC NULLS LAST,
    CASE WHEN _sort = 'response'   THEN b.avg_response_minutes END ASC NULLS LAST,
    CASE WHEN _sort = 'rating'     THEN b.average_rating END DESC NULLS LAST,
    b.marketplace_score DESC NULLS LAST, b.completed_bookings DESC
  LIMIT lim OFFSET off;
END;$function$;

-- 2) get_public_provider_profile_v1 — preventive cast (same drift risk)
CREATE OR REPLACE FUNCTION public.get_public_provider_profile_v1(_slug text)
RETURNS TABLE(provider_slug text, display_name text, avatar_url text, marketplace_score smallint, provider_tier provider_tier, country_code text, service_categories text[], languages text[], years_experience smallint, price_from integer, service_radius_km smallint, public_bio text, equipment_badges jsonb, avg_response_minutes integer, approximate_service_area jsonb, identity_verified_badge boolean, average_rating numeric, total_reviews integer, completed_bookings integer, years_on_platform integer, insurance_valid boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    p.provider_slug::text,                                -- FIX: citext → text
    p.display_name,
    p.photo_path,
    p.provider_score,
    p.provider_tier,
    p.base_country_code,
    p.service_categories,
    p.languages,
    p.years_experience,
    p.hourly_rate,
    p.service_area_radius_km,
    p.public_bio,
    p.equipment_badges,
    p.avg_response_minutes,
    jsonb_build_object(
      'country', p.base_country_code,
      'radius_km', coalesce(p.service_area_radius_km, 10)
    ),
    (p.identity_status = 'approved'),
    NULL::numeric,
    NULL::integer,
    COALESCE(
      (SELECT count(*)::int
         FROM public.bookings b
        WHERE b.provider_id = p.user_id::text
          AND b.status::text = 'completed'),
      0
    ),
    GREATEST(0, EXTRACT(YEAR FROM age(now(), p.created_at))::int),
    (p.insurance_expires_on IS NOT NULL AND p.insurance_expires_on > current_date)
  FROM public.provider_profiles p
  WHERE p.provider_slug = _slug
    AND p.is_public = true
    AND p.status = 'active'
    AND p.visibility = 'public'
    AND coalesce(p.payout_frozen, false) = false
  LIMIT 1;
$function$;

-- 3) get_providers_in_bounds — preventive cast (same drift risk)
CREATE OR REPLACE FUNCTION public.get_providers_in_bounds(
  sw_lat double precision, sw_lng double precision,
  ne_lat double precision, ne_lng double precision
)
RETURNS TABLE(id uuid, provider_id text, provider_slug text, full_name text, address text, country_code text, lat double precision, lng double precision, is_business boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.provider_id,
    pp.provider_slug::text,                              -- FIX: citext → text
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

-- Post-migration smoke: verify function is now callable without a type error.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.search_marketplace_providers_v1(
    _country_code := 'DK', _service_category := 'cleaning',
    _sort := 'score', _limit := 6, _offset := 0
  );
  RAISE NOTICE 'search_marketplace_providers_v1 returned % row(s) on DK/cleaning', n;
END $$;