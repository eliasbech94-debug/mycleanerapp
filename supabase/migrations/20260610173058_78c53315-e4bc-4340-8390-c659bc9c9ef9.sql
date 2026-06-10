
CREATE TABLE public.market_rate_thresholds (
  country_code text PRIMARY KEY,
  currency text NOT NULL,
  min_hourly_rate numeric(10,2) NOT NULL,
  max_hourly_rate numeric(10,2) NOT NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.market_rate_thresholds TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.market_rate_thresholds TO authenticated;
GRANT ALL ON public.market_rate_thresholds TO service_role;

ALTER TABLE public.market_rate_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read thresholds"
  ON public.market_rate_thresholds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert thresholds"
  ON public.market_rate_thresholds FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update thresholds"
  ON public.market_rate_thresholds FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete thresholds"
  ON public.market_rate_thresholds FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER market_rate_thresholds_set_updated_at
  BEFORE UPDATE ON public.market_rate_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.market_rate_thresholds (country_code, currency, min_hourly_rate, max_hourly_rate) VALUES
  ('DK','DKK',140,420),
  ('SE','SEK',135,405),
  ('NO','NOK',175,525),
  ('DE','EUR',12,36),
  ('NL','EUR',13,39),
  ('FR','EUR',12,36),
  ('ES','EUR',8,24),
  ('IT','EUR',9,27),
  ('UK','GBP',11,33),
  ('FI','EUR',11,33),
  ('PL','PLN',28,84),
  ('AT','EUR',12,36);
