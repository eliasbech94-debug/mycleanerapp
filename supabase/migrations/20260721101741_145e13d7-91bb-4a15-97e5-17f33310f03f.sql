
-- =========================================================================
-- Isolated marketplace pricing module (advisory / profile-facing only).
-- Does NOT touch dynamic_pricing_config, provider_pricing_settings,
-- pricing_calculations, bookings, or any checkout/payout paths.
-- =========================================================================

-- -------------------- market_pricing_rules --------------------
CREATE TABLE IF NOT EXISTS public.market_pricing_rules (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code              text NOT NULL,
  currency                  text NOT NULL,
  scope                     text NOT NULL CHECK (scope IN ('country','region','city','postcode')),
  region                    text,
  city                      text,
  postcode                  text,
  min_hourly_minor          integer NOT NULL CHECK (min_hourly_minor >= 0),
  max_hourly_minor          integer CHECK (max_hourly_minor IS NULL OR max_hourly_minor >= min_hourly_minor),
  recommended_hourly_minor  integer CHECK (recommended_hourly_minor IS NULL OR recommended_hourly_minor >= 0),
  active                    boolean NOT NULL DEFAULT true,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_rules_country_upper CHECK (country_code = upper(country_code) AND char_length(country_code) = 2),
  CONSTRAINT market_rules_currency_upper CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT market_rules_scope_fields CHECK (
    (scope = 'country'  AND region IS NULL AND city IS NULL AND postcode IS NULL) OR
    (scope = 'region'   AND region IS NOT NULL AND city IS NULL AND postcode IS NULL) OR
    (scope = 'city'     AND city IS NOT NULL AND postcode IS NULL) OR
    (scope = 'postcode' AND postcode IS NOT NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_pricing_rules TO authenticated;
GRANT ALL ON public.market_pricing_rules TO service_role;

-- Uniqueness across the hierarchy. COALESCE keeps NULLs distinct-safe.
CREATE UNIQUE INDEX IF NOT EXISTS market_pricing_rules_unique_scope
  ON public.market_pricing_rules (
    country_code,
    scope,
    COALESCE(lower(region),  ''),
    COALESCE(lower(city),    ''),
    COALESCE(postcode,       '')
  )
  WHERE active;

CREATE INDEX IF NOT EXISTS market_pricing_rules_country_active_idx
  ON public.market_pricing_rules (country_code, active);

ALTER TABLE public.market_pricing_rules ENABLE ROW LEVEL SECURITY;

-- Only admins can read the raw config; anon/providers get resolved values via RPC.
DROP POLICY IF EXISTS "Admins manage market rules" ON public.market_pricing_rules;
CREATE POLICY "Admins manage market rules"
  ON public.market_pricing_rules
  FOR ALL
  TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

-- Trigger: normalize empty strings to NULL and enforce uppercase country/currency
CREATE OR REPLACE FUNCTION public.market_rules_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.country_code := upper(btrim(NEW.country_code));
  NEW.currency     := upper(btrim(NEW.currency));
  NEW.region       := NULLIF(btrim(NEW.region), '');
  NEW.city         := NULLIF(btrim(NEW.city), '');
  NEW.postcode     := NULLIF(btrim(NEW.postcode), '');
  NEW.updated_at   := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_rules_normalize ON public.market_pricing_rules;
CREATE TRIGGER trg_market_rules_normalize
  BEFORE INSERT OR UPDATE ON public.market_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.market_rules_normalize();

-- -------------------- market_pricing_multipliers --------------------
CREATE TABLE IF NOT EXISTS public.market_pricing_multipliers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code   text NOT NULL,
  key            text NOT NULL,   -- e.g. weekend, holiday, emergency, season_summer, demand_high
  label          text,
  multiplier_bps integer NOT NULL CHECK (multiplier_bps BETWEEN -10000 AND 30000),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multipliers_country_upper CHECK (country_code = upper(country_code) AND char_length(country_code) = 2)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_pricing_multipliers TO authenticated;
GRANT ALL ON public.market_pricing_multipliers TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS market_pricing_multipliers_unique
  ON public.market_pricing_multipliers (country_code, key) WHERE active;

ALTER TABLE public.market_pricing_multipliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage multipliers" ON public.market_pricing_multipliers;
CREATE POLICY "Admins manage multipliers"
  ON public.market_pricing_multipliers
  FOR ALL
  TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

DROP TRIGGER IF EXISTS trg_market_multipliers_updated ON public.market_pricing_multipliers;
CREATE TRIGGER trg_market_multipliers_updated
  BEFORE UPDATE ON public.market_pricing_multipliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------- provider_pricing_preferences --------------------
CREATE TABLE IF NOT EXISTS public.provider_pricing_preferences (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code            text NOT NULL,
  currency                text NOT NULL,
  region                  text,
  city                    text,
  postcode                text,
  hourly_rate_minor       integer NOT NULL CHECK (hourly_rate_minor > 0),
  smart_pricing_enabled   boolean NOT NULL DEFAULT false,
  smart_min_minor         integer CHECK (smart_min_minor IS NULL OR smart_min_minor > 0),
  smart_max_minor         integer CHECK (smart_max_minor IS NULL OR smart_max_minor > 0),
  matched_scope           text,
  resolved_min_minor      integer,
  resolved_max_minor      integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ppp_country_upper CHECK (country_code = upper(country_code) AND char_length(country_code) = 2),
  CONSTRAINT ppp_currency_upper CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT ppp_smart_bounds CHECK (
    NOT smart_pricing_enabled OR (
      smart_min_minor IS NOT NULL
      AND smart_max_minor IS NOT NULL
      AND smart_max_minor >= smart_min_minor
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_pricing_preferences TO authenticated;
GRANT ALL ON public.provider_pricing_preferences TO service_role;

ALTER TABLE public.provider_pricing_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers read own pricing prefs" ON public.provider_pricing_preferences;
CREATE POLICY "Providers read own pricing prefs"
  ON public.provider_pricing_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_only(auth.uid()));

-- Writes are only allowed through save_provider_pricing() — block direct writes
-- from non-service, non-admin roles to keep validation authoritative.
DROP POLICY IF EXISTS "Admins write pricing prefs" ON public.provider_pricing_preferences;
CREATE POLICY "Admins write pricing prefs"
  ON public.provider_pricing_preferences
  FOR ALL TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

DROP TRIGGER IF EXISTS trg_ppp_updated ON public.provider_pricing_preferences;
CREATE TRIGGER trg_ppp_updated
  BEFORE UPDATE ON public.provider_pricing_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- RPCs (hardened SECURITY DEFINER)
-- =========================================================================

-- resolve_market_minimum: postcode → city → region → country
CREATE OR REPLACE FUNCTION public.resolve_market_minimum(
  _country_code text,
  _region       text DEFAULT NULL,
  _city         text DEFAULT NULL,
  _postcode     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country  text := upper(btrim(coalesce(_country_code, '')));
  v_region   text := NULLIF(btrim(coalesce(_region, '')), '');
  v_city     text := NULLIF(btrim(coalesce(_city, '')), '');
  v_postcode text := NULLIF(btrim(coalesce(_postcode, '')), '');
  r          public.market_pricing_rules;
BEGIN
  IF v_country IS NULL OR char_length(v_country) <> 2 THEN
    RAISE EXCEPTION 'invalid_country_code';
  END IF;

  -- postcode
  IF v_postcode IS NOT NULL THEN
    SELECT * INTO r FROM public.market_pricing_rules
     WHERE active AND country_code = v_country
       AND scope = 'postcode' AND postcode = v_postcode
     LIMIT 1;
    IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'postcode'); END IF;
  END IF;

  -- city
  IF v_city IS NOT NULL THEN
    SELECT * INTO r FROM public.market_pricing_rules
     WHERE active AND country_code = v_country
       AND scope = 'city' AND lower(city) = lower(v_city)
     LIMIT 1;
    IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'city'); END IF;
  END IF;

  -- region
  IF v_region IS NOT NULL THEN
    SELECT * INTO r FROM public.market_pricing_rules
     WHERE active AND country_code = v_country
       AND scope = 'region' AND lower(region) = lower(v_region)
     LIMIT 1;
    IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'region'); END IF;
  END IF;

  -- country
  SELECT * INTO r FROM public.market_pricing_rules
   WHERE active AND country_code = v_country AND scope = 'country'
   LIMIT 1;
  IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'country'); END IF;

  RETURN jsonb_build_object(
    'matched_scope', NULL,
    'country_code', v_country,
    'currency', NULL,
    'min_minor', NULL,
    'max_minor', NULL,
    'recommended_minor', NULL,
    'error', 'no_active_rule'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._market_rule_to_jsonb(r public.market_pricing_rules, _matched text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'matched_scope', _matched,
    'country_code', r.country_code,
    'currency', r.currency,
    'region', r.region,
    'city', r.city,
    'postcode', r.postcode,
    'min_minor', r.min_hourly_minor,
    'max_minor', r.max_hourly_minor,
    'recommended_minor', r.recommended_hourly_minor
  );
$$;

REVOKE ALL ON FUNCTION public.resolve_market_minimum(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_market_minimum(text, text, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._market_rule_to_jsonb(public.market_pricing_rules, text) FROM PUBLIC;

-- save_provider_pricing: authoritative validation
CREATE OR REPLACE FUNCTION public.save_provider_pricing(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor          uuid := auth.uid();
  is_admin       boolean;
  target_user    uuid;
  is_provider    boolean;
  v_country      text;
  v_region       text;
  v_city         text;
  v_postcode     text;
  v_hourly       integer;
  v_smart_on     boolean;
  v_smart_min    integer;
  v_smart_max    integer;
  resolved       jsonb;
  rmin           integer;
  rmax           integer;
  rcurr          text;
  rscope         text;
  row            public.provider_pricing_preferences;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  is_admin := public.is_admin_only(actor);

  -- Never trust supplied user_id unless caller is admin
  target_user := COALESCE(NULLIF(_payload->>'user_id','')::uuid, actor);
  IF target_user <> actor AND NOT is_admin THEN
    RAISE EXCEPTION 'forbidden_other_user' USING ERRCODE = '42501';
  END IF;

  -- Provider role required
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = target_user AND role = 'provider'::public.app_role
  ) INTO is_provider;
  IF NOT is_provider THEN
    RAISE EXCEPTION 'not_a_provider' USING ERRCODE = '42501';
  END IF;

  v_country   := upper(btrim(coalesce(_payload->>'country_code','')));
  v_region    := NULLIF(btrim(coalesce(_payload->>'region','')), '');
  v_city      := NULLIF(btrim(coalesce(_payload->>'city','')), '');
  v_postcode  := NULLIF(btrim(coalesce(_payload->>'postcode','')), '');
  v_hourly    := NULLIF(_payload->>'hourly_rate_minor','')::integer;
  v_smart_on  := COALESCE((_payload->>'smart_pricing_enabled')::boolean, false);
  v_smart_min := NULLIF(_payload->>'smart_min_minor','')::integer;
  v_smart_max := NULLIF(_payload->>'smart_max_minor','')::integer;

  IF char_length(v_country) <> 2 THEN RAISE EXCEPTION 'invalid_country_code'; END IF;
  IF v_hourly IS NULL OR v_hourly <= 0 THEN RAISE EXCEPTION 'invalid_hourly_rate'; END IF;

  resolved := public.resolve_market_minimum(v_country, v_region, v_city, v_postcode);
  IF (resolved->>'error') IS NOT NULL THEN
    RAISE EXCEPTION 'no_active_market_rule';
  END IF;

  rmin   := NULLIF(resolved->>'min_minor','')::integer;
  rmax   := NULLIF(resolved->>'max_minor','')::integer;
  rcurr  := resolved->>'currency';
  rscope := resolved->>'matched_scope';

  IF rmin IS NULL OR rcurr IS NULL THEN
    RAISE EXCEPTION 'invalid_resolved_rule';
  END IF;

  -- Currency always derived from market, submitted currency is ignored.
  IF v_hourly < rmin THEN
    RAISE EXCEPTION 'below_market_minimum:%', rmin;
  END IF;
  IF rmax IS NOT NULL AND v_hourly > rmax THEN
    RAISE EXCEPTION 'above_market_maximum:%', rmax;
  END IF;

  IF v_smart_on THEN
    IF v_smart_min IS NULL OR v_smart_max IS NULL THEN
      RAISE EXCEPTION 'smart_bounds_required';
    END IF;
    IF v_smart_min < rmin THEN
      RAISE EXCEPTION 'smart_min_below_market:%', rmin;
    END IF;
    IF rmax IS NOT NULL AND v_smart_max > rmax THEN
      RAISE EXCEPTION 'smart_max_above_market:%', rmax;
    END IF;
    IF v_smart_max < v_smart_min THEN
      RAISE EXCEPTION 'smart_max_below_min';
    END IF;
  ELSE
    v_smart_min := NULL;
    v_smart_max := NULL;
  END IF;

  INSERT INTO public.provider_pricing_preferences (
    user_id, country_code, currency, region, city, postcode,
    hourly_rate_minor, smart_pricing_enabled, smart_min_minor, smart_max_minor,
    matched_scope, resolved_min_minor, resolved_max_minor
  ) VALUES (
    target_user, v_country, rcurr, v_region, v_city, v_postcode,
    v_hourly, v_smart_on, v_smart_min, v_smart_max,
    rscope, rmin, rmax
  )
  ON CONFLICT (user_id) DO UPDATE SET
    country_code = EXCLUDED.country_code,
    currency = EXCLUDED.currency,
    region = EXCLUDED.region,
    city = EXCLUDED.city,
    postcode = EXCLUDED.postcode,
    hourly_rate_minor = EXCLUDED.hourly_rate_minor,
    smart_pricing_enabled = EXCLUDED.smart_pricing_enabled,
    smart_min_minor = EXCLUDED.smart_min_minor,
    smart_max_minor = EXCLUDED.smart_max_minor,
    matched_scope = EXCLUDED.matched_scope,
    resolved_min_minor = EXCLUDED.resolved_min_minor,
    resolved_max_minor = EXCLUDED.resolved_max_minor,
    updated_at = now()
  RETURNING * INTO row;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', row.user_id,
    'currency', row.currency,
    'hourly_rate_minor', row.hourly_rate_minor,
    'resolved', resolved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_provider_pricing(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_provider_pricing(jsonb) TO authenticated, service_role;

-- compute_recommended_price: deterministic first version
CREATE OR REPLACE FUNCTION public.compute_recommended_price(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor          uuid := auth.uid();
  is_admin       boolean;
  pp             public.provider_profiles;
  prefs          public.provider_pricing_preferences;
  resolved       jsonb;
  rmin           integer;
  rmax           integer;
  rrec           integer;
  rcurr          text;
  nearby_avg     integer;
  sample_size    integer := 0;
  competitors    integer := 0;
  matched_scope  text := 'country';
  method         text := 'country_fallback';
  recommended    integer;
  demand_level   text := 'normal';
  indicator      text;
  confidence     text := 'low';
  fallback_reason text := NULL;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  is_admin := public.is_admin_only(actor);
  IF _user_id <> actor AND NOT is_admin THEN
    RAISE EXCEPTION 'forbidden_other_user' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;

  SELECT * INTO prefs FROM public.provider_pricing_preferences WHERE user_id = _user_id;

  resolved := public.resolve_market_minimum(
    COALESCE(prefs.country_code, pp.base_country_code),
    prefs.region,
    prefs.city,
    prefs.postcode
  );
  IF (resolved->>'error') IS NOT NULL THEN
    RETURN jsonb_build_object('error','no_active_market_rule');
  END IF;
  rmin  := (resolved->>'min_minor')::integer;
  rmax  := NULLIF(resolved->>'max_minor','')::integer;
  rrec  := NULLIF(resolved->>'recommended_minor','')::integer;
  rcurr := resolved->>'currency';
  matched_scope := resolved->>'matched_scope';

  -- Count nearby active providers in the same country (city text fallback;
  -- geocoded radius comes later once base_lat/base_lng coverage is guaranteed).
  SELECT count(*)::int INTO competitors
    FROM public.provider_profiles p2
   WHERE p2.user_id <> _user_id
     AND p2.status = 'active'
     AND upper(coalesce(p2.base_country_code,'')) = resolved->>'country_code';

  -- Fallback recommendation chain: postcode rec → city rec → region rec → country rec
  IF rrec IS NOT NULL THEN
    recommended := rrec;
    method := 'configured_recommended_' || matched_scope;
    confidence := 'medium';
  ELSE
    recommended := GREATEST(rmin, COALESCE(rmax, rmin));
    method := 'market_minimum_fallback';
    fallback_reason := 'no_recommended_configured';
    confidence := 'low';
  END IF;

  -- Nearby average is a placeholder derived from configured recommended when
  -- bookings history is not yet available for this module.
  nearby_avg := recommended;

  -- Demand indicator: relative to competitor count buckets (deterministic)
  IF competitors <= 2 THEN demand_level := 'high';
  ELSIF competitors <= 10 THEN demand_level := 'normal';
  ELSE demand_level := 'low';
  END IF;

  -- Indicator vs. provider's currently saved rate
  IF prefs.hourly_rate_minor IS NULL THEN
    indicator := 'recommended';
  ELSIF prefs.hourly_rate_minor < recommended * 0.9 THEN
    indicator := 'very_competitive';
  ELSIF prefs.hourly_rate_minor <= recommended * 1.05 THEN
    indicator := 'recommended';
  ELSIF prefs.hourly_rate_minor <= recommended * 1.2 THEN
    indicator := 'premium';
  ELSE
    indicator := 'high';
  END IF;

  RETURN jsonb_build_object(
    'currency', rcurr,
    'recommended_minor', recommended,
    'nearby_avg_minor', nearby_avg,
    'demand_level', demand_level,
    'competition_score', competitors,
    'indicator', indicator,
    'matched_scope', matched_scope,
    'method', method,
    'data_confidence', confidence,
    'sample_size', sample_size,
    'fallback_reason', fallback_reason,
    'signals', jsonb_build_object(
      'competitors_active_country', competitors,
      'market_min_minor', rmin,
      'market_max_minor', rmax
    ),
    'disclaimer', 'Advisory recommendation. Automatic price adjustment activates in a future phase.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_recommended_price(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_recommended_price(uuid) TO authenticated, service_role;

-- =========================================================================
-- Seed data (idempotent)
-- =========================================================================
INSERT INTO public.market_pricing_rules
  (country_code, currency, scope, min_hourly_minor, recommended_hourly_minor, notes)
VALUES
  ('DK','DKK','country', 25000, 27500, 'Marketplace configuration default (not statutory minimum wage)'),
  ('GB','GBP','country',  2500,  2800, 'Marketplace configuration default (not statutory minimum wage)'),
  ('SE','SEK','country', 32000, 35000, 'Marketplace configuration default (not statutory minimum wage)'),
  ('ES','EUR','country',  1600,  1800, 'Marketplace configuration default (not statutory minimum wage)')
ON CONFLICT DO NOTHING;

INSERT INTO public.market_pricing_rules
  (country_code, currency, scope, city, min_hourly_minor, recommended_hourly_minor, notes)
VALUES
  ('DK','DKK','city','Copenhagen', 29500, 31500, 'Marketplace configuration default')
ON CONFLICT DO NOTHING;

INSERT INTO public.market_pricing_rules
  (country_code, currency, scope, city, postcode, min_hourly_minor, recommended_hourly_minor, notes)
VALUES
  ('DK','DKK','postcode','Copenhagen','1050', 31500, 33000, 'Marketplace configuration default')
ON CONFLICT DO NOTHING;

INSERT INTO public.market_pricing_multipliers (country_code, key, label, multiplier_bps)
VALUES
  ('DK','weekend','Weekend',     1000),
  ('DK','holiday','Holiday',     1500),
  ('DK','emergency','Emergency', 3000),
  ('DK','demand_high','High demand', 1200)
ON CONFLICT DO NOTHING;
