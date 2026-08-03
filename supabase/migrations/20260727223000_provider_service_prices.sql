CREATE TABLE IF NOT EXISTS public.provider_service_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_code text NOT NULL CHECK (service_code IN (
    'home_cleaning','deep_cleaning','move_out_cleaning','office_cleaning','window_cleaning'
  )),
  pricing_unit text NOT NULL DEFAULT 'hour' CHECK (pricing_unit IN ('hour','fixed','m2')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency IN ('DKK','SEK','EUR','GBP')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_code)
);

ALTER TABLE public.provider_service_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers read own service prices"
  ON public.provider_service_prices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "providers insert own service prices"
  ON public.provider_service_prices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "providers update own service prices"
  ON public.provider_service_prices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "providers delete own service prices"
  ON public.provider_service_prices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_provider_service_price_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_provider_service_prices_updated_at ON public.provider_service_prices;
CREATE TRIGGER trg_provider_service_prices_updated_at
BEFORE UPDATE ON public.provider_service_prices
FOR EACH ROW EXECUTE FUNCTION public.touch_provider_service_price_updated_at();
