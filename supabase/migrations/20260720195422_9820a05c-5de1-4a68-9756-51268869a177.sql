
-- 1) Create provider_trust (admin-only)
CREATE TABLE IF NOT EXISTS public.provider_trust (
  provider_id         uuid PRIMARY KEY REFERENCES public.provider_profiles(user_id) ON DELETE CASCADE,
  trust_score         smallint NOT NULL DEFAULT 100,
  trust_level         text     NOT NULL DEFAULT 'normal',
  trust_flags         jsonb    NOT NULL DEFAULT '[]'::jsonb,
  risk_reason         text,
  last_calculated_at  timestamptz NOT NULL DEFAULT now(),
  config_version      int      NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Grants: NO anon, NO authenticated. Service role only. Admin access goes via SECURITY DEFINER RPCs.
REVOKE ALL ON public.provider_trust FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.provider_trust TO service_role;

ALTER TABLE public.provider_trust ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin may view+manage via direct client only if they use a signed-in admin session.
-- We still create RLS for defence-in-depth. Providers get NO policy → no access.
CREATE POLICY "admins_select_trust" ON public.provider_trust
  FOR SELECT TO authenticated
  USING (public.is_admin_only(auth.uid()));

CREATE POLICY "admins_write_trust" ON public.provider_trust
  FOR ALL TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

-- Grant column privileges to authenticated for the admin policies to be usable in queries via RPC/definer.
-- Actually keep no grants to authenticated: all access is via SECURITY DEFINER functions below.

CREATE TRIGGER trg_provider_trust_updated_at
BEFORE UPDATE ON public.provider_trust
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Explicitly exclude from realtime (no-op if not published, but safeguard)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.provider_trust';
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;

-- 2) Backfill from provider_profiles
INSERT INTO public.provider_trust (provider_id, trust_score, trust_flags)
SELECT user_id, trust_score, trust_flags
FROM public.provider_profiles
ON CONFLICT (provider_id) DO NOTHING;

-- 3) Update block-trigger: drop trust_* checks (columns will be dropped)
CREATE OR REPLACE FUNCTION public.provider_profiles_block_privileged_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_only(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status              IS DISTINCT FROM OLD.status
   OR NEW.visibility         IS DISTINCT FROM OLD.visibility
   OR NEW.approved_at        IS DISTINCT FROM OLD.approved_at
   OR NEW.approved_by        IS DISTINCT FROM OLD.approved_by
   OR NEW.activated_at       IS DISTINCT FROM OLD.activated_at
   OR NEW.suspended_at       IS DISTINCT FROM OLD.suspended_at
   OR NEW.suspended_by       IS DISTINCT FROM OLD.suspended_by
   OR NEW.rejected_at        IS DISTINCT FROM OLD.rejected_at
   OR NEW.rejected_reason    IS DISTINCT FROM OLD.rejected_reason
   OR NEW.archived_at        IS DISTINCT FROM OLD.archived_at
   OR NEW.archived_by        IS DISTINCT FROM OLD.archived_by
   OR NEW.submitted_at       IS DISTINCT FROM OLD.submitted_at
   OR NEW.identity_status    IS DISTINCT FROM OLD.identity_status
   OR NEW.stripe_charges_enabled   IS DISTINCT FROM OLD.stripe_charges_enabled
   OR NEW.stripe_payouts_enabled   IS DISTINCT FROM OLD.stripe_payouts_enabled
   OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted
   OR NEW.stripe_requirements_due  IS DISTINCT FROM OLD.stripe_requirements_due
   OR NEW.stripe_disabled_reason   IS DISTINCT FROM OLD.stripe_disabled_reason
   OR NEW.payout_frozen      IS DISTINCT FROM OLD.payout_frozen
   OR NEW.payout_frozen_reason IS DISTINCT FROM OLD.payout_frozen_reason
   OR NEW.provider_score     IS DISTINCT FROM OLD.provider_score
   OR NEW.provider_tier      IS DISTINCT FROM OLD.provider_tier
   OR NEW.tier_is_manual     IS DISTINCT FROM OLD.tier_is_manual
   OR NEW.tier_calculated_at IS DISTINCT FROM OLD.tier_calculated_at
   OR NEW.scoring_config_version IS DISTINCT FROM OLD.scoring_config_version
   OR NEW.performance_snapshot IS DISTINCT FROM OLD.performance_snapshot
   OR NEW.completion_pct     IS DISTINCT FROM OLD.completion_pct THEN
    RAISE EXCEPTION 'provider_profiles_privileged_column_write_forbidden';
  END IF;

  RETURN NEW;
END $function$;

-- 4) Update calc_provider_tier — read trust_flags from provider_trust
CREATE OR REPLACE FUNCTION public.calc_provider_tier(_uid uuid, _metrics jsonb DEFAULT NULL::jsonb)
 RETURNS provider_tier
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pp public.provider_profiles;
  pr public.profiles;
  pt public.provider_trust;
  m jsonb;
  r public.provider_tier_rules;
  chosen public.provider_tier := 'new';
BEGIN
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id=_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  SELECT * INTO pr FROM public.profiles WHERE id=_uid;
  SELECT * INTO pt FROM public.provider_trust WHERE provider_id=_uid;
  m := COALESCE(_metrics, public.calc_provider_metrics(_uid));
  FOR r IN SELECT * FROM public.provider_tier_rules
           WHERE manual_only = false ORDER BY priority DESC
  LOOP
    IF r.require_identity  AND NOT (pp.identity_status='approved') THEN CONTINUE; END IF;
    IF r.require_stripe    AND NOT (pp.stripe_charges_enabled AND pp.stripe_payouts_enabled) THEN CONTINUE; END IF;
    IF r.require_phone     AND pr.sms_verified_at IS NULL THEN CONTINUE; END IF;
    IF r.require_no_trust_flags AND COALESCE(jsonb_array_length(COALESCE(pt.trust_flags,'[]'::jsonb)),0) > 0 THEN CONTINUE; END IF;
    IF r.min_completed IS NOT NULL AND COALESCE((m->>'completed_bookings')::int,0) < r.min_completed THEN CONTINUE; END IF;
    IF r.min_rating IS NOT NULL THEN
      IF (m->>'rating') IS NULL OR (m->>'rating')::numeric < r.min_rating THEN CONTINUE; END IF;
    END IF;
    IF r.max_cancellation_rate IS NOT NULL AND (m->>'cancellation_rate') IS NOT NULL
       AND (m->>'cancellation_rate')::numeric > r.max_cancellation_rate THEN CONTINUE; END IF;
    IF r.min_completion_rate IS NOT NULL AND (m->>'completion_rate') IS NOT NULL
       AND (m->>'completion_rate')::numeric < r.min_completion_rate THEN CONTINUE; END IF;
    IF r.min_repeat_customer_rate IS NOT NULL AND (m->>'repeat_customer_rate') IS NOT NULL
       AND (m->>'repeat_customer_rate')::numeric < r.min_repeat_customer_rate THEN CONTINUE; END IF;
    chosen := r.tier;
    EXIT;
  END LOOP;
  RETURN chosen;
END $function$;

-- 5) Patch calc_provider_metrics: replace pp.trust_flags reference with provider_trust
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public.calc_provider_metrics(uuid)'::regprocedure) INTO def;
  def := replace(def, 'jsonb_array_length(pp.trust_flags)',
                      '(SELECT jsonb_array_length(COALESCE(trust_flags,''[]''::jsonb)) FROM public.provider_trust WHERE provider_id=_uid)');
  EXECUTE def;
END $$;

-- 6) Update refresh_provider_score_tier to write score to provider_profiles AND trust to provider_trust atomically
CREATE OR REPLACE FUNCTION public.refresh_provider_score_tier(_uid uuid, _reason text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pp public.provider_profiles;
  pt public.provider_trust;
  m jsonb;
  sc jsonb;
  new_score int;
  new_tier public.provider_tier;
  prev_tier public.provider_tier;
BEGIN
  IF auth.uid() IS NULL AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id=_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;

  -- Ensure trust row exists
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

  -- Atomically refresh trust bookkeeping timestamp/config_version.
  UPDATE public.provider_trust
     SET last_calculated_at = now(),
         config_version = (sc->>'config_version')::int,
         updated_at = now()
   WHERE provider_id = _uid;

  INSERT INTO public.provider_score_history(
    user_id, provider_score, provider_tier, trust_score, scoring_config_version,
    metrics_snapshot, breakdown, reason
  ) VALUES (
    _uid, new_score, new_tier, pt.trust_score, (sc->>'config_version')::int,
    m, sc->'breakdown', _reason
  );

  IF prev_tier IS DISTINCT FROM new_tier THEN
    INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status, reason, metadata)
    VALUES (_uid, auth.uid(), 'tier_changed', NULL, NULL, _reason,
            jsonb_build_object('from', prev_tier, 'to', new_tier, 'score', new_score));
  END IF;

  RETURN jsonb_build_object('score', new_score, 'tier', new_tier, 'previous_tier', prev_tier,
                            'breakdown', sc->'breakdown', 'metrics', m);
END $function$;

-- 7) Drop trust columns from provider_profiles (after functions patched)
ALTER TABLE public.provider_profiles DROP COLUMN IF EXISTS trust_score;
ALTER TABLE public.provider_profiles DROP COLUMN IF EXISTS trust_flags;

-- 8) Admin-only RPCs
CREATE OR REPLACE FUNCTION public.admin_get_provider_trust(_uid uuid)
 RETURNS public.provider_trust
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.provider_trust;
BEGIN
  IF NOT public.is_admin_only(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO r FROM public.provider_trust WHERE provider_id = _uid;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_list_flagged_provider_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_only(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT provider_id FROM public.provider_trust
    WHERE jsonb_array_length(COALESCE(trust_flags,'[]'::jsonb)) > 0;
END $function$;

REVOKE ALL ON FUNCTION public.admin_get_provider_trust(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_provider_trust(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_flagged_provider_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_flagged_provider_ids() TO authenticated, service_role;
