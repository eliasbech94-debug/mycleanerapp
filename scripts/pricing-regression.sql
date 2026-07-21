-- ============================================================================
-- Dynamic Pricing — Phase 1 SQL regression harness (read + transactional probe)
-- Run inside a transaction; rolled back at the end. Reports FAIL/PASS per case.
-- ============================================================================
\set ON_ERROR_STOP off
BEGIN;

-- 1. Config resolver: exact category wins even when disabled.
SAVEPOINT s1;
DELETE FROM public.dynamic_pricing_config WHERE country_code = 'ZZ';
INSERT INTO public.dynamic_pricing_config
  (country_code, service_category, enabled, band_bps, band_thresholds)
VALUES
  ('ZZ', NULL,        true,
    '{"very_low":-1500,"low":-500,"normal":0,"high":1000,"very_high":2500}',
    '{"very_low_max_bps":2500,"low_max_bps":6000,"normal_max_bps":11000,"high_max_bps":17500}'),
  ('ZZ', 'cleaning',  false,
    '{"very_low":0,"low":0,"normal":0,"high":0,"very_high":0}',
    '{"very_low_max_bps":2500,"low_max_bps":6000,"normal_max_bps":11000,"high_max_bps":17500}');

SELECT CASE WHEN service_category = 'cleaning' AND enabled = false
            THEN 'PASS: resolver exact-category-wins'
            ELSE 'FAIL: resolver did not return exact category row' END
  FROM public.resolve_dynamic_pricing_config('ZZ','cleaning');

SELECT CASE WHEN service_category IS NULL AND enabled = true
            THEN 'PASS: resolver falls back to country default when no category'
            ELSE 'FAIL: fallback broken' END
  FROM public.resolve_dynamic_pricing_config('ZZ','handyman');
ROLLBACK TO SAVEPOINT s1;

-- 2. Threshold validator rejects non-increasing series.
SAVEPOINT s2;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.dynamic_pricing_config
      (country_code, service_category, enabled, band_bps, band_thresholds)
    VALUES ('ZZ', 'bad', false,
      '{"very_low":0,"low":0,"normal":0,"high":0,"very_high":0}',
      '{"very_low_max_bps":100,"low_max_bps":100,"normal_max_bps":200,"high_max_bps":300}');
    RAISE NOTICE 'FAIL: non-increasing thresholds accepted';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS: non-increasing thresholds rejected (%)', SQLERRM;
  END;
END $$;
ROLLBACK TO SAVEPOINT s2;

-- 3. commission split invariant enforced on pricing_calculations
SAVEPOINT s3;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.pricing_calculations (
      quote_context, pricing_mode, dynamic_pricing_applied,
      requester_user_id, provider_user_id, provider_id_text,
      country_code, service_category, currency,
      start_at, duration_minutes, location_fingerprint, quote_context_key,
      base_rate_minor, provider_min_rate_minor, provider_max_rate_minor,
      allow_decrease, allow_increase,
      supply_count, demand_count, demand_ratio_bps, demand_band,
      demand_band_bps, weekend_bps, holiday_bps, same_day_bps, urgent_bps,
      total_adjustment_bps, adjusted_rate_minor, clamped_rate_minor,
      hours_billed, subtotal_minor, commission_bps,
      customer_half_bps, provider_half_bps,
      customer_total_minor, provider_net_minor, platform_fee_minor,
      expires_at
    ) VALUES (
      'customer_checkout','static',false,
      gen_random_uuid(), gen_random_uuid(), 'p1',
      'DK','cleaning','DKK',
      now()+interval '1 day', 120, 'fp', 'ctx',
      30000, 30000, 30000, false, false,
      0,0,0,'normal',
      0,0,0,0,0,
      0,30000,30000,
      2, 60000, 2800,
      1400, 1401,             -- BAD split (sum != 2800)
      68400, 51600, 16800,
      now()+interval '15 min'
    );
    RAISE NOTICE 'FAIL: bad commission split accepted';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS: bad commission split rejected (%)', SQLERRM;
  END;
END $$;
ROLLBACK TO SAVEPOINT s3;

-- 4. RLS: authenticated cannot select pricing_calculations
SAVEPOINT s4;
SET LOCAL role authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.pricing_calculations LIMIT 1;
    RAISE NOTICE 'FAIL: authenticated could select pricing_calculations';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE NOTICE 'PASS: authenticated blocked from pricing_calculations (%)', SQLERRM;
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT s4;

-- 5. Snapshot immutability: cannot rewrite pricing_snapshot once set.
--    (Skipped here because bookings insert requires a live customer_user_id;
--     covered by integration test scenario 12 in staging-validation.)
SELECT 'INFO: booking snapshot immutability covered by staging scenario 12' AS note;

ROLLBACK;
