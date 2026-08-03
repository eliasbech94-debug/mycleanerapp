-- ---------- extend scope allowlists with internal lifecycle scopes ----------
CREATE OR REPLACE FUNCTION public.provider_profile_scope_allowlist(_scope text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _scope
    WHEN 'stripe_sync' THEN ARRAY[
      'stripe_charges_enabled','stripe_payouts_enabled','stripe_details_submitted',
      'stripe_requirements_due','stripe_disabled_reason','updated_at']
    WHEN 'identity_sync' THEN ARRAY[
      'identity_status','updated_at']
    WHEN 'scoring_refresh' THEN ARRAY[
      'provider_score','provider_tier','tier_is_manual','tier_calculated_at',
      'scoring_config_version','performance_snapshot','avg_response_minutes','updated_at']
    WHEN 'finance_update' THEN ARRAY[
      'payout_frozen','payout_frozen_reason','updated_at']
    WHEN 'admin_review' THEN ARRAY[
      'status','visibility','is_public','approved_at','approved_by','activated_at',
      'suspended_at','suspended_by','rejected_at','rejected_reason',
      'archived_at','archived_by','payout_frozen','payout_frozen_reason',
      'provider_tier','tier_is_manual','tier_calculated_at','updated_at']
    WHEN 'status_reconcile' THEN ARRAY[
      'status','updated_at']
    WHEN 'application_lifecycle' THEN ARRAY[
      'status','visibility','submitted_at','completion_pct','updated_at']
    ELSE NULL::text[]
  END
$$;

REVOKE ALL ON FUNCTION public.provider_profile_scope_allowlist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_profile_scope_allowlist(text) TO authenticated, service_role;

-- ---------- internal scope set/clear helpers (not client callable) ----------
CREATE OR REPLACE FUNCTION public._pp_scope_set(_scope text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.provider_profile_scope_allowlist(_scope) IS NULL THEN
    RAISE EXCEPTION 'unknown provider_profile write scope: %', _scope USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.provider_profile_write_scope', _scope, true);
END $$;

CREATE OR REPLACE FUNCTION public._pp_scope_clear()
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$ SELECT set_config('app.provider_profile_write_scope', '', true); SELECT NULL::void $$;

REVOKE ALL ON FUNCTION public._pp_scope_set(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._pp_scope_clear() FROM PUBLIC;

-- ---------- rewrite privileged functions to use explicit scopes ----------
CREATE OR REPLACE FUNCTION public.reconcile_provider_status(_uid uuid)
RETURNS provider_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pp public.provider_profiles;
  new_status public.provider_status;
  prev public.provider_status;
BEGIN
  IF auth.uid() IS NULL AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  IF NOT (public.is_admin_only(auth.uid()) OR current_setting('request.jwt.claim.role', true)='service_role'
          OR auth.uid() = _uid) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  IF pp.status NOT IN ('draft','pending_identity','pending_stripe','rejected') THEN
    RETURN pp;
  END IF;
  IF pp.identity_status <> 'approved' THEN new_status := 'pending_identity';
  ELSIF NOT (pp.stripe_charges_enabled AND pp.stripe_payouts_enabled) THEN new_status := 'pending_stripe';
  ELSE new_status := 'draft';
  END IF;
  IF new_status <> pp.status THEN
    prev := pp.status;
    PERFORM public._pp_scope_set('status_reconcile');
    UPDATE public.provider_profiles SET status = new_status, updated_at = now()
     WHERE user_id = _uid RETURNING * INTO pp;
    PERFORM public._pp_scope_clear();
    INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status, reason)
    VALUES (_uid, auth.uid(), 'reconciled', prev, new_status, 'auto');
  END IF;
  RETURN pp;
END $function$;

CREATE OR REPLACE FUNCTION public._sync_identity_to_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  linked_uid uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  FOR linked_uid IN
    SELECT user_id FROM public.identity_account_links WHERE identity_id = NEW.id
  LOOP
    PERFORM public._pp_scope_set('identity_sync');
    UPDATE public.provider_profiles
       SET identity_status = NEW.status::text, updated_at = now()
     WHERE user_id = linked_uid;
    PERFORM public._pp_scope_clear();
    PERFORM public.reconcile_provider_status(linked_uid);
    PERFORM public.calc_provider_completion(linked_uid);
    PERFORM public.refresh_provider_score_tier(linked_uid, 'identity_status_changed');
  END LOOP;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.start_provider_application()
RETURNS provider_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.provider_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_row FROM public.provider_profiles WHERE user_id = v_uid;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.provider_profiles (user_id, status, visibility)
  VALUES (v_uid, 'draft', 'hidden')
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.user_id IS NULL THEN
    SELECT * INTO v_row FROM public.provider_profiles WHERE user_id = v_uid;
  END IF;

  INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status, reason, metadata)
  VALUES (v_uid, v_uid, 'application_started', NULL, 'draft', NULL, '{}'::jsonb);
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.submit_provider_application()
RETURNS provider_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  pp public.provider_profiles;
  pr public.profiles;
  comp jsonb;
  v_pct int;
  v_prev public.provider_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  IF pp.status NOT IN ('draft','pending_identity','pending_stripe','rejected') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;
  v_prev := pp.status;
  SELECT * INTO pr FROM public.profiles WHERE id = v_uid;

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

  PERFORM public._pp_scope_set('application_lifecycle');
  UPDATE public.provider_profiles
     SET status='pending_review',
         submitted_at = COALESCE(submitted_at, now()),
         completion_pct = 100,
         updated_at = now()
   WHERE user_id = v_uid RETURNING * INTO pp;
  PERFORM public._pp_scope_clear();

  INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status)
  VALUES (v_uid, v_uid, 'submitted', v_prev, 'pending_review');
  RETURN pp;
END $function$;

CREATE OR REPLACE FUNCTION public.refresh_provider_score_tier(_uid uuid, _reason text DEFAULT 'auto'::text, _event_id text DEFAULT NULL::text)
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
  v_key text;
  v_existing bigint;
BEGIN
  IF auth.uid() IS NULL AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  v_key := COALESCE(_event_id, 'auto:' || gen_random_uuid()::text);

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

  PERFORM public._pp_scope_set('scoring_refresh');
  UPDATE public.provider_profiles
     SET provider_score = new_score,
         provider_tier  = new_tier,
         tier_calculated_at = now(),
         scoring_config_version = (sc->>'config_version')::int,
         performance_snapshot = m,
         updated_at = now()
   WHERE user_id = _uid;
  PERFORM public._pp_scope_clear();

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
END $function$;

-- legacy 2-arg overload delegates to the 3-arg version
DROP FUNCTION IF EXISTS public.refresh_provider_score_tier(uuid, text);
CREATE OR REPLACE FUNCTION public.refresh_provider_score_tier(_uid uuid, _reason text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.refresh_provider_score_tier(_uid, _reason, NULL::text) $$;

CREATE OR REPLACE FUNCTION public.admin_provider_action(_target_user_id uuid, _action text, _reason text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pp public.provider_profiles;
  prev_status public.provider_status;
  actor uuid := auth.uid();
  is_self boolean;
  is_admin boolean;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  is_self := (actor = _target_user_id);
  is_admin := public.is_admin_only(actor);

  IF _action NOT IN ('self_pause','self_unpause') AND NOT is_admin THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  IF _action IN ('self_pause','self_unpause') AND NOT is_self AND NOT is_admin THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  IF _idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.provider_admin_actions
    WHERE idempotency_key = _idempotency_key AND user_id = _target_user_id
  ) THEN
    SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _target_user_id;
    RETURN jsonb_build_object('idempotent', true, 'status', pp.status, 'visibility', pp.visibility, 'tier', pp.provider_tier);
  END IF;

  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  prev_status := pp.status;

  PERFORM public._pp_scope_set('admin_review');

  IF _action = 'approve' THEN
    IF pp.status <> 'pending_review' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF pp.identity_status <> 'approved' THEN RAISE EXCEPTION 'identity_not_approved'; END IF;
    IF NOT (pp.stripe_charges_enabled AND pp.stripe_payouts_enabled) THEN RAISE EXCEPTION 'stripe_not_ready'; END IF;
    UPDATE public.provider_profiles
       SET status='active', visibility='public',
           approved_at=now(), approved_by=actor,
           activated_at=COALESCE(activated_at, now()),
           rejected_at=NULL, rejected_reason=NULL, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;
    INSERT INTO public.user_roles(user_id, role) VALUES (_target_user_id, 'provider')
      ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF _action = 'reject' THEN
    IF pp.status NOT IN ('pending_review','pending_identity','pending_stripe','draft') THEN
      RAISE EXCEPTION 'invalid_status_transition';
    END IF;
    UPDATE public.provider_profiles
       SET status='rejected', visibility='hidden',
           rejected_at=now(), rejected_reason=_reason, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'suspend' THEN
    IF pp.status NOT IN ('active','paused') THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    UPDATE public.provider_profiles
       SET status='suspended', visibility='hidden',
           suspended_at=now(), suspended_by=actor, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'self_pause' THEN
    IF pp.status NOT IN ('active') THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    UPDATE public.provider_profiles
       SET status='paused', visibility='hidden', updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'unsuspend' THEN
    IF pp.status <> 'suspended' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    UPDATE public.provider_profiles
       SET status='active', visibility='public',
           suspended_at=NULL, suspended_by=NULL, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'self_unpause' THEN
    IF pp.status <> 'paused' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    UPDATE public.provider_profiles
       SET status='active', visibility='public', updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'archive' THEN
    IF pp.status = 'archived' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    UPDATE public.provider_profiles
       SET status='archived', visibility='hidden',
           archived_at=now(), archived_by=actor, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;
    DELETE FROM public.user_roles WHERE user_id=_target_user_id AND role='provider';

  ELSIF _action = 'restore' THEN
    IF pp.status <> 'archived' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    UPDATE public.provider_profiles
       SET status='draft', visibility='hidden',
           archived_at=NULL, archived_by=NULL, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'set_partner' THEN
    UPDATE public.provider_profiles
       SET provider_tier='partner', tier_is_manual=true, tier_calculated_at=now(), updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'unset_partner' THEN
    UPDATE public.provider_profiles
       SET tier_is_manual=false, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;
    PERFORM public._pp_scope_clear();
    PERFORM public.refresh_provider_score_tier(_target_user_id, 'partner_removed');
    SELECT * INTO pp FROM public.provider_profiles WHERE user_id=_target_user_id;

  ELSIF _action = 'freeze_payout' THEN
    UPDATE public.provider_profiles
       SET payout_frozen=true, payout_frozen_reason=_reason, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSIF _action = 'unfreeze_payout' THEN
    UPDATE public.provider_profiles
       SET payout_frozen=false, payout_frozen_reason=NULL, updated_at=now()
     WHERE user_id=_target_user_id RETURNING * INTO pp;

  ELSE
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  PERFORM public._pp_scope_clear();

  INSERT INTO public.provider_admin_actions(
    user_id, actor_id, action, from_status, to_status, reason, metadata, idempotency_key
  ) VALUES (
    _target_user_id, actor, _action, prev_status, pp.status, _reason, COALESCE(_metadata,'{}'::jsonb), _idempotency_key
  );

  RETURN jsonb_build_object('status', pp.status, 'visibility', pp.visibility, 'tier', pp.provider_tier);
END $function$;

-- ---------- remove the legacy blanket bypass ----------
DROP FUNCTION IF EXISTS public._pp_as_service();