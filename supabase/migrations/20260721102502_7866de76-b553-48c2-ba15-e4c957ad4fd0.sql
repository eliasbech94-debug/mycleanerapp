
-- 1. Data API grants (RLS enforces the real access rules)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_pricing_rules TO authenticated;
GRANT ALL ON public.market_pricing_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_pricing_multipliers TO authenticated;
GRANT ALL ON public.market_pricing_multipliers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_pricing_preferences TO authenticated;
GRANT ALL ON public.provider_pricing_preferences TO service_role;

-- 2. Performance indexes for resolver + admin list
CREATE INDEX IF NOT EXISTS market_rules_scope_lookup_idx
  ON public.market_pricing_rules (country_code, scope, active);
CREATE INDEX IF NOT EXISTS market_rules_city_lower_idx
  ON public.market_pricing_rules (country_code, lower(city))
  WHERE scope = 'city' AND active;
CREATE INDEX IF NOT EXISTS market_rules_region_lower_idx
  ON public.market_pricing_rules (country_code, lower(region))
  WHERE scope = 'region' AND active;
CREATE INDEX IF NOT EXISTS market_rules_postcode_idx
  ON public.market_pricing_rules (country_code, postcode)
  WHERE scope = 'postcode' AND active;
CREATE INDEX IF NOT EXISTS market_multipliers_active_idx
  ON public.market_pricing_multipliers (country_code, active);

-- 3. Enhanced recommendation engine that applies admin multipliers
CREATE OR REPLACE FUNCTION public.compute_recommended_price(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor           uuid := auth.uid();
  is_admin        boolean;
  pp              public.provider_profiles;
  prefs           public.provider_pricing_preferences;
  resolved        jsonb;
  rmin            integer;
  rmax            integer;
  rrec            integer;
  rcurr           text;
  competitors     integer := 0;
  matched_scope   text := 'country';
  method          text := 'country_fallback';
  base_price      integer;
  recommended     integer;
  nearby_avg      integer;
  demand_level    text := 'normal';
  indicator       text;
  confidence      text := 'low';
  fallback_reason text := NULL;
  applied         jsonb := '[]'::jsonb;
  eff_bps         integer := 0;
  m               record;
  seasonal_key    text;
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

  -- Competition score: active providers in same country (city/region radius comes with geo data)
  SELECT count(*)::int INTO competitors
    FROM public.provider_profiles p2
   WHERE p2.user_id <> _user_id
     AND p2.status = 'active'
     AND upper(coalesce(p2.base_country_code,'')) = resolved->>'country_code';

  -- Demand bucket (deterministic)
  IF competitors <= 2 THEN demand_level := 'high';
  ELSIF competitors <= 10 THEN demand_level := 'normal';
  ELSE demand_level := 'low';
  END IF;

  -- Base configured recommendation (before multipliers)
  IF rrec IS NOT NULL THEN
    base_price := rrec;
    method := 'configured_recommended_' || matched_scope;
    confidence := 'medium';
  ELSE
    base_price := GREATEST(rmin, COALESCE(rmax, rmin));
    method := 'market_minimum_fallback';
    fallback_reason := 'no_recommended_configured';
    confidence := 'low';
  END IF;

  -- Apply admin multipliers by key.  We compute an EFFECTIVE bps rather
  -- than compounding, so admins can reason about the total uplift.
  seasonal_key := CASE
    WHEN EXTRACT(MONTH FROM now()) IN (12,1,2) THEN 'seasonal_winter'
    WHEN EXTRACT(MONTH FROM now()) IN (6,7,8) THEN 'seasonal_summer'
    ELSE NULL
  END;

  FOR m IN
    SELECT key, label, multiplier_bps
      FROM public.market_pricing_multipliers
     WHERE active
       AND country_code = resolved->>'country_code'
       AND key IN ('weekend','holiday','emergency','demand_'||demand_level, seasonal_key)
  LOOP
    eff_bps := eff_bps + m.multiplier_bps;
    applied := applied || jsonb_build_object(
      'key', m.key, 'label', m.label, 'bps', m.multiplier_bps
    );
  END LOOP;

  recommended := GREATEST(
    rmin,
    LEAST(
      COALESCE(rmax, base_price + (base_price * eff_bps) / 10000),
      base_price + (base_price * eff_bps) / 10000
    )
  );

  nearby_avg := base_price;

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
    'base_recommended_minor', base_price,
    'nearby_avg_minor', nearby_avg,
    'demand_level', demand_level,
    'competition_score', competitors,
    'indicator', indicator,
    'matched_scope', matched_scope,
    'method', method,
    'data_confidence', confidence,
    'sample_size', 0,
    'fallback_reason', fallback_reason,
    'applied_multipliers', applied,
    'multiplier_bps_total', eff_bps,
    'signals', jsonb_build_object(
      'competitors_active_country', competitors,
      'market_min_minor', rmin,
      'market_max_minor', rmax,
      'seasonal_key', seasonal_key
    ),
    'disclaimer', 'Advisory recommendation. Automatic price adjustment activates in a future phase.'
  );
END;
$function$;

-- 4. Broader default multipliers (idempotent)
INSERT INTO public.market_pricing_multipliers (country_code, key, label, multiplier_bps, active) VALUES
  ('DK','weekend','Weekend', 1000, true),
  ('DK','holiday','Holiday', 1500, true),
  ('DK','emergency','Emergency', 3000, true),
  ('DK','seasonal_winter','Winter season', 800, true),
  ('DK','seasonal_summer','Summer season', 500, true),
  ('DK','demand_low','Low demand', -500, true),
  ('DK','demand_high','High demand', 1200, true),
  ('GB','weekend','Weekend', 1000, true),
  ('GB','holiday','Holiday', 1500, true),
  ('GB','emergency','Emergency', 3000, true),
  ('GB','demand_high','High demand', 1200, true),
  ('SE','weekend','Weekend', 1000, true),
  ('SE','holiday','Holiday', 1500, true),
  ('SE','emergency','Emergency', 3000, true),
  ('SE','demand_high','High demand', 1200, true),
  ('ES','weekend','Weekend', 1000, true),
  ('ES','holiday','Holiday', 1500, true),
  ('ES','emergency','Emergency', 3000, true),
  ('ES','demand_high','High demand', 1200, true)
ON CONFLICT DO NOTHING;
