
-- ============================================================================
-- Phase 1 hardening (idempotent)
-- ============================================================================

-- 1) Revoke default excess grants.
REVOKE ALL ON public.pricing_calculations       FROM anon, authenticated;
REVOKE ALL ON public.dynamic_pricing_config     FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
       ON public.dynamic_pricing_config         FROM authenticated;
REVOKE ALL ON public.provider_pricing_settings  FROM anon;
GRANT ALL ON public.pricing_calculations       TO service_role;
GRANT ALL ON public.dynamic_pricing_config     TO service_role;
GRANT ALL ON public.provider_pricing_settings  TO service_role;

-- 2) Harden lock RPC. Preserve existing return type (pricing_calculations).
DROP FUNCTION IF EXISTS public.lock_pricing_quote(uuid, uuid);
CREATE OR REPLACE FUNCTION public.lock_pricing_quote(_booking_id uuid, _quote_id uuid)
RETURNS public.pricing_calculations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
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
  IF b.country_code IS NULL OR length(trim(b.country_code)) <> 2 THEN
    RAISE EXCEPTION 'booking_country_missing';
  END IF;
  IF b.payment_status IS NULL OR b.payment_status NOT IN
     ('unpaid','authorized','requires_action') THEN
    RAISE EXCEPTION 'booking_payment_status_invalid:%', b.payment_status;
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
     OR upper(q.country_code) <> upper(b.country_code)
     OR q.service_category <> b.service
     OR upper(q.currency) <> upper(b.currency)
     OR q.duration_minutes <> round(b.hours * 60)::int THEN
    RAISE EXCEPTION 'quote_context_mismatch';
  END IF;

  snap := jsonb_build_object(
    'quote_id', q.id, 'pricing_version', q.pricing_version,
    'pricing_mode', q.pricing_mode, 'dynamic_pricing_applied', q.dynamic_pricing_applied,
    'currency', q.currency, 'country_code', q.country_code,
    'service_category', q.service_category, 'start_at', q.start_at,
    'duration_minutes', q.duration_minutes,
    'base_rate_minor', q.base_rate_minor, 'clamped_rate_minor', q.clamped_rate_minor,
    'subtotal_minor', q.subtotal_minor,
    'customer_total_minor', q.customer_total_minor,
    'provider_net_minor', q.provider_net_minor,
    'platform_fee_minor', q.platform_fee_minor,
    'commission_bps', q.commission_bps,
    'customer_half_bps', q.customer_half_bps,
    'provider_half_bps', q.provider_half_bps,
    'locked_at', now()
  );

  UPDATE public.bookings
     SET pricing_snapshot        = snap,
         pricing_calculation_id  = q.id,
         pricing_version         = q.pricing_version,
         pricing_mode            = q.pricing_mode,
         dynamic_pricing_applied = q.dynamic_pricing_applied
   WHERE id = _booking_id;

  UPDATE public.pricing_calculations SET status = 'locked' WHERE id = _quote_id
    RETURNING * INTO q;
  RETURN q;
END $fn$;
REVOKE ALL ON FUNCTION public.lock_pricing_quote(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_pricing_quote(uuid, uuid) TO service_role;

-- 3) Inline verification.
DO $verify$
DECLARE
  ok_count int := 0; fail_count int := 0;
  synth_quote uuid;
  synth_customer uuid := gen_random_uuid();
  synth_provider uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.pricing_calculations (
    quote_context, status, pricing_mode, dynamic_pricing_applied,
    requester_user_id, customer_user_id, provider_user_id,
    provider_id_text, country_code, service_category, currency,
    start_at, duration_minutes, location_fingerprint, quote_context_key,
    base_rate_minor, provider_min_rate_minor, provider_max_rate_minor,
    allow_decrease, allow_increase,
    supply_count, demand_count, demand_ratio_bps, demand_band, demand_band_bps,
    weekend_bps, holiday_bps, same_day_bps, urgent_bps, total_adjustment_bps,
    adjusted_rate_minor, clamped_rate_minor, hours_billed,
    subtotal_minor, commission_bps, customer_half_bps, provider_half_bps,
    customer_total_minor, provider_net_minor, platform_fee_minor,
    expires_at
  ) VALUES (
    'customer_checkout','quoted','static',false,
    synth_customer, synth_customer, synth_provider,
    'phase1-verify','ZZ','cleaning','EUR',
    now() + interval '1 day', 120,'fp-phase1-verify','ck-phase1-verify',
    30000,30000,30000,false,false,
    1,0,0,'normal',0,
    0,0,0,0,0,
    30000,30000,2,
    60000,2800,1400,1400,
    68400,51600,16800,
    now() + interval '15 minutes'
  ) RETURNING id INTO synth_quote;

  BEGIN
    UPDATE public.pricing_calculations SET customer_total_minor = 99999 WHERE id = synth_quote;
    fail_count := fail_count + 1;
    RAISE NOTICE 'FAIL T1 immutability: monetary UPDATE was accepted';
  EXCEPTION WHEN OTHERS THEN
    ok_count := ok_count + 1;
    RAISE NOTICE 'PASS T1 immutability rejected: %', SQLERRM;
  END;

  BEGIN
    UPDATE public.pricing_calculations SET status = 'locked' WHERE id = synth_quote;
    ok_count := ok_count + 1;
    RAISE NOTICE 'PASS T2 transition quoted->locked accepted';
  EXCEPTION WHEN OTHERS THEN
    fail_count := fail_count + 1;
    RAISE NOTICE 'FAIL T2 transition: %', SQLERRM;
  END;

  BEGIN
    UPDATE public.pricing_calculations SET status = 'superseded' WHERE id = synth_quote;
    fail_count := fail_count + 1;
    RAISE NOTICE 'FAIL T3 locked->superseded was accepted';
  EXCEPTION WHEN OTHERS THEN
    ok_count := ok_count + 1;
    RAISE NOTICE 'PASS T3 locked->superseded rejected: %', SQLERRM;
  END;

  BEGIN
    UPDATE public.pricing_calculations SET status = 'void' WHERE id = synth_quote;
    fail_count := fail_count + 1;
    RAISE NOTICE 'FAIL T4 locked->void was accepted';
  EXCEPTION WHEN OTHERS THEN
    ok_count := ok_count + 1;
    RAISE NOTICE 'PASS T4 locked->void rejected: %', SQLERRM;
  END;

  BEGIN
    UPDATE public.pricing_calculations SET status = 'expired' WHERE id = synth_quote;
    fail_count := fail_count + 1;
    RAISE NOTICE 'FAIL T5 locked->expired was accepted';
  EXCEPTION WHEN OTHERS THEN
    ok_count := ok_count + 1;
    RAISE NOTICE 'PASS T5 locked->expired rejected: %', SQLERRM;
  END;

  DELETE FROM public.pricing_calculations WHERE id = synth_quote;

  RAISE NOTICE 'Phase-1 verification summary: % passed, % failed', ok_count, fail_count;
END $verify$;
