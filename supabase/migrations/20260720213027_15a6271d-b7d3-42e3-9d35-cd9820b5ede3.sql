
-- === RC1 FIX PACK 1 ===

-- 1) country_configs: remove authenticated read of base table; expose only via safe view.
DROP POLICY IF EXISTS "authenticated read published" ON public.country_configs;
-- Change view to SECURITY DEFINER-style (bypass caller RLS) since base table is now admin-only.
ALTER VIEW public.country_configs_public SET (security_invoker = false);
GRANT SELECT ON public.country_configs_public TO anon, authenticated;

-- 2) Marketplace booking index
CREATE INDEX IF NOT EXISTS bookings_provider_status_idx
  ON public.bookings (provider_id, status);

-- 4) Explicit minimum-age enforcement with structured error code `provider_underage`
CREATE OR REPLACE FUNCTION public.provider_profiles_enforce_min_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL
     AND NEW.date_of_birth > (current_date - interval '18 years')::date THEN
    RAISE EXCEPTION 'provider_underage' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.submit_provider_application()
RETURNS provider_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  pp public.provider_profiles;
  pr public.profiles;
  comp jsonb;
  v_pct int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  IF pp.status NOT IN ('draft','pending_identity','pending_stripe','rejected') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;
  SELECT * INTO pr FROM public.profiles WHERE id = v_uid;

  -- Authoritative age enforcement (defence-in-depth alongside the trigger).
  IF pp.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'provider_dob_missing' USING ERRCODE='check_violation';
  END IF;
  IF pp.date_of_birth > (current_date - interval '18 years')::date THEN
    RAISE EXCEPTION 'provider_underage' USING ERRCODE='check_violation';
  END IF;

  comp := public.calc_provider_completion(v_uid);
  v_pct := (comp->>'pct')::int;
  IF v_pct < 100 THEN RAISE EXCEPTION 'requirements_incomplete'; END IF;
  IF pr.sms_verified_at IS NULL THEN RAISE EXCEPTION 'phone_not_verified'; END IF;
  IF pp.identity_status <> 'approved' THEN RAISE EXCEPTION 'identity_not_approved'; END IF;
  IF NOT (pp.stripe_charges_enabled AND pp.stripe_payouts_enabled) THEN RAISE EXCEPTION 'stripe_not_ready'; END IF;
  IF pp.terms_accepted_at IS NULL THEN RAISE EXCEPTION 'requirements_incomplete'; END IF;

  PERFORM public._pp_as_service();
  UPDATE public.provider_profiles
     SET status='pending_review',
         submitted_at = COALESCE(submitted_at, now()),
         completion_pct = 100,
         updated_at = now()
   WHERE user_id = v_uid RETURNING * INTO pp;
  INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status)
  VALUES (v_uid, v_uid, 'submitted', pp.status, 'pending_review');
  RETURN pp;
END $$;

-- 5) Score-history idempotency
ALTER TABLE public.provider_score_history
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Backfill existing rows with a unique per-row key so we can add UNIQUE without conflict.
UPDATE public.provider_score_history
   SET idempotency_key = 'legacy:' || id::text
 WHERE idempotency_key IS NULL;

ALTER TABLE public.provider_score_history
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provider_score_history_idem_uidx
  ON public.provider_score_history (user_id, idempotency_key);

-- Updated refresh with idempotency support. New optional parameter `_event_id`
-- lets callers (webhooks, jobs) pass a stable event id; retries with the same
-- id become a no-op on the history table while still returning the current state.
CREATE OR REPLACE FUNCTION public.refresh_provider_score_tier(
  _uid uuid,
  _reason text DEFAULT 'auto'::text,
  _event_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pp public.provider_profiles;
  pt public.provider_trust;
  m jsonb;
  sc jsonb;
  new_score int;
  new_tier public.provider_tier;
  prev_tier public.provider_tier;
  v_key text;
  v_existing bigint;
BEGIN
  IF auth.uid() IS NULL AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  v_key := COALESCE(_event_id, 'auto:' || gen_random_uuid()::text);

  -- Fast-path: if we already recorded this event, return the last snapshot as-is.
  SELECT id INTO v_existing
    FROM public.provider_score_history
   WHERE user_id = _uid AND idempotency_key = v_key
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _uid;
    RETURN jsonb_build_object(
      'idempotent', true,
      'score', pp.provider_score,
      'tier', pp.provider_tier,
      'idempotency_key', v_key
    );
  END IF;

  SELECT * INTO pp FROM public.provider_profiles WHERE user_id=_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;

  INSERT INTO public.provider_trust(provider_id) VALUES (_uid)
    ON CONFLICT (provider_id) DO NOTHING;
  SELECT * INTO pt FROM public.provider_trust WHERE provider_id=_uid FOR UPDATE;

  m := public.calc_provider_metrics(_uid);
  sc := public.calc_provider_score(_uid);
  new_score := (sc->>'score')::int;

  IF pp.tier_is_manual AND pp.provider_tier = 'partner' THEN
    new_tier := 'partner';
  ELSE
    new_tier := public.calc_provider_tier(_uid, m);
  END IF;

  prev_tier := pp.provider_tier;

  PERFORM public._pp_as_service();
  UPDATE public.provider_profiles
     SET provider_score = new_score,
         provider_tier  = new_tier,
         tier_calculated_at = now(),
         scoring_config_version = (sc->>'config_version')::int,
         performance_snapshot = m,
         updated_at = now()
   WHERE user_id = _uid;

  UPDATE public.provider_trust
     SET last_calculated_at = now(),
         config_version = (sc->>'config_version')::int,
         updated_at = now()
   WHERE provider_id = _uid;

  BEGIN
    INSERT INTO public.provider_score_history(
      user_id, provider_score, provider_tier, trust_score, scoring_config_version,
      metrics_snapshot, breakdown, reason, idempotency_key
    ) VALUES (
      _uid, new_score, new_tier, pt.trust_score, (sc->>'config_version')::int,
      m, sc->'breakdown', _reason, v_key
    );
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent retry: another transaction already recorded this event.
    NULL;
  END;

  IF prev_tier IS DISTINCT FROM new_tier THEN
    INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status, reason, metadata)
    VALUES (_uid, auth.uid(), 'tier_changed', NULL, NULL, _reason,
            jsonb_build_object('from', prev_tier, 'to', new_tier, 'score', new_score));
  END IF;

  RETURN jsonb_build_object(
    'score', new_score, 'tier', new_tier, 'previous_tier', prev_tier,
    'breakdown', sc->'breakdown', 'metrics', m,
    'idempotency_key', v_key
  );
END $$;
