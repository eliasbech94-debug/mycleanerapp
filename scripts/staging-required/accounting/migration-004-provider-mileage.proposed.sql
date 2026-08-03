-- Provider mileage & expenses — additive schema proposal (NOT applied to production).
-- Security goal: allowance amount and currency are ALWAYS derived server-side.
-- Even a direct authenticated INSERT/UPDATE cannot set them: the BEFORE trigger
-- recomputes both from the versioned mileage_country_rules row valid on the
-- travel date for the entry's country.

-- 1. Versioned country rules -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mileage_country_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  version text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  -- [{ "from_km": 0, "to_km": 20, "minor_per_km": 400 }, ...]
  rate_bands jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_transport_modes text[] NOT NULL DEFAULT ARRAY['own_car']::text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE (country_code, version)
);

CREATE INDEX IF NOT EXISTS mileage_country_rules_lookup_idx
  ON public.mileage_country_rules (country_code, valid_from DESC);

GRANT SELECT ON public.mileage_country_rules TO authenticated;
GRANT ALL ON public.mileage_country_rules TO service_role;
ALTER TABLE public.mileage_country_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active mileage rules are readable by signed-in users"
  ON public.mileage_country_rules FOR SELECT TO authenticated
  USING (status = 'active');

CREATE POLICY "Admins manage mileage rules"
  ON public.mileage_country_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Provider mileage entries -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_mileage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid,
  travel_date date NOT NULL,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  outbound_distance_km numeric(10,3) NOT NULL DEFAULT 0 CHECK (outbound_distance_km >= 0),
  return_distance_km numeric(10,3) NOT NULL DEFAULT 0 CHECK (return_distance_km >= 0),
  transport_mode text NOT NULL DEFAULT 'own_car',
  purpose text,
  notes text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  -- Server-derived columns. Never accept these from client input.
  estimated_allowance_amount bigint NOT NULL DEFAULT 0,   -- minor units
  currency text,
  country_rule_id uuid REFERENCES public.mileage_country_rules(id),
  country_rule_version text,
  calculation_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_mileage_entries_user_date_idx
  ON public.provider_mileage_entries (user_id, travel_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_mileage_entries TO authenticated;
GRANT ALL ON public.provider_mileage_entries TO service_role;
ALTER TABLE public.provider_mileage_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers read their own mileage entries"
  ON public.provider_mileage_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Providers create their own mileage entries"
  ON public.provider_mileage_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Providers update their own unlocked mileage entries"
  ON public.provider_mileage_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('draft', 'submitted'))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Providers delete their own draft mileage entries"
  ON public.provider_mileage_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft');

-- 3. Provider expenses ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  category_code text,
  description text,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  business_use_percentage integer CHECK (business_use_percentage BETWEEN 0 AND 100),
  has_documentation boolean NOT NULL DEFAULT false,
  receipt_id uuid,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_expenses_user_date_idx
  ON public.provider_expenses (user_id, transaction_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_expenses TO authenticated;
GRANT ALL ON public.provider_expenses TO service_role;
ALTER TABLE public.provider_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers read their own expenses"
  ON public.provider_expenses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Providers create their own expenses"
  ON public.provider_expenses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Providers update their own unlocked expenses"
  ON public.provider_expenses FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('draft', 'submitted'))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Providers delete their own draft expenses"
  ON public.provider_expenses FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft');

-- 4. Server-side allowance calculation ----------------------------------------
CREATE OR REPLACE FUNCTION public.calc_mileage_allowance_minor(
  _rule public.mileage_country_rules,
  _distance_km numeric
) RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  band jsonb;
  position_km numeric := 0;
  remaining numeric := _distance_km;
  consumed numeric;
  capacity numeric;
  total numeric := 0;
  matched boolean;
BEGIN
  IF _distance_km IS NULL OR _distance_km <= 0 THEN
    RETURN 0;
  END IF;

  WHILE remaining > 0 LOOP
    matched := false;
    FOR band IN
      SELECT value FROM jsonb_array_elements(_rule.rate_bands) AS t(value)
      ORDER BY (value->>'from_km')::numeric
    LOOP
      IF position_km >= (band->>'from_km')::numeric
         AND (band->>'to_km' IS NULL OR position_km < (band->>'to_km')::numeric) THEN
        capacity := CASE
          WHEN band->>'to_km' IS NULL THEN remaining
          ELSE (band->>'to_km')::numeric - position_km
        END;
        consumed := LEAST(remaining, capacity);
        total := total + consumed * (band->>'minor_per_km')::numeric;
        remaining := remaining - consumed;
        position_km := position_km + consumed;
        matched := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT matched THEN
      -- No band covers the remaining distance: do not guess an amount.
      RETURN 0;
    END IF;
  END LOOP;

  RETURN round(total)::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_mileage_entries_enforce_allowance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rule public.mileage_country_rules;
BEGIN
  -- Any client-supplied value is discarded up front.
  NEW.estimated_allowance_amount := 0;
  NEW.currency := NULL;
  NEW.country_rule_id := NULL;

  IF NEW.country_rule_version IS NOT NULL THEN
    SELECT * INTO rule FROM public.mileage_country_rules r
      WHERE r.country_code = NEW.country_code
        AND r.version = NEW.country_rule_version
        AND r.status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown_rule_version: % for %', NEW.country_rule_version, NEW.country_code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.travel_date < rule.valid_from
       OR (rule.valid_to IS NOT NULL AND NEW.travel_date > rule.valid_to) THEN
      RAISE EXCEPTION 'rule_version_not_valid_for_date: % on %', NEW.country_rule_version, NEW.travel_date
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT * INTO rule FROM public.mileage_country_rules r
      WHERE r.country_code = NEW.country_code
        AND r.status = 'active'
        AND NEW.travel_date >= r.valid_from
        AND (r.valid_to IS NULL OR NEW.travel_date <= r.valid_to)
      ORDER BY r.valid_from DESC
      LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no_rule_for_date: % on %', NEW.country_code, NEW.travel_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.country_rule_id := rule.id;
  NEW.country_rule_version := rule.version;
  NEW.currency := rule.currency;

  IF NEW.status = 'rejected' THEN
    NEW.calculation_code := 'entry_not_allowance_bearing';
    NEW.estimated_allowance_amount := 0;
  ELSIF NEW.transport_mode = 'public_transport'
        OR NOT (NEW.transport_mode = ANY (rule.allowed_transport_modes)) THEN
    NEW.calculation_code := 'transport_mode_not_eligible';
    NEW.estimated_allowance_amount := 0;
  ELSE
    NEW.calculation_code := 'resolved';
    NEW.estimated_allowance_amount := public.calc_mileage_allowance_minor(
      rule,
      COALESCE(NEW.outbound_distance_km, 0) + COALESCE(NEW.return_distance_km, 0)
    );
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_mileage_entries_enforce_allowance_trg
  ON public.provider_mileage_entries;
CREATE TRIGGER provider_mileage_entries_enforce_allowance_trg
  BEFORE INSERT OR UPDATE ON public.provider_mileage_entries
  FOR EACH ROW EXECUTE FUNCTION public.provider_mileage_entries_enforce_allowance();

DROP TRIGGER IF EXISTS provider_expenses_touch_updated_at_trg ON public.provider_expenses;
CREATE TRIGGER provider_expenses_touch_updated_at_trg
  BEFORE UPDATE ON public.provider_expenses
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS mileage_country_rules_touch_updated_at_trg ON public.mileage_country_rules;
CREATE TRIGGER mileage_country_rules_touch_updated_at_trg
  BEFORE UPDATE ON public.mileage_country_rules
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
