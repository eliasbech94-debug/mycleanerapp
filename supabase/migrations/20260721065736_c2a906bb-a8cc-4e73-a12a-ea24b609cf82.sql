
-- ============================================================================
-- Dynamic Pricing — Phase 1 schema (disabled by default)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.pricing_demand_band AS ENUM
    ('very_low','low','normal','high','very_high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_mode AS ENUM ('static','dynamic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_quote_status AS ENUM
    ('quoted','locked','expired','superseded','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_quote_context AS ENUM
    ('customer_checkout','provider_preview','admin_preview');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.round_half_away(_x numeric)
RETURNS bigint
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN _x >= 0 THEN floor(_x + 0.5)::bigint
    ELSE -floor(-_x + 0.5)::bigint
  END;
$$;
REVOKE ALL ON FUNCTION public.round_half_away(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.round_half_away(numeric) TO authenticated, service_role;

-- ---------- dynamic_pricing_config -----------------------------------------
CREATE TABLE IF NOT EXISTS public.dynamic_pricing_config (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code               text NOT NULL,
  service_category           text,
  enabled                    boolean NOT NULL DEFAULT false,
  band_bps                   jsonb NOT NULL,
  band_thresholds            jsonb NOT NULL,
  surcharge_weekend_bps      int  NOT NULL DEFAULT 0,
  surcharge_holiday_bps      int  NOT NULL DEFAULT 0,
  surcharge_same_day_bps     int  NOT NULL DEFAULT 0,
  surcharge_urgent_bps       int  NOT NULL DEFAULT 0,
  same_day_hours             int  NOT NULL DEFAULT 24,
  urgent_hours               int  NOT NULL DEFAULT 6,
  max_total_adjustment_bps   int  NOT NULL DEFAULT 3000,
  min_supply_for_dynamic     int  NOT NULL DEFAULT 3,
  version                    int  NOT NULL DEFAULT 1,
  created_by                 uuid REFERENCES auth.users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dpc_country_upper CHECK (country_code = upper(country_code) AND length(country_code) = 2),
  CONSTRAINT dpc_surcharges_ok CHECK (
    surcharge_weekend_bps  BETWEEN 0 AND 10000 AND
    surcharge_holiday_bps  BETWEEN 0 AND 10000 AND
    surcharge_same_day_bps BETWEEN 0 AND 10000 AND
    surcharge_urgent_bps   BETWEEN 0 AND 10000 AND
    max_total_adjustment_bps BETWEEN 0 AND 10000 AND
    same_day_hours BETWEEN 0 AND 168 AND
    urgent_hours   BETWEEN 0 AND 48  AND
    min_supply_for_dynamic >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS dpc_country_default_uk
  ON public.dynamic_pricing_config(country_code)
  WHERE service_category IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dpc_country_category_uk
  ON public.dynamic_pricing_config(country_code, service_category)
  WHERE service_category IS NOT NULL;

GRANT ALL ON public.dynamic_pricing_config TO service_role;
ALTER TABLE public.dynamic_pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY dpc_admin_read ON public.dynamic_pricing_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY dpc_admin_write ON public.dynamic_pricing_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.dpc_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  vl int; lo int; no int; hi int;
  need_bands text[] := ARRAY['very_low','low','normal','high','very_high'];
  k text;
BEGIN
  IF NEW.band_thresholds IS NULL OR jsonb_typeof(NEW.band_thresholds) <> 'object' THEN
    RAISE EXCEPTION 'band_thresholds must be a JSON object';
  END IF;
  vl := (NEW.band_thresholds->>'very_low_max_bps')::int;
  lo := (NEW.band_thresholds->>'low_max_bps')::int;
  no := (NEW.band_thresholds->>'normal_max_bps')::int;
  hi := (NEW.band_thresholds->>'high_max_bps')::int;
  IF vl IS NULL OR lo IS NULL OR no IS NULL OR hi IS NULL THEN
    RAISE EXCEPTION 'band_thresholds must contain very_low_max_bps, low_max_bps, normal_max_bps, high_max_bps';
  END IF;
  IF NOT (vl BETWEEN 0 AND 1000000 AND lo BETWEEN 0 AND 1000000
      AND no BETWEEN 0 AND 1000000 AND hi BETWEEN 0 AND 1000000) THEN
    RAISE EXCEPTION 'band_thresholds must be finite non-negative integers <= 1000000';
  END IF;
  IF NOT (vl < lo AND lo < no AND no < hi) THEN
    RAISE EXCEPTION 'band_thresholds must be strictly increasing';
  END IF;
  IF NEW.band_bps IS NULL OR jsonb_typeof(NEW.band_bps) <> 'object' THEN
    RAISE EXCEPTION 'band_bps must be a JSON object';
  END IF;
  FOREACH k IN ARRAY need_bands LOOP
    IF (NEW.band_bps->>k) IS NULL THEN
      RAISE EXCEPTION 'band_bps missing key %', k;
    END IF;
    IF NOT ((NEW.band_bps->>k) ~ '^-?[0-9]+$') THEN
      RAISE EXCEPTION 'band_bps[%] must be an integer', k;
    END IF;
    IF abs((NEW.band_bps->>k)::int) > 10000 THEN
      RAISE EXCEPTION 'band_bps[%] out of range', k;
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dpc_validate ON public.dynamic_pricing_config;
CREATE TRIGGER trg_dpc_validate
  BEFORE INSERT OR UPDATE ON public.dynamic_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.dpc_validate();

-- ---------- provider_pricing_settings --------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_pricing_settings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code       text NOT NULL,
  service_category   text NOT NULL,
  enabled            boolean NOT NULL DEFAULT false,
  base_rate_minor    int  NOT NULL,
  min_rate_minor     int  NOT NULL,
  max_rate_minor     int  NOT NULL,
  allow_decrease     boolean NOT NULL DEFAULT true,
  allow_increase     boolean NOT NULL DEFAULT true,
  max_decrease_bps   int  NOT NULL DEFAULT 2000,
  max_increase_bps   int  NOT NULL DEFAULT 2000,
  currency           text NOT NULL,
  version            int  NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pps_country_upper CHECK (country_code = upper(country_code) AND length(country_code)=2),
  CONSTRAINT pps_currency_upper CHECK (currency = upper(currency) AND length(currency)=3),
  CONSTRAINT pps_bounds_ok  CHECK (
    min_rate_minor > 0 AND
    min_rate_minor <= base_rate_minor AND
    base_rate_minor <= max_rate_minor
  ),
  CONSTRAINT pps_bps_ok CHECK (
    max_decrease_bps BETWEEN 0 AND 10000 AND
    max_increase_bps BETWEEN 0 AND 10000
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS pps_provider_country_cat_uk
  ON public.provider_pricing_settings(provider_user_id, country_code, service_category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_pricing_settings TO authenticated;
GRANT ALL ON public.provider_pricing_settings TO service_role;
ALTER TABLE public.provider_pricing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY pps_owner_read ON public.provider_pricing_settings
  FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY pps_owner_write ON public.provider_pricing_settings
  FOR ALL TO authenticated
  USING (provider_user_id = auth.uid())
  WITH CHECK (provider_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.pps_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_pps_updated_at ON public.provider_pricing_settings;
CREATE TRIGGER trg_pps_updated_at BEFORE UPDATE ON public.provider_pricing_settings
  FOR EACH ROW EXECUTE FUNCTION public.pps_touch_updated_at();

-- ---------- pricing_calculations -------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_calculations (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_context                  public.pricing_quote_context NOT NULL,
  status                         public.pricing_quote_status  NOT NULL DEFAULT 'quoted',
  pricing_mode                   public.pricing_mode          NOT NULL,
  dynamic_pricing_applied        boolean NOT NULL,

  requester_user_id              uuid NOT NULL,
  customer_user_id               uuid,
  provider_user_id               uuid NOT NULL,
  provider_id_text               text NOT NULL,
  country_code                   text NOT NULL,
  service_category               text NOT NULL,
  currency                       text NOT NULL,
  start_at                       timestamptz NOT NULL,
  duration_minutes               int  NOT NULL,
  location_fingerprint           text NOT NULL,
  quote_context_key              text NOT NULL,

  provider_pricing_settings_id   uuid REFERENCES public.provider_pricing_settings(id),
  dynamic_pricing_config_id      uuid REFERENCES public.dynamic_pricing_config(id),
  provider_settings_version      int,
  config_version                 int,

  base_rate_minor                int NOT NULL,
  provider_min_rate_minor        int NOT NULL,
  provider_max_rate_minor        int NOT NULL,
  allow_decrease                 boolean NOT NULL,
  allow_increase                 boolean NOT NULL,

  supply_count                   int NOT NULL,
  demand_count                   int NOT NULL,
  demand_ratio_bps               int NOT NULL,
  demand_band                    public.pricing_demand_band NOT NULL,

  demand_band_bps                int NOT NULL,
  weekend_bps                    int NOT NULL,
  holiday_bps                    int NOT NULL,
  same_day_bps                   int NOT NULL,
  urgent_bps                     int NOT NULL,
  total_adjustment_bps           int NOT NULL,

  adjusted_rate_minor            int NOT NULL,
  clamped_rate_minor             int NOT NULL,
  hours_billed                   numeric NOT NULL,
  subtotal_minor                 int NOT NULL,
  commission_bps                 int NOT NULL,
  customer_half_bps              int NOT NULL,
  provider_half_bps              int NOT NULL,
  customer_total_minor           int NOT NULL,
  provider_net_minor             int NOT NULL,
  platform_fee_minor             int NOT NULL,

  booking_id                     uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  pricing_version                int NOT NULL DEFAULT 1,
  supersedes_id                  uuid REFERENCES public.pricing_calculations(id),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  expires_at                     timestamptz NOT NULL,
  locked_at                      timestamptz,
  fail_reason                    text,
  notes                          jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT pc_country_upper  CHECK (country_code = upper(country_code)),
  CONSTRAINT pc_currency_upper CHECK (currency = upper(currency)),
  CONSTRAINT pc_half_sum       CHECK (customer_half_bps + provider_half_bps = commission_bps),
  CONSTRAINT pc_amounts_ok     CHECK (
    subtotal_minor >= 0 AND customer_total_minor >= 0 AND provider_net_minor >= 0
    AND platform_fee_minor = customer_total_minor - provider_net_minor
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pc_active_context_uk
  ON public.pricing_calculations(quote_context_key)
  WHERE status = 'quoted' AND quote_context = 'customer_checkout';

CREATE UNIQUE INDEX IF NOT EXISTS pc_locked_booking_uk
  ON public.pricing_calculations(booking_id)
  WHERE status = 'locked';

CREATE INDEX IF NOT EXISTS pc_provider_created_idx
  ON public.pricing_calculations(provider_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pc_booking_idx
  ON public.pricing_calculations(booking_id) WHERE booking_id IS NOT NULL;

GRANT ALL ON public.pricing_calculations TO service_role;
ALTER TABLE public.pricing_calculations ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated on purpose.

CREATE OR REPLACE FUNCTION public.pc_enforce_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'locked' AND NEW.status <> 'locked' THEN
    RAISE EXCEPTION 'pricing_calculations: locked quotes are terminal (id=%)', OLD.id;
  END IF;
  IF OLD.status IN ('expired','superseded','void') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'pricing_calculations: cannot transition out of % (id=%)', OLD.status, OLD.id;
  END IF;
  IF OLD.status = 'quoted'
     AND NEW.status NOT IN ('quoted','locked','expired','superseded','void') THEN
    RAISE EXCEPTION 'pricing_calculations: invalid transition quoted -> %', NEW.status;
  END IF;

  IF ROW(
      NEW.quote_context, NEW.pricing_mode, NEW.dynamic_pricing_applied,
      NEW.requester_user_id, NEW.customer_user_id, NEW.provider_user_id,
      NEW.provider_id_text, NEW.country_code, NEW.service_category,
      NEW.currency, NEW.start_at, NEW.duration_minutes,
      NEW.location_fingerprint, NEW.quote_context_key,
      NEW.provider_pricing_settings_id, NEW.dynamic_pricing_config_id,
      NEW.provider_settings_version, NEW.config_version,
      NEW.base_rate_minor, NEW.provider_min_rate_minor, NEW.provider_max_rate_minor,
      NEW.allow_decrease, NEW.allow_increase,
      NEW.supply_count, NEW.demand_count, NEW.demand_ratio_bps, NEW.demand_band,
      NEW.demand_band_bps, NEW.weekend_bps, NEW.holiday_bps,
      NEW.same_day_bps, NEW.urgent_bps, NEW.total_adjustment_bps,
      NEW.adjusted_rate_minor, NEW.clamped_rate_minor, NEW.hours_billed,
      NEW.subtotal_minor, NEW.commission_bps, NEW.customer_half_bps,
      NEW.provider_half_bps, NEW.customer_total_minor, NEW.provider_net_minor,
      NEW.platform_fee_minor, NEW.pricing_version, NEW.created_at, NEW.expires_at
    ) IS DISTINCT FROM ROW(
      OLD.quote_context, OLD.pricing_mode, OLD.dynamic_pricing_applied,
      OLD.requester_user_id, OLD.customer_user_id, OLD.provider_user_id,
      OLD.provider_id_text, OLD.country_code, OLD.service_category,
      OLD.currency, OLD.start_at, OLD.duration_minutes,
      OLD.location_fingerprint, OLD.quote_context_key,
      OLD.provider_pricing_settings_id, OLD.dynamic_pricing_config_id,
      OLD.provider_settings_version, OLD.config_version,
      OLD.base_rate_minor, OLD.provider_min_rate_minor, OLD.provider_max_rate_minor,
      OLD.allow_decrease, OLD.allow_increase,
      OLD.supply_count, OLD.demand_count, OLD.demand_ratio_bps, OLD.demand_band,
      OLD.demand_band_bps, OLD.weekend_bps, OLD.holiday_bps,
      OLD.same_day_bps, OLD.urgent_bps, OLD.total_adjustment_bps,
      OLD.adjusted_rate_minor, OLD.clamped_rate_minor, OLD.hours_billed,
      OLD.subtotal_minor, OLD.commission_bps, OLD.customer_half_bps,
      OLD.provider_half_bps, OLD.customer_total_minor, OLD.provider_net_minor,
      OLD.platform_fee_minor, OLD.pricing_version, OLD.created_at, OLD.expires_at
    ) THEN
    RAISE EXCEPTION 'pricing_calculations: monetary/context columns are immutable (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pc_append_only ON public.pricing_calculations;
CREATE TRIGGER trg_pc_append_only
  BEFORE UPDATE ON public.pricing_calculations
  FOR EACH ROW EXECUTE FUNCTION public.pc_enforce_append_only();

-- ---------- bookings snapshot columns --------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pricing_mode              public.pricing_mode,
  ADD COLUMN IF NOT EXISTS dynamic_pricing_applied   boolean,
  ADD COLUMN IF NOT EXISTS pricing_calculation_id    uuid REFERENCES public.pricing_calculations(id),
  ADD COLUMN IF NOT EXISTS pricing_version           int,
  ADD COLUMN IF NOT EXISTS pricing_snapshot          jsonb;

CREATE OR REPLACE FUNCTION public.bookings_pricing_snapshot_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.pricing_snapshot IS NOT NULL THEN
    IF NEW.pricing_snapshot        IS DISTINCT FROM OLD.pricing_snapshot
    OR NEW.pricing_calculation_id  IS DISTINCT FROM OLD.pricing_calculation_id
    OR NEW.pricing_version         IS DISTINCT FROM OLD.pricing_version
    OR NEW.pricing_mode            IS DISTINCT FROM OLD.pricing_mode
    OR NEW.dynamic_pricing_applied IS DISTINCT FROM OLD.dynamic_pricing_applied THEN
      RAISE EXCEPTION 'bookings.pricing_snapshot is immutable once written (id=%)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_pricing_freeze ON public.bookings;
CREATE TRIGGER trg_bookings_pricing_freeze
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_pricing_snapshot_freeze();

-- ---------- Deterministic config resolver ----------------------------------
CREATE OR REPLACE FUNCTION public.resolve_dynamic_pricing_config(
  _country  text,
  _category text
) RETURNS public.dynamic_pricing_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM public.dynamic_pricing_config
  WHERE country_code = upper(_country)
    AND (service_category = _category OR service_category IS NULL)
  ORDER BY
    CASE WHEN service_category = _category THEN 0 ELSE 1 END,
    id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_dynamic_pricing_config(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_dynamic_pricing_config(text, text) TO service_role;

-- ---------- Atomic quote-lock RPC ------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_pricing_quote(
  _booking_id uuid,
  _quote_id   uuid
) RETURNS public.pricing_calculations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings%ROWTYPE;
  q public.pricing_calculations%ROWTYPE;
  snap jsonb;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF b.pricing_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'pricing_snapshot_already_locked';
  END IF;
  IF b.status::text <> 'pending' THEN
    RAISE EXCEPTION 'booking_not_pending:%', b.status;
  END IF;

  SELECT * INTO q FROM public.pricing_calculations WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote_not_found'; END IF;
  IF q.status <> 'quoted' THEN RAISE EXCEPTION 'quote_not_quotable:%', q.status; END IF;
  IF q.expires_at <= now() THEN RAISE EXCEPTION 'quote_expired'; END IF;
  IF q.quote_context <> 'customer_checkout' THEN
    RAISE EXCEPTION 'quote_context_not_lockable:%', q.quote_context;
  END IF;
  IF q.customer_user_id IS DISTINCT FROM b.customer_user_id
     OR q.provider_id_text <> b.provider_id
     OR upper(q.country_code) <> upper(coalesce(b.country_code, q.country_code))
     OR q.service_category <> b.service
     OR upper(q.currency) <> upper(b.currency)
     OR q.duration_minutes <> round(b.hours * 60)::int THEN
    RAISE EXCEPTION 'quote_context_mismatch';
  END IF;

  snap := jsonb_build_object(
    'quote_id', q.id,
    'pricing_version', q.pricing_version,
    'pricing_mode', q.pricing_mode,
    'dynamic_pricing_applied', q.dynamic_pricing_applied,
    'currency', q.currency,
    'country_code', q.country_code,
    'service_category', q.service_category,
    'start_at', q.start_at,
    'duration_minutes', q.duration_minutes,
    'hours_billed', q.hours_billed,
    'location_fingerprint', q.location_fingerprint,
    'quote_context_key', q.quote_context_key,
    'base_rate_minor', q.base_rate_minor,
    'provider_min_rate_minor', q.provider_min_rate_minor,
    'provider_max_rate_minor', q.provider_max_rate_minor,
    'allow_decrease', q.allow_decrease,
    'allow_increase', q.allow_increase,
    'provider_pricing_settings_id', q.provider_pricing_settings_id,
    'provider_settings_version', q.provider_settings_version,
    'config_version', q.config_version,
    'supply_count', q.supply_count,
    'demand_count', q.demand_count,
    'demand_ratio_bps', q.demand_ratio_bps,
    'demand_band', q.demand_band,
    'demand_band_bps', q.demand_band_bps,
    'weekend_bps', q.weekend_bps,
    'holiday_bps', q.holiday_bps,
    'same_day_bps', q.same_day_bps,
    'urgent_bps', q.urgent_bps,
    'total_adjustment_bps', q.total_adjustment_bps,
    'adjusted_rate_minor', q.adjusted_rate_minor,
    'clamped_rate_minor', q.clamped_rate_minor,
    'subtotal_minor', q.subtotal_minor,
    'commission_bps', q.commission_bps,
    'customer_half_bps', q.customer_half_bps,
    'provider_half_bps', q.provider_half_bps,
    'customer_total_minor', q.customer_total_minor,
    'provider_net_minor', q.provider_net_minor,
    'platform_fee_minor', q.platform_fee_minor
  );

  UPDATE public.pricing_calculations
     SET status = 'locked', locked_at = now(), booking_id = _booking_id
   WHERE id = q.id
   RETURNING * INTO q;

  UPDATE public.bookings
     SET pricing_calculation_id  = q.id,
         pricing_version         = q.pricing_version,
         pricing_mode            = q.pricing_mode,
         dynamic_pricing_applied = q.dynamic_pricing_applied,
         pricing_snapshot        = snap
   WHERE id = _booking_id;

  RETURN q;
END $$;
REVOKE ALL ON FUNCTION public.lock_pricing_quote(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_pricing_quote(uuid, uuid) TO service_role;

-- ---------- Expiry sweep ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_pricing_quotes()
RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH x AS (
    UPDATE public.pricing_calculations
       SET status = 'expired'
     WHERE status = 'quoted' AND expires_at <= now()
     RETURNING 1
  ) SELECT count(*)::int FROM x;
$$;
REVOKE ALL ON FUNCTION public.expire_pricing_quotes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pricing_quotes() TO service_role;

-- ---------- Feature flag row (disabled) ------------------------------------
INSERT INTO public.feature_flags (flag_key, scope, enabled, reason)
VALUES ('dynamic_pricing.enabled', 'global', false,
        'Phase 1 schema-only. Do not enable until Phase 2 admin UI + full rollout plan.')
ON CONFLICT DO NOTHING;
