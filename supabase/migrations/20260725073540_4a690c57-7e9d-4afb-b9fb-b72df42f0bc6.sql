-- Phase A.1 — Acquisition attribution columns on bookings (contract data only)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS acquisition_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS acquisition_provider_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_acquisition_source_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_acquisition_source_check
      CHECK (acquisition_source IN (
        'marketplace',
        'provider_direct_link',
        'provider_qr_code',
        'provider_social_share',
        'provider_embedded_widget',
        'unknown'
      ));
  END IF;
END$$;

COMMENT ON COLUMN public.bookings.acquisition_source IS
  'Contract/fee attribution channel. Strictly-necessary field, retained with the booking (financial retention).';
COMMENT ON COLUMN public.bookings.acquisition_provider_id IS
  'Provider whose share link brought the customer. May equal provider_id or differ (rare).';

-- Phase A.2 — Rewrite public profile RPC without fabricated ratings.
-- Same signature; average_rating and total_reviews now return NULL until a real reviews source is wired.
DROP FUNCTION IF EXISTS public.get_public_provider_profile_v1(text);
CREATE OR REPLACE FUNCTION public.get_public_provider_profile_v1(_slug text)
RETURNS TABLE (
  provider_slug text, display_name text, avatar_url text,
  marketplace_score smallint, provider_tier public.provider_tier,
  country_code text, service_categories text[], languages text[],
  years_experience smallint, price_from integer, service_radius_km smallint,
  public_bio text, equipment_badges jsonb, avg_response_minutes integer,
  approximate_service_area jsonb, identity_verified_badge boolean,
  average_rating numeric, total_reviews integer,
  completed_bookings integer, years_on_platform integer,
  insurance_valid boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.provider_slug,
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
    NULL::numeric,        -- average_rating: no authoritative reviews source yet
    NULL::integer,        -- total_reviews: hide until real
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
$$;

REVOKE ALL ON FUNCTION public.get_public_provider_profile_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_provider_profile_v1(text)
  TO anon, authenticated, service_role;

-- Phase A.3 — Bookable-only availability lookup, scoped to one provider.
-- Simple deterministic model: hourly slots 08:00–18:00 in the market's local
-- interpretation (UTC-stored; presentation converts). Excludes days already
-- carrying a non-cancelled booking on the same date. Caps at 14 days.
CREATE OR REPLACE FUNCTION public.list_provider_bookable_slots_v1(
  _slug text,
  _from date,
  _to   date
)
RETURNS TABLE (
  slot_date date,
  slot_hour smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_from date;
  v_to   date;
BEGIN
  SELECT p.user_id INTO v_user_id
    FROM public.provider_profiles p
   WHERE p.provider_slug = _slug
     AND p.is_public   = true
     AND p.status      = 'active'
     AND p.visibility  = 'public'
     AND coalesce(p.payout_frozen, false) = false
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  v_from := GREATEST(_from, current_date);
  v_to   := LEAST(_to,   current_date + INTERVAL '14 days');
  IF v_from > v_to THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT d::date AS day
      FROM generate_series(v_from, v_to, INTERVAL '1 day') AS d
  ),
  taken AS (
    SELECT b.booking_date, b.slot
      FROM public.bookings b
     WHERE b.provider_id = v_user_id::text
       AND b.booking_date BETWEEN v_from AND v_to
       AND b.status::text NOT IN ('cancelled', 'rejected', 'expired')
  ),
  slots AS (
    SELECT d.day, h::smallint AS hour
      FROM days d
      CROSS JOIN generate_series(8, 17) AS h
  )
  SELECT s.day, s.hour
    FROM slots s
   WHERE NOT EXISTS (
           SELECT 1 FROM taken t
            WHERE t.booking_date = s.day
              AND t.slot = lpad(s.hour::text, 2, '0') || ':00'
         )
     AND (
       s.day > current_date
       OR (s.day = current_date AND s.hour > EXTRACT(hour FROM now() AT TIME ZONE 'UTC')::int + 1)
     )
   ORDER BY s.day, s.hour;
END;
$$;

REVOKE ALL ON FUNCTION public.list_provider_bookable_slots_v1(text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_provider_bookable_slots_v1(text, date, date)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.list_provider_bookable_slots_v1(text, date, date) IS
  'Public bookable-slot lookup for a single provider. Never returns event ids, other bookings, blocked events, customer data or external calendar details.';