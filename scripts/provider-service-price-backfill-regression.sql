-- Provider service-price compatibility preflight/regression.
-- Run on an isolated staging database after the three prerequisite migrations:
--   psql -v ON_ERROR_STOP=1 -f scripts/provider-service-price-backfill-regression.sql
-- The entire probe is rolled back and leaves no data changes.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE prices_before_backfill ON COMMIT DROP AS
SELECT *
FROM public.provider_service_prices;

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
       SELECT 1 FROM public.provider_service_prices psp
       WHERE psp.user_id = pp.user_id
     )
     AND (
       upper(coalesce(pp.base_country_code, p.country_code, '')) NOT IN ('DK', 'SE', 'ES', 'UK')
       OR (
         pp.hourly_rate < CASE upper(coalesce(pp.base_country_code, p.country_code, ''))
           WHEN 'DK' THEN 14000 WHEN 'SE' THEN 13500
           WHEN 'ES' THEN 800 WHEN 'UK' THEN 1100
           ELSE 2147483647
         END
         AND pp.hourly_rate NOT BETWEEN
           CASE upper(coalesce(pp.base_country_code, p.country_code, ''))
             WHEN 'DK' THEN 140 WHEN 'SE' THEN 135
             WHEN 'ES' THEN 8 WHEN 'UK' THEN 11
             ELSE 2147483647
           END
           AND
           CASE upper(coalesce(pp.base_country_code, p.country_code, ''))
             WHEN 'DK' THEN 420 WHEN 'SE' THEN 405
             WHEN 'ES' THEN 24 WHEN 'UK' THEN 33
             ELSE -1
           END
       )
     );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'FAIL preflight: % unsupported or below-floor legacy provider(s)',
      invalid_count;
  END IF;
  RAISE NOTICE 'PASS: every legacy provider is safely representable';
END;
$$;

-- Execute the same insert twice to prove idempotence.
INSERT INTO public.provider_service_prices (
  user_id, service_code, pricing_unit, amount_minor, currency, active
)
SELECT
  pp.user_id,
  'home_cleaning',
  'hour',
  CASE
    WHEN pp.hourly_rate < CASE upper(coalesce(pp.base_country_code, p.country_code, ''))
      WHEN 'DK' THEN 14000 WHEN 'SE' THEN 13500
      WHEN 'ES' THEN 800 WHEN 'UK' THEN 1100
    END
    THEN pp.hourly_rate * 100
    ELSE pp.hourly_rate
  END,
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
    SELECT 1 FROM public.provider_service_prices psp
    WHERE psp.user_id = pp.user_id
  )
ON CONFLICT (user_id, service_code) DO NOTHING;

CREATE TEMP TABLE prices_after_first_backfill ON COMMIT DROP AS
SELECT *
FROM public.provider_service_prices;

INSERT INTO public.provider_service_prices (
  user_id, service_code, pricing_unit, amount_minor, currency, active
)
SELECT
  pp.user_id,
  'home_cleaning',
  'hour',
  CASE
    WHEN pp.hourly_rate < CASE upper(coalesce(pp.base_country_code, p.country_code, ''))
      WHEN 'DK' THEN 14000 WHEN 'SE' THEN 13500
      WHEN 'ES' THEN 800 WHEN 'UK' THEN 1100
    END
    THEN pp.hourly_rate * 100
    ELSE pp.hourly_rate
  END,
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
    SELECT 1 FROM public.provider_service_prices psp
    WHERE psp.user_id = pp.user_id
  )
ON CONFLICT (user_id, service_code) DO NOTHING;

DO $$
DECLARE
  mismatch_count integer;
  changed_existing_count integer;
  duplicate_count integer;
BEGIN
  SELECT count(*)
    INTO mismatch_count
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
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'FAIL: % legacy provider(s) have no active service price', mismatch_count;
  END IF;

  SELECT count(*)
    INTO changed_existing_count
    FROM prices_before_backfill old
    LEFT JOIN public.provider_service_prices current ON current.id = old.id
   WHERE current.id IS NULL
      OR row(
        current.user_id, current.service_code, current.pricing_unit,
        current.amount_minor, current.currency, current.active,
        current.created_at, current.updated_at
      ) IS DISTINCT FROM row(
        old.user_id, old.service_code, old.pricing_unit,
        old.amount_minor, old.currency, old.active,
        old.created_at, old.updated_at
      );
  IF changed_existing_count > 0 THEN
    RAISE EXCEPTION 'FAIL: % existing service-price row(s) changed', changed_existing_count;
  END IF;

  SELECT count(*)
    INTO duplicate_count
    FROM (
      SELECT user_id, service_code
      FROM public.provider_service_prices
      GROUP BY user_id, service_code
      HAVING count(*) > 1
    ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'FAIL: duplicate provider/service prices detected';
  END IF;

  IF EXISTS (
    (SELECT * FROM public.provider_service_prices
     EXCEPT SELECT * FROM prices_after_first_backfill)
    UNION ALL
    (SELECT * FROM prices_after_first_backfill
     EXCEPT SELECT * FROM public.provider_service_prices)
  ) THEN
    RAISE EXCEPTION 'FAIL: second backfill execution changed data';
  END IF;

  RAISE NOTICE 'PASS: legacy providers have an active price';
  RAISE NOTICE 'PASS: existing service prices are unchanged';
  RAISE NOTICE 'PASS: no duplicate provider/service prices';
  RAISE NOTICE 'PASS: backfill is idempotent';
END;
$$;

ROLLBACK;
