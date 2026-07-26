-- =====================================================================
-- Regression suite: provider_profiles scoped write authorization
-- Run as an allowlisted DB role (postgres / supabase_admin) with NO
-- request context. Every block must produce the stated outcome.
-- Usage: psql -f staging-validation/sql/provider-profile-write-scope-regression.sql
-- =====================================================================

\set ON_ERROR_STOP off

BEGIN;

-- Fixture -------------------------------------------------------------
CREATE TEMP TABLE _t AS
SELECT user_id FROM public.provider_profiles ORDER BY created_at LIMIT 1;

DO $$
DECLARE uid uuid;
BEGIN
  SELECT user_id INTO uid FROM _t;
  IF uid IS NULL THEN RAISE EXCEPTION 'no provider_profiles fixture row available'; END IF;
END $$;

-- 1. No scope  -> protected column write MUST fail ---------------------
DO $$
DECLARE uid uuid; ok boolean := false;
BEGIN
  SELECT user_id INTO uid FROM _t;
  BEGIN
    UPDATE public.provider_profiles SET status = 'active' WHERE user_id = uid;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 1: unscoped status write was allowed'; END IF;
  RAISE NOTICE 'PASS 1: unscoped status write rejected';
END $$;

-- 2. No scope -> non-protected column write MUST succeed ---------------
DO $$
DECLARE uid uuid;
BEGIN
  SELECT user_id INTO uid FROM _t;
  UPDATE public.provider_profiles SET headline = coalesce(headline,'x') WHERE user_id = uid;
  RAISE NOTICE 'PASS 2: unscoped ordinary write allowed';
END $$;

-- 3. stripe_sync scope may not touch status ----------------------------
DO $$
DECLARE uid uuid; ok boolean := false;
BEGIN
  SELECT user_id INTO uid FROM _t;
  PERFORM set_config('app.provider_profile_write_scope','stripe_sync', true);
  BEGIN
    UPDATE public.provider_profiles SET status = 'active' WHERE user_id = uid;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  PERFORM set_config('app.provider_profile_write_scope','', true);
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 3: stripe_sync could write status'; END IF;
  RAISE NOTICE 'PASS 3: stripe_sync cannot write status';
END $$;

-- 4. stripe_sync scope may write its own columns -----------------------
DO $$
DECLARE uid uuid;
BEGIN
  SELECT user_id INTO uid FROM _t;
  PERFORM set_config('app.provider_profile_write_scope','stripe_sync', true);
  UPDATE public.provider_profiles
     SET stripe_charges_enabled = stripe_charges_enabled, stripe_disabled_reason = 'regression'
   WHERE user_id = uid;
  PERFORM set_config('app.provider_profile_write_scope','', true);
  RAISE NOTICE 'PASS 4: stripe_sync can write stripe columns';
END $$;

-- 5. scoring_refresh cannot write payout freeze ------------------------
DO $$
DECLARE uid uuid; ok boolean := false;
BEGIN
  SELECT user_id INTO uid FROM _t;
  PERFORM set_config('app.provider_profile_write_scope','scoring_refresh', true);
  BEGIN
    UPDATE public.provider_profiles SET payout_frozen = true WHERE user_id = uid;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  PERFORM set_config('app.provider_profile_write_scope','', true);
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 5: scoring_refresh could freeze payouts'; END IF;
  RAISE NOTICE 'PASS 5: scoring_refresh cannot freeze payouts';
END $$;

-- 6. Unknown scope is rejected ----------------------------------------
DO $$
DECLARE uid uuid; ok boolean := false;
BEGIN
  SELECT user_id INTO uid FROM _t;
  PERFORM set_config('app.provider_profile_write_scope','bogus_scope', true);
  BEGIN
    UPDATE public.provider_profiles SET headline = 'y' WHERE user_id = uid;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  PERFORM set_config('app.provider_profile_write_scope','', true);
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 6: unknown scope accepted'; END IF;
  RAISE NOTICE 'PASS 6: unknown scope rejected';
END $$;

-- 7. migration_backfill requires allowlisted role + scope + no request ctx
DO $$
DECLARE uid uuid; ok boolean := false;
BEGIN
  SELECT user_id INTO uid FROM _t;
  PERFORM set_config('app.provider_profile_write_scope','migration_backfill', true);
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}', true);
  BEGIN
    UPDATE public.provider_profiles SET status = 'active' WHERE user_id = uid;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  PERFORM set_config('request.jwt.claims','', true);
  PERFORM set_config('app.provider_profile_write_scope','', true);
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 7: migration_backfill allowed inside request context'; END IF;
  RAISE NOTICE 'PASS 7: migration_backfill blocked inside request context';
END $$;

-- 8. migration_backfill succeeds when all conditions hold --------------
DO $$
DECLARE uid uuid;
BEGIN
  SELECT user_id INTO uid FROM _t;
  IF current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE NOTICE 'SKIP 8: run as postgres/supabase_admin to exercise migration_backfill';
    RETURN;
  END IF;
  PERFORM set_config('app.provider_profile_write_scope','migration_backfill', true);
  UPDATE public.provider_profiles SET status = status WHERE user_id = uid;
  PERFORM set_config('app.provider_profile_write_scope','', true);
  RAISE NOTICE 'PASS 8: migration_backfill allowed with role + scope + no request context';
END $$;

-- 9. Service RPC rejects out-of-scope columns --------------------------
DO $$
DECLARE uid uuid; ok boolean := false;
BEGIN
  SELECT user_id INTO uid FROM _t;
  BEGIN
    PERFORM public.provider_profile_service_update_v1(uid, 'stripe_sync', '{"status":"active"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 9: service RPC accepted out-of-scope column'; END IF;
  RAISE NOTICE 'PASS 9: service RPC rejects out-of-scope column';
END $$;

-- 10. Legacy blanket bypass is gone ------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_pp_as_service') THEN
    RAISE EXCEPTION 'FAIL 10: legacy _pp_as_service still exists';
  END IF;
  RAISE NOTICE 'PASS 10: legacy blanket bypass removed';
END $$;

ROLLBACK;
