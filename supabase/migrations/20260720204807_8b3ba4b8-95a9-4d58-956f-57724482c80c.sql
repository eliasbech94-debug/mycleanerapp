
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS provider_slug text,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_bio text,
  ADD COLUMN IF NOT EXISTS equipment_badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS avg_response_minutes integer;

CREATE OR REPLACE FUNCTION public.gen_provider_slug(_display_name text, _user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE base text; candidate text; n int := 0;
BEGIN
  base := lower(coalesce(_display_name, 'cleaner'));
  base := translate(base, 'æøåäöüéèêáàâíìîóòôúùûñç', 'aoaaouëeeaaaiiioooúuunc');
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '(^-+|-+$)', '', 'g');
  IF base = '' THEN base := 'cleaner'; END IF;
  candidate := base;
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.provider_profiles WHERE provider_slug = candidate AND user_id <> _user_id);
    n := n + 1; candidate := base || '-' || n::text;
  END LOOP;
  RETURN candidate;
END;$$;
REVOKE ALL ON FUNCTION public.gen_provider_slug(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gen_provider_slug(text, uuid) TO service_role;

UPDATE public.provider_profiles SET provider_slug = public.gen_provider_slug(display_name, user_id) WHERE provider_slug IS NULL;
ALTER TABLE public.provider_profiles ALTER COLUMN provider_slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS provider_profiles_slug_uidx ON public.provider_profiles(provider_slug);

CREATE OR REPLACE FUNCTION public.set_provider_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.provider_slug IS NULL OR NEW.provider_slug = '' THEN
    NEW.provider_slug := public.gen_provider_slug(NEW.display_name, NEW.user_id);
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_set_provider_slug ON public.provider_profiles;
CREATE TRIGGER trg_set_provider_slug BEFORE INSERT ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_provider_slug();

CREATE TABLE IF NOT EXISTS public.customer_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider_id)
);
GRANT SELECT, INSERT, DELETE ON public.customer_favorites TO authenticated;
GRANT ALL ON public.customer_favorites TO service_role;
ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers select own favorites" ON public.customer_favorites FOR SELECT TO authenticated USING (auth.uid() = customer_id);
CREATE POLICY "customers insert own favorites" ON public.customer_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "customers delete own favorites" ON public.customer_favorites FOR DELETE TO authenticated USING (auth.uid() = customer_id);
CREATE INDEX IF NOT EXISTS customer_favorites_customer_idx ON public.customer_favorites(customer_id);
CREATE INDEX IF NOT EXISTS customer_favorites_provider_idx ON public.customer_favorites(provider_id);

CREATE OR REPLACE FUNCTION public.search_marketplace_providers_v1(
  _country_code text DEFAULT NULL,
  _service_category text DEFAULT NULL,
  _min_score integer DEFAULT NULL,
  _min_tier public.provider_tier DEFAULT NULL,
  _language text DEFAULT NULL,
  _max_hourly_rate integer DEFAULT NULL,
  _search text DEFAULT NULL,
  _sort text DEFAULT 'score',
  _limit integer DEFAULT 24,
  _offset integer DEFAULT 0
) RETURNS TABLE (
  provider_slug text, display_name text, avatar_url text,
  marketplace_score smallint, provider_tier public.provider_tier,
  country_code text, service_categories text[], languages text[],
  years_experience smallint, price_from integer, service_radius_km smallint,
  public_bio text, equipment_badges jsonb, avg_response_minutes integer,
  approximate_service_area jsonb, identity_verified_badge boolean,
  repeat_customer_badge boolean, average_rating numeric, total_reviews integer,
  completed_bookings integer, years_on_platform integer, total_count integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim integer := LEAST(GREATEST(coalesce(_limit, 24), 1), 100);
  off integer := GREATEST(coalesce(_offset, 0), 0);
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.user_id, p.provider_slug, p.display_name,
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
END;$$;

REVOKE ALL ON FUNCTION public.search_marketplace_providers_v1(text, text, integer, public.provider_tier, text, integer, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_marketplace_providers_v1(text, text, integer, public.provider_tier, text, integer, text, text, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_provider_profile_v1(_slug text)
RETURNS TABLE (
  provider_slug text, display_name text, avatar_url text,
  marketplace_score smallint, provider_tier public.provider_tier,
  country_code text, service_categories text[], languages text[],
  years_experience smallint, price_from integer, service_radius_km smallint,
  public_bio text, equipment_badges jsonb, avg_response_minutes integer,
  approximate_service_area jsonb, identity_verified_badge boolean,
  average_rating numeric, total_reviews integer,
  completed_bookings integer, years_on_platform integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.provider_slug, p.display_name, p.photo_path,
    p.provider_score, p.provider_tier, p.base_country_code,
    p.service_categories, p.languages, p.years_experience,
    p.hourly_rate, p.service_area_radius_km,
    p.public_bio, p.equipment_badges, p.avg_response_minutes,
    jsonb_build_object('country', p.base_country_code, 'radius_km', coalesce(p.service_area_radius_km, 10)),
    (p.identity_status = 'approved'),
    0::numeric, 0,
    COALESCE((SELECT count(*)::int FROM public.bookings b
      WHERE b.provider_id = p.user_id::text AND b.status::text = 'completed'), 0),
    GREATEST(0, EXTRACT(YEAR FROM age(now(), p.created_at))::int)
  FROM public.provider_profiles p
  WHERE p.provider_slug = _slug
    AND p.is_public = true
    AND p.status = 'active'
    AND p.visibility = 'public'
    AND coalesce(p.payout_frozen, false) = false
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_provider_profile_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_provider_profile_v1(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_favorite_providers_v1()
RETURNS TABLE (provider_slug text, provider_id uuid, added_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pp.provider_slug, f.provider_id, f.created_at
  FROM public.customer_favorites f
  JOIN public.provider_profiles pp ON pp.user_id = f.provider_id
  WHERE f.customer_id = auth.uid()
  ORDER BY f.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.list_favorite_providers_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_favorite_providers_v1() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.toggle_favorite_provider_v1(_provider_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); existed boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.customer_favorites WHERE customer_id = uid AND provider_id = _provider_id
    RETURNING true INTO existed;
  IF existed THEN RETURN false; END IF;
  INSERT INTO public.customer_favorites(customer_id, provider_id) VALUES (uid, _provider_id) ON CONFLICT DO NOTHING;
  RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.toggle_favorite_provider_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_favorite_provider_v1(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='provider_profiles') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_profiles';
  END IF;
END $$;
