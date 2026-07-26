
DO $$
DECLARE v_enabled boolean;
BEGIN
  SELECT enabled INTO v_enabled FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';
  IF v_enabled IS TRUE THEN
    RAISE EXCEPTION 'Refusing Step 6 migration: funds_release.enabled must be false';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.plan_pending_releases_v1(
  _limit int DEFAULT 100,
  _force_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_flag_on boolean;
  v_dry_run boolean;
  v_booking record;
  v_eligibility jsonb;
  v_provider_uuid uuid;
  v_scanned int := 0;
  v_planned int := 0;
  v_skipped int := 0;
  v_blocked int := 0;
  v_idem text;
  v_scope text := 'release_v1';
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'plan_pending_releases_v1: caller not authorized (%)', current_setting('role', true);
  END IF;

  SELECT COALESCE(enabled, false) INTO v_flag_on
  FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';

  v_dry_run := (NOT COALESCE(v_flag_on, false)) OR _force_dry_run;
  IF NOT v_dry_run THEN
    RAISE EXCEPTION 'plan_pending_releases_v1: only dry-run mode is available in Step 6';
  END IF;

  FOR v_booking IN
    SELECT b.id, b.provider_id, b.funds_release_at
    FROM public.bookings b
    WHERE b.funds_release_at IS NOT NULL
      AND b.funds_release_at <= now()
      AND b.status IN ('completed'::public.booking_status, 'accepted'::public.booking_status)
      AND NOT EXISTS (
        SELECT 1 FROM public.payout_transfer_attempts pa
        WHERE pa.booking_id = b.id AND pa.attempt_scope = v_scope
      )
    ORDER BY b.funds_release_at ASC
    LIMIT GREATEST(_limit, 0)
  LOOP
    v_scanned := v_scanned + 1;
    BEGIN
      v_provider_uuid := v_booking.provider_id::uuid;
    EXCEPTION WHEN others THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END;
    IF v_provider_uuid IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_eligibility := public.evaluate_booking_release_eligibility_v1(
      v_booking.id, NULL, 'dry_run_worker'
    );
    IF (v_eligibility->>'decision') <> 'eligible' THEN
      v_blocked := v_blocked + 1; CONTINUE;
    END IF;

    v_idem := 'dryrun:v1:' || v_booking.id::text || ':' || v_scope;

    INSERT INTO public.payout_transfer_attempts(
      booking_id, provider_user_id, attempt_scope, attempt_number,
      funding_mode, amount_minor, currency, transfer_group,
      stripe_idempotency_key, state, eligibility_snapshot
    )
    VALUES (
      v_booking.id, v_provider_uuid, v_scope, 1,
      'separate_charges_transfers_v1'::public.transfer_funding_mode,
      COALESCE((v_eligibility->'amounts'->>'provider_net_minor')::bigint, 1),
      COALESCE(v_eligibility->>'currency', 'dkk'),
      'grp_dryrun_' || v_booking.id::text,
      v_idem,
      'dry_run_planned',
      v_eligibility
    )
    ON CONFLICT (stripe_idempotency_key) DO NOTHING;

    IF FOUND THEN v_planned := v_planned + 1;
    ELSE v_skipped := v_skipped + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', true,
    'flag_enabled', COALESCE(v_flag_on,false),
    'scanned', v_scanned,
    'planned', v_planned,
    'blocked', v_blocked,
    'skipped', v_skipped,
    'at', now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.plan_pending_releases_v1(int, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plan_pending_releases_v1(int, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.plan_pending_releases_v1(int, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.plan_pending_releases_v1(int, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_provider_payout_readiness_v1(_limit int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row record; v_snapshot jsonb;
  v_checked int := 0; v_ready int := 0; v_not_ready int := 0;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'reconcile_provider_payout_readiness_v1: caller not authorized';
  END IF;

  FOR v_row IN
    SELECT user_id FROM public.provider_profiles
    ORDER BY updated_at DESC NULLS LAST
    LIMIT GREATEST(_limit, 0)
  LOOP
    v_checked := v_checked + 1;
    v_snapshot := public.check_provider_payout_readiness_v1(v_row.user_id);
    IF COALESCE((v_snapshot->>'ready')::boolean, false) THEN
      v_ready := v_ready + 1;
    ELSE
      v_not_ready := v_not_ready + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'ready', v_ready, 'not_ready', v_not_ready, 'at', now());
END;
$fn$;

REVOKE ALL ON FUNCTION public.reconcile_provider_payout_readiness_v1(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_provider_payout_readiness_v1(int) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_provider_payout_readiness_v1(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_provider_payout_readiness_v1(int) TO service_role;

CREATE OR REPLACE FUNCTION public.funds_release_worker_tick_v1(_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_got_lock boolean; v_run_id uuid;
  v_started timestamptz := clock_timestamp();
  v_plan jsonb; v_recon jsonb; v_flag_on boolean;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'funds_release_worker_tick_v1: caller not authorized';
  END IF;

  v_got_lock := pg_try_advisory_xact_lock(hashtext('funds_release_worker_tick_v1'));
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'lock_busy', 'dry_run', true, 'at', now());
  END IF;

  SELECT COALESCE(enabled, false) INTO v_flag_on
  FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';

  INSERT INTO public.job_runs(job_name, status, metadata)
  VALUES ('funds_release_worker_tick_v1', 'running',
          jsonb_build_object('flag_enabled', COALESCE(v_flag_on,false), 'limit', _limit))
  RETURNING id INTO v_run_id;

  v_plan := public.plan_pending_releases_v1(_limit, true);
  v_recon := public.reconcile_provider_payout_readiness_v1(_limit);

  UPDATE public.job_runs
  SET status = 'completed', finished_at = now(),
      duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int,
      processed_count = COALESCE((v_plan->>'scanned')::int, 0),
      success_count = COALESCE((v_plan->>'planned')::int, 0),
      metadata = metadata || jsonb_build_object('plan', v_plan, 'reconcile', v_recon)
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'flag_enabled', COALESCE(v_flag_on,false),
    'dry_run', true, 'plan', v_plan, 'reconcile', v_recon
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.funds_release_worker_tick_v1(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.funds_release_worker_tick_v1(int) FROM anon;
REVOKE ALL ON FUNCTION public.funds_release_worker_tick_v1(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.funds_release_worker_tick_v1(int) TO service_role;

DO $tests$
DECLARE v_flag boolean; v_result jsonb; v_priv int;
BEGIN
  SELECT enabled INTO v_flag FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';
  IF v_flag IS TRUE THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: funds_release.enabled must not be true';
  END IF;

  SELECT count(*) INTO v_priv
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'plan_pending_releases_v1',
      'reconcile_provider_payout_readiness_v1',
      'funds_release_worker_tick_v1'
    )
    AND grantee IN ('anon','authenticated','PUBLIC');
  IF v_priv > 0 THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: Step 6 functions leaked (% grants).', v_priv;
  END IF;

  v_result := public.funds_release_worker_tick_v1(10);
  IF v_result->>'dry_run' <> 'true' THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: first tick not dry_run: %', v_result;
  END IF;
  v_result := public.funds_release_worker_tick_v1(10);
  IF v_result->>'dry_run' <> 'true' THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: second tick not dry_run: %', v_result;
  END IF;

  RAISE NOTICE 'Step 6 self-tests passed. tick=%', v_result;
END;
$tests$;
