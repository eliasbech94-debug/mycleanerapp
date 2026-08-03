-- 1) Remove the leaky public map RPC (full_name, address, exact lat/lng)
DROP FUNCTION IF EXISTS public.get_providers_in_bounds(double precision, double precision, double precision, double precision);

-- 2) Anonymisation helper: snap to ~1.1 km grid + stable deterministic offset
CREATE OR REPLACE FUNCTION public.anonymize_geo_point(
  _lat double precision, _lng double precision, _seed text
)
RETURNS TABLE(lat double precision, lng double precision)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT
    round((_lat / 0.01))::double precision * 0.01
      + ((abs(hashtext(coalesce(_seed, ''))) % 7) - 3) * 0.0009,
    round((_lng / 0.01))::double precision * 0.01
      + ((abs(hashtext('lng:' || coalesce(_seed, ''))) % 7) - 3) * 0.0014;
$function$;

REVOKE ALL ON FUNCTION public.anonymize_geo_point(double precision, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_geo_point(double precision, double precision, text) TO anon, authenticated, service_role;

-- 3) Public display name: first name + surname initial (never full legal name)
CREATE OR REPLACE FUNCTION public.public_display_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(btrim(_name), '') = '' THEN 'Cleaner'
    WHEN array_length(regexp_split_to_array(btrim(_name), '\s+'), 1) = 1
      THEN split_part(btrim(_name), ' ', 1)
    ELSE split_part(btrim(_name), ' ', 1) || ' ' ||
         upper(left((regexp_split_to_array(btrim(_name), '\s+'))[
           array_length(regexp_split_to_array(btrim(_name), '\s+'), 1)], 1)) || '.'
  END;
$function$;

REVOKE ALL ON FUNCTION public.public_display_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_display_name(text) TO anon, authenticated, service_role;

-- 4) Great-circle distance in km
CREATE OR REPLACE FUNCTION public.geo_distance_km(
  _lat1 double precision, _lng1 double precision,
  _lat2 double precision, _lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT 6371.0 * 2 * asin(sqrt(
      power(sin(radians(_lat2 - _lat1) / 2), 2)
    + cos(radians(_lat1)) * cos(radians(_lat2))
    * power(sin(radians(_lng2 - _lng1) / 2), 2)
  ));
$function$;

REVOKE ALL ON FUNCTION public.geo_distance_km(double precision, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.geo_distance_km(double precision, double precision, double precision, double precision) TO anon, authenticated, service_role;

-- 5) Public, privacy-safe geo search around a CUSTOMER-selected job location.
--    Returns only anonymised area coordinates and public marketing fields.
CREATE OR REPLACE FUNCTION public.search_providers_public_geo_v1(
  _lat double precision,
  _lng double precision,
  _radius_km double precision DEFAULT 25,
  _country_code text DEFAULT NULL,
  _service_category text DEFAULT NULL,
  _language text DEFAULT NULL,
  _max_hourly_rate integer DEFAULT NULL,
  _limit integer DEFAULT 60
)
RETURNS TABLE(
  provider_slug text,
  user_id uuid,
  display_name text,
  avatar_url text,
  country_code text,
  public_area text,
  public_lat double precision,
  public_lng double precision,
  service_radius_km smallint,
  distance_km double precision,
  covers_location boolean,
  price_from integer,
  languages text[],
  service_categories text[],
  years_experience smallint,
  avg_response_minutes integer,
  identity_verified_badge boolean,
  average_rating numeric,
  total_reviews integer,
  completed_bookings integer,
  marketplace_score smallint,
  relevance numeric,
  total_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  lim integer := LEAST(GREATEST(coalesce(_limit, 60), 1), 200);
  rad double precision := LEAST(GREATEST(coalesce(_radius_km, 25), 1), 200);
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.provider_slug::text AS provider_slug,
      p.user_id,
      public.public_display_name(coalesce(p.display_name, pr.full_name)) AS display_name,
      p.photo_path AS avatar_url,
      coalesce(p.base_country_code, pr.country_code) AS country_code,
      pr.location_city AS public_area,
      a.lat AS public_lat,
      a.lng AS public_lng,
      coalesce(p.service_area_radius_km, 10::smallint) AS service_radius_km,
      public.geo_distance_km(_lat, _lng, a.lat, a.lng) AS distance_km,
      (public.geo_distance_km(
         _lat, _lng,
         coalesce(p.base_lat, pr.lat), coalesce(p.base_lng, pr.lng)
       ) <= coalesce(p.service_area_radius_km, 10)::double precision) AS covers_location,
      p.hourly_rate AS price_from,
      p.languages,
      p.service_categories,
      p.years_experience,
      p.avg_response_minutes,
      (p.identity_status = 'approved') AS identity_verified_badge,
      0::numeric AS average_rating,
      0 AS total_reviews,
      COALESCE((SELECT count(*)::int FROM public.bookings b
                WHERE b.provider_id = p.user_id::text
                  AND b.status::text = 'completed'), 0) AS completed_bookings,
      p.provider_score AS marketplace_score
    FROM public.provider_profiles p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
    CROSS JOIN LATERAL public.anonymize_geo_point(
      coalesce(p.base_lat, pr.lat), coalesce(p.base_lng, pr.lng), p.user_id::text
    ) a
    WHERE p.is_public = true
      AND p.status = 'active'
      AND p.visibility = 'public'
      AND coalesce(p.payout_frozen, false) = false
      AND coalesce(p.base_lat, pr.lat) IS NOT NULL
      AND coalesce(p.base_lng, pr.lng) IS NOT NULL
      AND (_country_code IS NULL OR coalesce(p.base_country_code, pr.country_code) = upper(_country_code))
      AND (_service_category IS NULL OR _service_category = ANY(p.service_categories))
      AND (_language IS NULL OR _language = ANY(p.languages))
      AND (_max_hourly_rate IS NULL OR coalesce(p.hourly_rate, 0) <= _max_hourly_rate)
  ),
  scoped AS (
    SELECT b.*,
      -- Relevance: service-area coverage first, then proximity, then quality.
      ( (CASE WHEN b.covers_location THEN 40 ELSE 0 END)
      + GREATEST(0, 30 - (b.distance_km * 30.0 / rad))
      + (coalesce(b.average_rating, 0) * 2)
      + (LEAST(coalesce(b.completed_bookings, 0), 50) * 0.2)
      + (CASE WHEN coalesce(b.avg_response_minutes, 999) <= 60 THEN 5 ELSE 0 END)
      + (coalesce(b.marketplace_score, 0) * 0.05)
      )::numeric AS relevance
    FROM base b
    WHERE b.covers_location OR b.distance_km <= rad
  ),
  counted AS (SELECT count(*)::int AS c FROM scoped)
  SELECT s.provider_slug, s.user_id, s.display_name, s.avatar_url, s.country_code,
         s.public_area, s.public_lat, s.public_lng, s.service_radius_km,
         round(s.distance_km::numeric, 1)::double precision, s.covers_location,
         s.price_from, s.languages, s.service_categories, s.years_experience,
         s.avg_response_minutes, s.identity_verified_badge, s.average_rating,
         s.total_reviews, s.completed_bookings, s.marketplace_score, s.relevance,
         (SELECT c FROM counted)
  FROM scoped s
  ORDER BY s.relevance DESC, s.distance_km ASC
  LIMIT lim;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_providers_public_geo_v1(double precision, double precision, double precision, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_providers_public_geo_v1(double precision, double precision, double precision, text, text, text, integer, integer) TO anon, authenticated, service_role;