-- Provider mileage ledger foundation.
-- Full home addresses stay in protected profile storage; this ledger stores privacy-safe labels only.

CREATE TABLE public.mileage_country_rules (
  country_code text NOT NULL,
  version integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  currency text NOT NULL,
  rate_per_km numeric(12,4),
  calculation_mode text NOT NULL DEFAULT 'distance_only'
    CHECK (calculation_mode IN ('distance_only', 'allowance_estimate')),
  legal_note text NOT NULL DEFAULT '',
  source_url text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country_code, version),
  CHECK (country_code = upper(country_code) AND char_length(country_code) = 2),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (rate_per_km IS NULL OR rate_per_km >= 0)
);

CREATE UNIQUE INDEX mileage_country_rules_one_active_per_country
  ON public.mileage_country_rules (country_code) WHERE is_active;

CREATE TABLE public.provider_mileage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  travel_date date NOT NULL,
  country_code text NOT NULL,
  country_rule_version integer,
  origin_type text NOT NULL DEFAULT 'registered_home'
    CHECK (origin_type IN ('registered_home','business_base','previous_booking','manual')),
  return_mode text NOT NULL DEFAULT 'return_to_origin'
    CHECK (return_mode IN ('return_to_origin','continue_to_next_booking','one_way','manual')),
  origin_label text NOT NULL,
  destination_label text NOT NULL,
  return_destination_label text,
  origin_place_id text,
  destination_place_id text,
  return_destination_place_id text,
  outbound_distance_km numeric(12,3) NOT NULL DEFAULT 0 CHECK (outbound_distance_km >= 0),
  return_distance_km numeric(12,3) NOT NULL DEFAULT 0 CHECK (return_distance_km >= 0),
  total_distance_km numeric(12,3)
    GENERATED ALWAYS AS (outbound_distance_km + return_distance_km) STORED,
  vehicle_type text NOT NULL DEFAULT 'private_car'
    CHECK (vehicle_type IN ('private_car','company_car','motorcycle','bicycle','public_transport','other')),
  business_purpose text NOT NULL DEFAULT 'Cleaning service booking',
  route_source text NOT NULL DEFAULT 'maps_api'
    CHECK (route_source IN ('maps_api','gps','manual','import')),
  route_provider text,
  route_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','confirmed','rejected','needs_review')),
  provider_confirmed_at timestamptz,
  manually_adjusted boolean NOT NULL DEFAULT false,
  adjustment_reason text,
  estimated_allowance_amount numeric(14,2),
  currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (country_code, country_rule_version)
    REFERENCES public.mileage_country_rules(country_code, version),
  CHECK (country_code = upper(country_code) AND char_length(country_code) = 2),
  CHECK (manually_adjusted = false OR nullif(btrim(adjustment_reason), '') IS NOT NULL)
);

CREATE UNIQUE INDEX provider_mileage_entries_one_per_booking
  ON public.provider_mileage_entries(provider_id, booking_id)
  WHERE booking_id IS NOT NULL AND status <> 'rejected';
CREATE INDEX provider_mileage_entries_provider_month_idx
  ON public.provider_mileage_entries(provider_id, travel_date DESC);

ALTER TABLE public.mileage_country_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_mileage_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mileage_country_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_mileage_entries TO authenticated;
GRANT ALL ON public.mileage_country_rules, public.provider_mileage_entries TO service_role;

CREATE POLICY "Authenticated users read mileage country rules"
  ON public.mileage_country_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Providers read own mileage entries"
  ON public.provider_mileage_entries FOR SELECT TO authenticated
  USING (public.user_owns_provider(provider_id));
CREATE POLICY "Providers create own mileage entries"
  ON public.provider_mileage_entries FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_provider(provider_id));
CREATE POLICY "Providers update own mileage entries"
  ON public.provider_mileage_entries FOR UPDATE TO authenticated
  USING (public.user_owns_provider(provider_id))
  WITH CHECK (public.user_owns_provider(provider_id));

CREATE FUNCTION public.enforce_mileage_entry_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  booking_provider text;
  booking_country text;
BEGIN
  NEW.country_code := upper(NEW.country_code);
  IF NEW.booking_id IS NOT NULL THEN
    SELECT provider_id, upper(coalesce(country_code, NEW.country_code))
      INTO booking_provider, booking_country
    FROM public.bookings WHERE id = NEW.booking_id;
    IF booking_provider IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
    IF booking_provider <> NEW.provider_id THEN RAISE EXCEPTION 'Provider does not own booking'; END IF;
    IF booking_country <> NEW.country_code THEN RAISE EXCEPTION 'Mileage country must match booking country'; END IF;
  END IF;
  IF NEW.vehicle_type = 'public_transport' THEN
    NEW.status := 'rejected';
    NEW.estimated_allowance_amount := NULL;
  END IF;
  IF NEW.status = 'confirmed' AND NEW.provider_confirmed_at IS NULL THEN
    NEW.provider_confirmed_at := now();
  ELSIF NEW.status <> 'confirmed' THEN
    NEW.provider_confirmed_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER enforce_mileage_entry_integrity_trigger
  BEFORE INSERT OR UPDATE ON public.provider_mileage_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mileage_entry_integrity();

CREATE VIEW public.provider_mileage_monthly_summary
WITH (security_invoker = true) AS
SELECT provider_id,
       date_trunc('month', travel_date)::date AS month,
       country_code,
       currency,
       count(*) FILTER (WHERE status = 'confirmed') AS confirmed_trips,
       count(*) FILTER (WHERE status IN ('proposed','needs_review')) AS pending_trips,
       coalesce(sum(total_distance_km) FILTER (WHERE status = 'confirmed'), 0)::numeric(14,3) AS confirmed_distance_km,
       coalesce(sum(estimated_allowance_amount) FILTER (WHERE status = 'confirmed'), 0)::numeric(14,2) AS estimated_allowance_amount
FROM public.provider_mileage_entries
GROUP BY provider_id, date_trunc('month', travel_date), country_code, currency;

GRANT SELECT ON public.provider_mileage_monthly_summary TO authenticated;
COMMENT ON COLUMN public.provider_mileage_entries.estimated_allowance_amount IS
  'Informational country-rule estimate only; not a final tax determination.';
