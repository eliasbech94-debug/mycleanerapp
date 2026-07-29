-- =========================================================
-- Provider profile privileged-write hardening
-- Scoped authorization, per-scope column allowlists
-- =========================================================

-- ---------- scope resolution helpers ----------
CREATE OR REPLACE FUNCTION public.provider_profile_write_scope()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.provider_profile_write_scope', true), '')
$$;

REVOKE ALL ON FUNCTION public.provider_profile_write_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_profile_write_scope() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_request_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '') <> ''
      OR COALESCE(NULLIF(current_setting('request.method', true), ''), '') <> ''
      OR auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.has_request_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_request_context() TO authenticated, service_role;

-- ---------- per-scope column allowlists ----------
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
      'archived_at','archived_by','payout_frozen','payout_frozen_reason','updated_at']
    ELSE NULL::text[]
  END
$$;

REVOKE ALL ON FUNCTION public.provider_profile_scope_allowlist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_profile_scope_allowlist(text) TO authenticated, service_role;

-- Columns that an owner (provider) may never change
CREATE OR REPLACE FUNCTION public.provider_profile_protected_columns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'user_id','status','visibility','is_public','provider_slug',
    'approved_at','approved_by','activated_at','suspended_at','suspended_by',
    'rejected_at','rejected_reason','archived_at','archived_by',
    'identity_status',
    'stripe_charges_enabled','stripe_payouts_enabled','stripe_details_submitted',
    'stripe_requirements_due','stripe_disabled_reason',
    'payout_frozen','payout_frozen_reason',
    'provider_score','provider_tier','tier_is_manual','tier_calculated_at',
    'scoring_config_version','performance_snapshot'
  ]
$$;

REVOKE ALL ON FUNCTION public.provider_profile_protected_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_profile_protected_columns() TO authenticated, service_role;

-- ---------- guard trigger ----------
CREATE OR REPLACE FUNCTION public.provider_profiles_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_scope     text := public.provider_profile_write_scope();
  v_allowed   text[];
  v_changed   text[] := ARRAY[]::text[];
  v_col       text;
  v_old       jsonb := to_jsonb(OLD);
  v_new       jsonb := to_jsonb(NEW);
BEGIN
  -- collect changed columns
  FOR v_col IN SELECT key FROM jsonb_each(v_new) LOOP
    IF v_new -> v_col IS DISTINCT FROM v_old -> v_col THEN
      v_changed := v_changed || v_col;
    END IF;
  END LOOP;

  IF array_length(v_changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- ===== migration backfill: requires ALL three conditions =====
  IF v_scope = 'migration_backfill' THEN
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'migration_backfill scope requires an allowlisted database role (got %)', current_user
        USING ERRCODE = '42501';
    END IF;
    IF public.has_request_context() THEN
      RAISE EXCEPTION 'migration_backfill scope may not be used inside a request context'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- ===== explicit service / admin scopes =====
  IF v_scope IS NOT NULL THEN
    v_allowed := public.provider_profile_scope_allowlist(v_scope);
    IF v_allowed IS NULL THEN
      RAISE EXCEPTION 'unknown provider_profile write scope: %', v_scope USING ERRCODE = '42501';
    END IF;
    FOREACH v_col IN ARRAY v_changed LOOP
      IF NOT (v_col = ANY (v_allowed)) THEN
        RAISE EXCEPTION 'column % is not writable under scope %', v_col, v_scope USING ERRCODE = '42501';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- ===== no scope: owner / unprivileged path =====
  FOREACH v_col IN ARRAY v_changed LOOP
    IF v_col = ANY (public.provider_profile_protected_columns()) THEN
      RAISE EXCEPTION 'column % is admin-controlled and cannot be modified directly', v_col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- one-time, forward-only owner fields
  IF NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at AND OLD.terms_accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'terms_accepted_at may only be set once' USING ERRCODE = '42501';
  END IF;
  IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at AND OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'submitted_at may only be set once' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_profiles_write_guard ON public.provider_profiles;
CREATE TRIGGER trg_provider_profiles_write_guard
  BEFORE UPDATE ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.provider_profiles_write_guard();

-- ---------- scoped service RPCs (no blanket service_role bypass) ----------
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
    v_sets := v_sets || format('%I = ($1 ->> %L)::text::%s',
      v_col, v_col,
      (SELECT format_type(a.atttypid, a.atttypmod)
         FROM pg_attribute a
        WHERE a.attrelid = 'public.provider_profiles'::regclass
          AND a.attname = v_col));
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

-- ---------- tighten the owner UPDATE policy ----------
DROP POLICY IF EXISTS provider_profiles_owner_update ON public.provider_profiles;
CREATE POLICY provider_profiles_owner_update
ON public.provider_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status <> 'archived'::provider_status)
WITH CHECK (
  user_id = auth.uid()
  AND public.provider_profile_write_scope() IS NULL
);