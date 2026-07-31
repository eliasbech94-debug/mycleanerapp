-- Identity sync (called by Sumsub webhook + reconciliation only)
CREATE OR REPLACE FUNCTION public.apply_provider_identity_sync(
  _uid uuid, _status text, _sandbox boolean, _applicant_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (current_setting('request.jwt.claim.role', true) = 'service_role'
          OR current_setting('role', true) = 'service_role') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  IF _status NOT IN ('not_started','pending','approved','rejected','on_hold','expired','unverified') THEN
    RAISE EXCEPTION 'invalid_identity_status';
  END IF;
  PERFORM public._pp_scope_set('identity_sync');
  UPDATE public.provider_profiles SET
    identity_status = _status,
    identity_sandbox = _sandbox,
    identity_applicant_id = COALESCE(_applicant_id, identity_applicant_id),
    identity_reviewed_at = now(),
    updated_at = now()
  WHERE user_id = _uid;
  PERFORM public._pp_scope_clear();
END $$;
REVOKE ALL ON FUNCTION public.apply_provider_identity_sync(uuid,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_identity_sync(uuid,text,boolean,text) TO service_role;

-- Photo moderation result (called by the async moderation worker only)
CREATE OR REPLACE FUNCTION public.apply_provider_photo_moderation(
  _uid uuid, _photo_path text, _status text, _reason_codes text[],
  _confidence numeric, _model text, _model_version text, _message text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (current_setting('request.jwt.claim.role', true) = 'service_role'
          OR current_setting('role', true) = 'service_role') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  IF _status NOT IN ('pending','approved','rejected','manual_review') THEN
    RAISE EXCEPTION 'invalid_photo_status';
  END IF;

  INSERT INTO public.provider_photo_moderation(
    provider_user_id, photo_path, status, reason_codes, confidence,
    model, model_version, provider_message, evaluated_at)
  VALUES (_uid, _photo_path, _status, COALESCE(_reason_codes,'{}'), _confidence,
          _model, _model_version, _message,
          CASE WHEN _status = 'pending' THEN NULL ELSE now() END)
  ON CONFLICT (provider_user_id, photo_path) DO UPDATE SET
    status = EXCLUDED.status,
    reason_codes = EXCLUDED.reason_codes,
    confidence = EXCLUDED.confidence,
    model = EXCLUDED.model,
    model_version = EXCLUDED.model_version,
    provider_message = EXCLUDED.provider_message,
    evaluated_at = EXCLUDED.evaluated_at,
    updated_at = now();

  PERFORM public._pp_scope_set('photo_moderation');
  UPDATE public.provider_profiles
     SET photo_moderation_status = _status, updated_at = now()
   WHERE user_id = _uid AND photo_path = _photo_path;
  PERFORM public._pp_scope_clear();
END $$;
REVOKE ALL ON FUNCTION public.apply_provider_photo_moderation(uuid,text,text,text[],numeric,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_photo_moderation(uuid,text,text,text[],numeric,text,text,text) TO service_role;

-- Quiz result (scored server-side only)
CREATE OR REPLACE FUNCTION public.apply_provider_quiz_result(
  _uid uuid, _quiz_key text, _score smallint, _max_score smallint,
  _passed boolean, _answers jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (current_setting('request.jwt.claim.role', true) = 'service_role'
          OR current_setting('role', true) = 'service_role') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.provider_quiz_attempts(
    provider_user_id, quiz_key, score, max_score, passed, answers)
  VALUES (_uid, COALESCE(_quiz_key,'provider_basics_v1'), _score, _max_score, _passed,
          COALESCE(_answers,'{}'::jsonb));

  PERFORM public._pp_scope_set('quiz_result');
  UPDATE public.provider_profiles SET
    quiz_score = _score,
    quiz_passed_at = CASE WHEN _passed THEN COALESCE(quiz_passed_at, now()) ELSE quiz_passed_at END,
    updated_at = now()
  WHERE user_id = _uid;
  PERFORM public._pp_scope_clear();
END $$;
REVOKE ALL ON FUNCTION public.apply_provider_quiz_result(uuid,text,smallint,smallint,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_quiz_result(uuid,text,smallint,smallint,boolean,jsonb) TO service_role;