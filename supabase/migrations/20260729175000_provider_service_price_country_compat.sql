-- Extend per-service pricing to the existing German market and accept both
-- GB (ISO 3166-1) and the legacy application alias UK for British providers.

CREATE OR REPLACE FUNCTION public.enforce_provider_service_price_floor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  country text;
  expected_currency text;
  floor_minor integer;
BEGIN
  SELECT upper(COALESCE(pp.base_country_code, p.country_code, ''))
    INTO country
    FROM public.provider_profiles pp
    LEFT JOIN public.profiles p ON p.id = NEW.user_id
   WHERE pp.user_id = NEW.user_id;

  expected_currency := CASE country
    WHEN 'DK' THEN 'DKK'
    WHEN 'SE' THEN 'SEK'
    WHEN 'DE' THEN 'EUR'
    WHEN 'ES' THEN 'EUR'
    WHEN 'GB' THEN 'GBP'
    WHEN 'UK' THEN 'GBP'
    ELSE NULL
  END;
  floor_minor := CASE country
    WHEN 'DK' THEN 14000
    WHEN 'SE' THEN 13500
    WHEN 'DE' THEN 1200
    WHEN 'ES' THEN 800
    WHEN 'GB' THEN 1100
    WHEN 'UK' THEN 1100
    ELSE NULL
  END;

  IF expected_currency IS NULL OR floor_minor IS NULL THEN
    RAISE EXCEPTION 'unsupported_provider_market';
  END IF;
  IF NEW.currency <> expected_currency THEN
    RAISE EXCEPTION 'service_price_currency_mismatch';
  END IF;
  IF NEW.amount_minor < floor_minor THEN
    RAISE EXCEPTION 'service_price_below_market_floor';
  END IF;
  RETURN NEW;
END;
$$;
