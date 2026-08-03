-- 1. Profile location fields (minimal, privacy-preserving)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_postcode text,
  ADD COLUMN IF NOT EXISTS location_radius_km integer,
  ADD COLUMN IF NOT EXISTS location_precision text,
  ADD COLUMN IF NOT EXISTS location_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_location_precision_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_location_precision_chk
      CHECK (location_precision IS NULL OR location_precision IN ('exact','city','country'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_location_radius_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_location_radius_chk
      CHECK (location_radius_km IS NULL OR (location_radius_km BETWEEN 1 AND 200));
  END IF;
END $$;

-- 2. Canonical city / area list per market
CREATE TABLE IF NOT EXISTS public.market_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  municipality text,
  postcode_prefixes text[] NOT NULL DEFAULT '{}',
  lat numeric(8,4),
  lng numeric(8,4),
  default_radius_km integer NOT NULL DEFAULT 25,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_places_country_chk CHECK (country_code = upper(country_code) AND length(country_code) = 2),
  CONSTRAINT market_places_radius_chk CHECK (default_radius_km BETWEEN 1 AND 200),
  CONSTRAINT market_places_country_slug_uniq UNIQUE (country_code, slug)
);

GRANT SELECT ON public.market_places TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_places TO authenticated;
GRANT ALL ON public.market_places TO service_role;
ALTER TABLE public.market_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_places_public_read_active" ON public.market_places;
CREATE POLICY "market_places_public_read_active"
  ON public.market_places FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "market_places_admin_read_all" ON public.market_places;
CREATE POLICY "market_places_admin_read_all"
  ON public.market_places FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "market_places_admin_write" ON public.market_places;
CREATE POLICY "market_places_admin_write"
  ON public.market_places FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 3. Admin-controlled local notices (promotions, legal, support)
CREATE TABLE IF NOT EXISTS public.market_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  city_slug text,
  kind text NOT NULL,
  locale text,
  title text NOT NULL,
  body text NOT NULL,
  source_name text,
  source_url text,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_notices_country_chk CHECK (country_code = upper(country_code) AND length(country_code) = 2),
  CONSTRAINT market_notices_kind_chk CHECK (kind IN ('promotion','legal','support','onboarding','availability'))
);

GRANT SELECT ON public.market_notices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_notices TO authenticated;
GRANT ALL ON public.market_notices TO service_role;
ALTER TABLE public.market_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_notices_public_read_published" ON public.market_notices;
CREATE POLICY "market_notices_public_read_published"
  ON public.market_notices FOR SELECT TO anon, authenticated
  USING (is_active = true AND published_at <= now() AND (expires_at IS NULL OR expires_at > now()));

DROP POLICY IF EXISTS "market_notices_admin_read_all" ON public.market_notices;
CREATE POLICY "market_notices_admin_read_all"
  ON public.market_notices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "market_notices_admin_write" ON public.market_notices;
CREATE POLICY "market_notices_admin_write"
  ON public.market_notices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 4. Waiting list for areas that are not live yet
CREATE TABLE IF NOT EXISTS public.market_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  country_code text NOT NULL,
  city text,
  postcode text,
  role_intent text,
  locale text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_waitlist_email_chk CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  CONSTRAINT market_waitlist_country_chk CHECK (country_code = upper(country_code) AND length(country_code) = 2),
  CONSTRAINT market_waitlist_city_chk CHECK (city IS NULL OR length(city) <= 120),
  CONSTRAINT market_waitlist_postcode_chk CHECK (postcode IS NULL OR length(postcode) <= 16),
  CONSTRAINT market_waitlist_role_chk CHECK (role_intent IS NULL OR role_intent IN ('customer','provider'))
);

CREATE UNIQUE INDEX IF NOT EXISTS market_waitlist_email_country_city_uniq
  ON public.market_waitlist (lower(email), country_code, coalesce(lower(city), ''));

GRANT INSERT ON public.market_waitlist TO anon;
GRANT SELECT, INSERT ON public.market_waitlist TO authenticated;
GRANT ALL ON public.market_waitlist TO service_role;
ALTER TABLE public.market_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_waitlist_public_signup" ON public.market_waitlist;
CREATE POLICY "market_waitlist_public_signup"
  ON public.market_waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "market_waitlist_admin_read" ON public.market_waitlist;
CREATE POLICY "market_waitlist_admin_read"
  ON public.market_waitlist FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 5. updated_at triggers
DROP TRIGGER IF EXISTS market_places_touch ON public.market_places;
CREATE TRIGGER market_places_touch BEFORE UPDATE ON public.market_places
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS market_notices_touch ON public.market_notices;
CREATE TRIGGER market_notices_touch BEFORE UPDATE ON public.market_notices
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE INDEX IF NOT EXISTS market_places_country_active_idx ON public.market_places (country_code, is_active, sort_order);
CREATE INDEX IF NOT EXISTS market_notices_lookup_idx ON public.market_notices (country_code, kind, is_active, published_at DESC);