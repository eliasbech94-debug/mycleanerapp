-- Compatibility bridge from provider_profiles.hourly_rate to per-service
-- pricing. The legacy column is already stored in minor units, so the amount
-- is copied 1:1. This migration is intentionally fail-closed: no partial
-- backfill is allowed when a legacy provider cannot be represented safely.

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*)
    INTO invalid_count
    FROM public.provider_profiles pp
    LEFT JOIN public.profiles p ON p.id = pp.user_id
   WHERE pp.hourly_rate IS NOT NULL
     AND pp.hourly_rate > 0
     AND NOT EXISTS (
       SELECT 1
         FROM public.provider_service_prices psp
        WHERE psp.user_id = pp.user_id
     )
     AND (
       upper(coalesce(pp.base_country_code, p.country_code, '')) NOT IN ('DK', 'SE', 'ES', 'UK')
       OR pp.hourly_rate < CASE upper(coalesce(pp.base_country_code, p.country_code, ''))
         WHEN 'DK' THEN 14000
         WHEN 'SE' THEN 13500
         WHEN 'ES' THEN 800
         WHEN 'UK' THEN 1100
         ELSE 2147483647
       END
     );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'provider_service_price_backfill_preflight_failed: % unsupported or below-floor legacy provider(s)',
      invalid_count
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

INSERT INTO public.provider_service_prices (
  user_id,
  service_code,
  pricing_unit,
  amount_minor,
  currency,
  active
)
SELECT
  pp.user_id,
  'home_cleaning',
  'hour',
  pp.hourly_rate,
  CASE upper(coalesce(pp.base_country_code, p.country_code))
    WHEN 'DK' THEN 'DKK'
    WHEN 'SE' THEN 'SEK'
    WHEN 'ES' THEN 'EUR'
    WHEN 'UK' THEN 'GBP'
  END,
  true
FROM public.provider_profiles pp
LEFT JOIN public.profiles p ON p.id = pp.user_id
WHERE pp.hourly_rate IS NOT NULL
  AND pp.hourly_rate > 0
  AND upper(coalesce(pp.base_country_code, p.country_code, '')) IN ('DK', 'SE', 'ES', 'UK')
  AND NOT EXISTS (
    SELECT 1
      FROM public.provider_service_prices psp
     WHERE psp.user_id = pp.user_id
  )
ON CONFLICT (user_id, service_code) DO NOTHING;

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*)
    INTO missing_count
    FROM public.provider_profiles pp
    LEFT JOIN public.profiles p ON p.id = pp.user_id
   WHERE pp.hourly_rate IS NOT NULL
     AND pp.hourly_rate > 0
     AND upper(coalesce(pp.base_country_code, p.country_code, '')) IN ('DK', 'SE', 'ES', 'UK')
     AND NOT EXISTS (
       SELECT 1
         FROM public.provider_service_prices psp
        WHERE psp.user_id = pp.user_id
          AND psp.active
          AND psp.amount_minor > 0
     );

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'provider_service_price_backfill_postcondition_failed: % legacy provider(s) still have no active service price',
      missing_count
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Rollback strategy:
-- Keep the additive home_cleaning rows (they are valid provider-owned prices)
-- and restore calc_provider_completion to its legacy hourly_rate predicate if
-- the frontend rollout must be reverted. Do not delete backfilled prices:
-- after providers edit them, they cannot be distinguished safely from prices
-- created through onboarding.
