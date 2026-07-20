
-- helper
CREATE OR REPLACE FUNCTION public._pp_as_service() RETURNS void
LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT set_config('request.jwt.claim.role', 'service_role', true);
$$;
REVOKE ALL ON FUNCTION public._pp_as_service() FROM PUBLIC;

-- 1
CREATE OR REPLACE FUNCTION public.start_provider_application()
RETURNS public.provider_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.provider_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  PERFORM public._pp_as_service();

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
END $$;
REVOKE ALL ON FUNCTION public.start_provider_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_provider_application() TO authenticated, service_role;

-- 2 calc_provider_completion
CREATE OR REPLACE FUNCTION public.calc_provider_completion(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pp public.provider_profiles;
  pr public.profiles;
  items jsonb := '[]'::jsonb;
  done_count int := 0;
  total_count int := 0;
  b boolean;
BEGIN
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('pct', 0, 'items', '[]'::jsonb, 'error','provider_profile_missing');
  END IF;
  SELECT * INTO pr FROM public.profiles WHERE id = _uid;

  b := pp.display_name IS NOT NULL AND length(btrim(pp.display_name)) > 0;
  items := items || jsonb_build_object('key','display_name','label','Visningsnavn','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.headline IS NOT NULL AND length(btrim(pp.headline)) > 0;
  items := items || jsonb_build_object('key','headline','label','Overskrift','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.bio IS NOT NULL AND length(btrim(pp.bio)) >= 40;
  items := items || jsonb_build_object('key','bio','label','Bio (min 40 tegn)','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.photo_path IS NOT NULL;
  items := items || jsonb_build_object('key','photo','label','Profilbillede','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := array_length(pp.languages,1) IS NOT NULL;
  items := items || jsonb_build_object('key','languages','label','Sprog','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := array_length(pp.service_categories,1) IS NOT NULL;
  items := items || jsonb_build_object('key','services','label','Servicekategorier','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.hourly_rate IS NOT NULL AND pp.hourly_rate > 0;
  items := items || jsonb_build_object('key','rate','label','Timepris','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.service_area_radius_km IS NOT NULL AND pp.service_area_radius_km > 0;
  items := items || jsonb_build_object('key','service_area','label','Serviceomraade','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.base_address_place_id IS NOT NULL AND pp.base_country_code IS NOT NULL;
  items := items || jsonb_build_object('key','base_address','label','Baseadresse','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.date_of_birth IS NOT NULL;
  items := items || jsonb_build_object('key','dob','label','Foedselsdato','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.terms_accepted_at IS NOT NULL;
  items := items || jsonb_build_object('key','terms','label','Vilkaar accepteret','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pr.sms_verified_at IS NOT NULL;
  items := items || jsonb_build_object('key','phone','label','Telefon verificeret','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.identity_status = 'approved';
  items := items || jsonb_build_object('key','identity','label','Identitet godkendt','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.stripe_charges_enabled AND pp.stripe_payouts_enabled AND pp.stripe_details_submitted;
  items := items || jsonb_build_object('key','stripe','label','Stripe klar','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  RETURN jsonb_build_object(
    'pct', CASE WHEN total_count=0 THEN 0 ELSE round((done_count::numeric*100)/total_count) END,
    'done', done_count, 'total', total_count,
    'items', items
  );
END $$;
REVOKE ALL ON FUNCTION public.calc_provider_completion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_provider_completion(uuid) TO authenticated, service_role;

-- 3 submit
CREATE OR REPLACE FUNCTION public.submit_provider_application()
RETURNS public.provider_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.submit_provider_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_provider_application() TO authenticated, service_role;

-- 4 reconcile
CREATE OR REPLACE FUNCTION public.reconcile_provider_status(_uid uuid)
RETURNS public.provider_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    PERFORM public._pp_as_service();
    UPDATE public.provider_profiles SET status = new_status, updated_at = now()
     WHERE user_id = _uid RETURNING * INTO pp;
    INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status, reason)
    VALUES (_uid, auth.uid(), 'reconciled', prev, new_status, 'auto');
  END IF;
  RETURN pp;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_provider_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_provider_status(uuid) TO authenticated, service_role;

-- 5 metrics
CREATE OR REPLACE FUNCTION public.calc_provider_metrics(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pp public.provider_profiles;
  pr public.profiles;
  v_provider_id text;
  v_completed int := 0;
  v_cancelled int := 0;
  v_total int := 0;
  v_repeat_rate numeric;
  v_account_age_days int;
BEGIN
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id=_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  SELECT * INTO pr FROM public.profiles WHERE id=_uid;
  v_provider_id := pr.provider_id;
  IF v_provider_id IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE status='completed'),
           count(*) FILTER (WHERE status='cancelled'),
           count(*)
      INTO v_completed, v_cancelled, v_total
      FROM public.bookings WHERE provider_id = v_provider_id;
    SELECT CASE WHEN count(DISTINCT customer_user_id)=0 THEN NULL
                ELSE (count(*) - count(DISTINCT customer_user_id))::numeric
                     / NULLIF(count(*),0) END
      INTO v_repeat_rate
      FROM public.bookings
     WHERE provider_id = v_provider_id AND status='completed';
  END IF;
  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM now() - pp.created_at)::int);
  RETURN jsonb_build_object(
    'completed_bookings', v_completed,
    'cancelled_bookings', v_cancelled,
    'total_bookings', v_total,
    'cancellation_rate', CASE WHEN (v_completed+v_cancelled)=0 THEN NULL
                              ELSE round(v_cancelled::numeric / (v_completed+v_cancelled), 4) END,
    'completion_rate', CASE WHEN v_total=0 THEN NULL
                            ELSE round(v_completed::numeric / v_total, 4) END,
    'repeat_customer_rate', v_repeat_rate,
    'rating', NULL,
    'response_time_minutes', NULL,
    'acceptance_rate', NULL,
    'complaints', 0,
    'account_age_days', v_account_age_days,
    'identity_ok', pp.identity_status='approved',
    'stripe_ok', pp.stripe_charges_enabled AND pp.stripe_payouts_enabled,
    'email_ok', true,
    'phone_ok', pr.sms_verified_at IS NOT NULL,
    'trust_flag_count', COALESCE(jsonb_array_length(pp.trust_flags),0)
  );
END $$;
REVOKE ALL ON FUNCTION public.calc_provider_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_provider_metrics(uuid) TO authenticated, service_role;

-- 6 score
CREATE OR REPLACE FUNCTION public.calc_provider_score(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.provider_scoring_config;
  m jsonb;
  w jsonb;
  n jsonb;
  applicable numeric := 0;
  earned numeric := 0;
  breakdown jsonb := '[]'::jsonb;
  dim_signal numeric;
  dim_points numeric;
  dim_weight numeric;
  val numeric;
  best numeric; worst numeric; minv numeric; maxv numeric; target numeric;
BEGIN
  SELECT * INTO cfg FROM public.provider_scoring_config WHERE is_active LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'scoring_config_missing'; END IF;
  w := cfg.weights; n := cfg.normalizers;
  m := public.calc_provider_metrics(_uid);

  -- rating
  dim_weight := COALESCE((w->>'rating')::numeric,0);
  val := (m->>'rating')::numeric;
  IF val IS NOT NULL THEN
    minv := (n#>>'{rating,min}')::numeric; maxv := (n#>>'{rating,max}')::numeric;
    dim_signal := LEAST(1, GREATEST(0, (val-minv)/NULLIF(maxv-minv,0)));
    dim_points := round(dim_weight*dim_signal, 2);
    applicable := applicable+dim_weight; earned := earned+dim_points;
    breakdown := breakdown || jsonb_build_object('key','rating','weight',dim_weight,'signal',dim_signal,'points',dim_points);
  END IF;

  -- completed
  dim_weight := COALESCE((w->>'completed_bookings')::numeric,0);
  val := (m->>'completed_bookings')::numeric;
  target := (n#>>'{completed_bookings,target}')::numeric;
  dim_signal := LEAST(1, GREATEST(0, val/NULLIF(target,0)));
  dim_points := round(dim_weight*dim_signal,2);
  applicable := applicable+dim_weight; earned := earned+dim_points;
  breakdown := breakdown || jsonb_build_object('key','completed_bookings','weight',dim_weight,'signal',dim_signal,'points',dim_points);

  -- response_time
  dim_weight := COALESCE((w->>'response_time')::numeric,0);
  val := (m->>'response_time_minutes')::numeric;
  IF val IS NOT NULL THEN
    best := (n#>>'{response_time,best_minutes}')::numeric;
    worst := (n#>>'{response_time,worst_minutes}')::numeric;
    dim_signal := LEAST(1, GREATEST(0, (worst-val)/NULLIF(worst-best,0)));
    dim_points := round(dim_weight*dim_signal,2);
    applicable := applicable+dim_weight; earned := earned+dim_points;
    breakdown := breakdown || jsonb_build_object('key','response_time','weight',dim_weight,'signal',dim_signal,'points',dim_points);
  END IF;

  -- acceptance
  dim_weight := COALESCE((w->>'acceptance_rate')::numeric,0);
  val := (m->>'acceptance_rate')::numeric;
  IF val IS NOT NULL THEN
    minv := (n#>>'{acceptance_rate,min}')::numeric; maxv := (n#>>'{acceptance_rate,max}')::numeric;
    dim_signal := LEAST(1, GREATEST(0, (val-minv)/NULLIF(maxv-minv,0)));
    dim_points := round(dim_weight*dim_signal,2);
    applicable := applicable+dim_weight; earned := earned+dim_points;
    breakdown := breakdown || jsonb_build_object('key','acceptance_rate','weight',dim_weight,'signal',dim_signal,'points',dim_points);
  END IF;

  -- completion
  dim_weight := COALESCE((w->>'completion_rate')::numeric,0);
  val := (m->>'completion_rate')::numeric;
  IF val IS NOT NULL THEN
    minv := (n#>>'{completion_rate,min}')::numeric; maxv := (n#>>'{completion_rate,max}')::numeric;
    dim_signal := LEAST(1, GREATEST(0, (val-minv)/NULLIF(maxv-minv,0)));
    dim_points := round(dim_weight*dim_signal,2);
    applicable := applicable+dim_weight; earned := earned+dim_points;
    breakdown := breakdown || jsonb_build_object('key','completion_rate','weight',dim_weight,'signal',dim_signal,'points',dim_points);
  END IF;

  -- cancellation
  dim_weight := COALESCE((w->>'cancellation_rate')::numeric,0);
  val := (m->>'cancellation_rate')::numeric;
  IF val IS NOT NULL THEN
    best := (n#>>'{cancellation_rate,best}')::numeric;
    worst := (n#>>'{cancellation_rate,worst}')::numeric;
    dim_signal := LEAST(1, GREATEST(0, (worst-val)/NULLIF(worst-best,0)));
    dim_points := round(dim_weight*dim_signal,2);
    applicable := applicable+dim_weight; earned := earned+dim_points;
    breakdown := breakdown || jsonb_build_object('key','cancellation_rate','weight',dim_weight,'signal',dim_signal,'points',dim_points);
  END IF;

  -- repeat
  dim_weight := COALESCE((w->>'repeat_customer_rate')::numeric,0);
  val := (m->>'repeat_customer_rate')::numeric;
  IF val IS NOT NULL THEN
    target := (n#>>'{repeat_customer_rate,target}')::numeric;
    dim_signal := LEAST(1, GREATEST(0, val/NULLIF(target,0)));
    dim_points := round(dim_weight*dim_signal,2);
    applicable := applicable+dim_weight; earned := earned+dim_points;
    breakdown := breakdown || jsonb_build_object('key','repeat_customer_rate','weight',dim_weight,'signal',dim_signal,'points',dim_points);
  END IF;

  -- complaints
  dim_weight := COALESCE((w->>'complaints')::numeric,0);
  val := COALESCE((m->>'complaints')::numeric,0);
  best := (n#>>'{complaints,best}')::numeric;
  worst := (n#>>'{complaints,worst}')::numeric;
  dim_signal := LEAST(1, GREATEST(0, (worst-val)/NULLIF(worst-best,0)));
  dim_points := round(dim_weight*dim_signal,2);
  applicable := applicable+dim_weight; earned := earned+dim_points;
  breakdown := breakdown || jsonb_build_object('key','complaints','weight',dim_weight,'signal',dim_signal,'points',dim_points);

  -- account age
  dim_weight := COALESCE((w->>'account_age')::numeric,0);
  val := COALESCE((m->>'account_age_days')::numeric,0);
  target := (n#>>'{account_age,target_days}')::numeric;
  dim_signal := LEAST(1, GREATEST(0, val/NULLIF(target,0)));
  dim_points := round(dim_weight*dim_signal,2);
  applicable := applicable+dim_weight; earned := earned+dim_points;
  breakdown := breakdown || jsonb_build_object('key','account_age','weight',dim_weight,'signal',dim_signal,'points',dim_points);

  -- identity
  dim_weight := COALESCE((w->>'identity')::numeric,0);
  dim_signal := CASE WHEN (m->>'identity_ok')::boolean THEN 1 ELSE 0 END;
  dim_points := dim_weight*dim_signal;
  applicable := applicable+dim_weight; earned := earned+dim_points;
  breakdown := breakdown || jsonb_build_object('key','identity','weight',dim_weight,'signal',dim_signal,'points',dim_points);

  -- stripe
  dim_weight := COALESCE((w->>'stripe')::numeric,0);
  dim_signal := CASE WHEN (m->>'stripe_ok')::boolean THEN 1 ELSE 0 END;
  dim_points := dim_weight*dim_signal;
  applicable := applicable+dim_weight; earned := earned+dim_points;
  breakdown := breakdown || jsonb_build_object('key','stripe','weight',dim_weight,'signal',dim_signal,'points',dim_points);

  RETURN jsonb_build_object(
    'score', CASE WHEN applicable=0 THEN 0 ELSE round((earned/applicable)*100) END,
    'earned', earned,
    'applicable_weight', applicable,
    'breakdown', breakdown,
    'config_version', cfg.config_version
  );
END $$;
REVOKE ALL ON FUNCTION public.calc_provider_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_provider_score(uuid) TO authenticated, service_role;

-- 7 tier
CREATE OR REPLACE FUNCTION public.calc_provider_tier(_uid uuid, _metrics jsonb DEFAULT NULL)
RETURNS public.provider_tier
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pp public.provider_profiles;
  pr public.profiles;
  m jsonb;
  r public.provider_tier_rules;
  chosen public.provider_tier := 'new';
BEGIN
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id=_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  SELECT * INTO pr FROM public.profiles WHERE id=_uid;
  m := COALESCE(_metrics, public.calc_provider_metrics(_uid));
  FOR r IN SELECT * FROM public.provider_tier_rules
           WHERE manual_only = false ORDER BY priority DESC
  LOOP
    IF r.require_identity  AND NOT (pp.identity_status='approved') THEN CONTINUE; END IF;
    IF r.require_stripe    AND NOT (pp.stripe_charges_enabled AND pp.stripe_payouts_enabled) THEN CONTINUE; END IF;
    IF r.require_phone     AND pr.sms_verified_at IS NULL THEN CONTINUE; END IF;
    IF r.require_no_trust_flags AND COALESCE(jsonb_array_length(pp.trust_flags),0) > 0 THEN CONTINUE; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.calc_provider_tier(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_provider_tier(uuid, jsonb) TO authenticated, service_role;

-- 8 refresh
CREATE OR REPLACE FUNCTION public.refresh_provider_score_tier(_uid uuid, _reason text DEFAULT 'auto')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pp public.provider_profiles;
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

  INSERT INTO public.provider_score_history(
    user_id, provider_score, provider_tier, trust_score, scoring_config_version,
    metrics_snapshot, breakdown, reason
  ) VALUES (
    _uid, new_score, new_tier, pp.trust_score, (sc->>'config_version')::int,
    m, sc->'breakdown', _reason
  );

  IF prev_tier IS DISTINCT FROM new_tier THEN
    INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status, reason, metadata)
    VALUES (_uid, auth.uid(), 'tier_changed', NULL, NULL, _reason,
            jsonb_build_object('from', prev_tier, 'to', new_tier, 'score', new_score));
  END IF;

  RETURN jsonb_build_object('score', new_score, 'tier', new_tier, 'previous_tier', prev_tier,
                            'breakdown', sc->'breakdown', 'metrics', m);
END $$;
REVOKE ALL ON FUNCTION public.refresh_provider_score_tier(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_provider_score_tier(uuid, text) TO authenticated, service_role;

-- 9 eligibility
CREATE OR REPLACE FUNCTION public.provider_is_marketplace_visible(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.provider_profiles pp
    JOIN public.profiles pr ON pr.id = pp.user_id
    WHERE pp.user_id = _uid
      AND pp.status = 'active'
      AND pp.visibility = 'public'
      AND pp.identity_status = 'approved'
      AND pp.stripe_charges_enabled AND pp.stripe_payouts_enabled
      AND pr.sms_verified_at IS NOT NULL
      AND pr.deactivated_at IS NULL
      AND pp.completion_pct >= 100
  );
$$;
REVOKE ALL ON FUNCTION public.provider_is_marketplace_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_is_marketplace_visible(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provider_can_accept_booking(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.provider_profiles pp
    JOIN public.profiles pr ON pr.id = pp.user_id
    WHERE pp.user_id = _uid
      AND pp.status = 'active'
      AND pp.identity_status = 'approved'
      AND pp.stripe_charges_enabled
      AND pr.sms_verified_at IS NOT NULL
      AND pr.deactivated_at IS NULL
      AND NOT pp.payout_frozen
  );
$$;
REVOKE ALL ON FUNCTION public.provider_can_accept_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_can_accept_booking(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provider_can_receive_payout(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.provider_profiles pp
    WHERE pp.user_id = _uid
      AND pp.status IN ('active','paused','suspended')
      AND pp.stripe_payouts_enabled
      AND NOT pp.payout_frozen
  );
$$;
REVOKE ALL ON FUNCTION public.provider_can_receive_payout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_can_receive_payout(uuid) TO authenticated, service_role;

-- 10 admin action
CREATE OR REPLACE FUNCTION public.admin_provider_action(
  _target_user_id uuid,
  _action text,
  _reason text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  PERFORM public._pp_as_service();

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

  INSERT INTO public.provider_admin_actions(
    user_id, actor_id, action, from_status, to_status, reason, metadata, idempotency_key
  ) VALUES (
    _target_user_id, actor, _action, prev_status, pp.status, _reason, COALESCE(_metadata,'{}'::jsonb), _idempotency_key
  );

  RETURN jsonb_build_object('status', pp.status, 'visibility', pp.visibility, 'tier', pp.provider_tier);
END $$;
REVOKE ALL ON FUNCTION public.admin_provider_action(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provider_action(uuid, text, text, text, jsonb) TO authenticated, service_role;
