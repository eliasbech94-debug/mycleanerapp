CREATE OR REPLACE FUNCTION public.provider_profile_service_update_v1(
  _user_id uuid,
  _scope   text,
  _patch   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
  v_col     text;
  v_sql     text;
  v_sets    text[] := ARRAY[]::text[];
BEGIN
  IF _scope NOT IN ('stripe_sync','identity_sync','scoring_refresh','finance_update') THEN
    RAISE EXCEPTION 'scope % is not a service scope', _scope USING ERRCODE = '42501';
  END IF;

  v_allowed := public.provider_profile_scope_allowlist(_scope);

  FOR v_col IN SELECT key FROM jsonb_each(_patch) LOOP
    IF NOT (v_col = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'column % is not writable under scope %', v_col, _scope USING ERRCODE = '42501';
    END IF;
    v_sets := v_sets || format(
      '%I = (jsonb_populate_record(NULL::public.provider_profiles, $1)).%I', v_col, v_col);
  END LOOP;

  IF array_length(v_sets, 1) IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.provider_profile_write_scope', _scope, true);

  v_sql := format(
    'UPDATE public.provider_profiles SET %s, updated_at = now() WHERE user_id = $2',
    array_to_string(v_sets, ', '));
  EXECUTE v_sql USING _patch, _user_id;

  PERFORM set_config('app.provider_profile_write_scope', '', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.provider_profile_write_scope', '', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_profile_service_update_v1(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_profile_service_update_v1(uuid, text, jsonb) TO service_role;