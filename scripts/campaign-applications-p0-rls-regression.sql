-- ============================================================================
-- P0 regression: campaign_applications must not be writable/readable directly
-- by anon or authenticated clients.
--
-- Public applications are created ONLY through the edge function
-- `campaign-apply`, which validates Turnstile, per-IP/per-email rate limits and
-- input before writing with the service_role key.
--
-- Run against an ISOLATED development/staging database only. Never production.
-- Usage: psql -f scripts/campaign-applications-p0-rls-regression.sql
-- ============================================================================

\set ON_ERROR_STOP off

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures (created as the migration/owner role, bypassing RLS)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _p0_ctx (k text primary key, v text);

DO $$
DECLARE
  v_campaign uuid;
  v_owner    uuid := gen_random_uuid();
  v_other    uuid := gen_random_uuid();
  v_app_own  uuid;
  v_app_oth  uuid;
BEGIN
  SELECT id INTO v_campaign FROM public.campaigns ORDER BY created_at LIMIT 1;
  IF v_campaign IS NULL THEN
    INSERT INTO public.campaigns (slug, kind, lifecycle)
    VALUES ('p0-regression-' || substr(gen_random_uuid()::text, 1, 8), 'provider_recruitment', 'active')
    RETURNING id INTO v_campaign;
  END IF;

  INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email, user_id)
  VALUES (v_campaign, 'DK', 'P0 Owner', 'p0-owner-' || substr(gen_random_uuid()::text,1,8) || '@example.test', v_owner)
  RETURNING id INTO v_app_own;

  INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email, user_id)
  VALUES (v_campaign, 'DK', 'P0 Other', 'p0-other-' || substr(gen_random_uuid()::text,1,8) || '@example.test', v_other)
  RETURNING id INTO v_app_oth;

  INSERT INTO _p0_ctx VALUES
    ('campaign', v_campaign::text), ('owner', v_owner::text), ('other', v_other::text),
    ('app_own', v_app_own::text), ('app_other', v_app_oth::text);
END $$;

-- Helper: assert
CREATE OR REPLACE FUNCTION pg_temp._assert(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS: %', label;
  ELSE RAISE EXCEPTION 'FAIL: %', label;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. anon cannot INSERT directly
-- ---------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false; cid uuid;
BEGIN
  SELECT v::uuid INTO cid FROM _p0_ctx WHERE k='campaign';
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email)
    VALUES (cid, 'DK', 'Anon Attack', 'anon-attack@example.test');
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN ok := true;
  END;
  RESET ROLE;
  PERFORM pg_temp._assert('1. anon cannot INSERT into campaign_applications', ok);
END $$;

-- ---------------------------------------------------------------------------
-- 2. authenticated cannot INSERT directly
-- ---------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false; cid uuid; uid uuid;
BEGIN
  SELECT v::uuid INTO cid FROM _p0_ctx WHERE k='campaign';
  SELECT v::uuid INTO uid FROM _p0_ctx WHERE k='owner';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email, user_id)
    VALUES (cid, 'DK', 'Auth Attack', 'auth-attack@example.test', uid);
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN ok := true;
  END;
  RESET ROLE;
  PERFORM pg_temp._assert('2. authenticated cannot INSERT into campaign_applications', ok);
END $$;

-- ---------------------------------------------------------------------------
-- 3. anon cannot SELECT
-- ---------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false; n int;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.campaign_applications;
    ok := false;
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN ok := true;
  END;
  RESET ROLE;
  PERFORM pg_temp._assert('3. anon cannot SELECT campaign_applications', ok);
END $$;

-- ---------------------------------------------------------------------------
-- 4. authenticated CAN read its own application
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; uid uuid; aid uuid;
BEGIN
  SELECT v::uuid INTO uid FROM _p0_ctx WHERE k='owner';
  SELECT v::uuid INTO aid FROM _p0_ctx WHERE k='app_own';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.campaign_applications WHERE id = aid;
  RESET ROLE;
  PERFORM pg_temp._assert('4. authenticated can read own application', n = 1);
END $$;

-- ---------------------------------------------------------------------------
-- 5. authenticated cannot read other users' applications
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; uid uuid; aid uuid;
BEGIN
  SELECT v::uuid INTO uid FROM _p0_ctx WHERE k='owner';
  SELECT v::uuid INTO aid FROM _p0_ctx WHERE k='app_other';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.campaign_applications WHERE id = aid;
  RESET ROLE;
  PERFORM pg_temp._assert('5. authenticated cannot read foreign application', n = 0);
END $$;

-- ---------------------------------------------------------------------------
-- 6. service_role can still INSERT
-- ---------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false; cid uuid;
BEGIN
  SELECT v::uuid INTO cid FROM _p0_ctx WHERE k='campaign';
  SET LOCAL ROLE service_role;
  INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email)
  VALUES (cid, 'DK', 'Service Role', 'svc-' || substr(gen_random_uuid()::text,1,8) || '@example.test');
  ok := true;
  RESET ROLE;
  PERFORM pg_temp._assert('6. service_role can still INSERT', ok);
END $$;

-- ---------------------------------------------------------------------------
-- 7. admin / support read access preserved
-- ---------------------------------------------------------------------------
DO $$
DECLARE n_admin int; n_support int; admin_id uuid := gen_random_uuid(); support_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin'), (support_id, 'support');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n_admin FROM public.campaign_applications;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', support_id, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n_support FROM public.campaign_applications;
  RESET ROLE;

  PERFORM pg_temp._assert('7a. admin retains read access', n_admin >= 2);
  PERFORM pg_temp._assert('7b. support retains read access', n_support >= 2);
END $$;

-- ---------------------------------------------------------------------------
-- 8. Privileged-field injection attempts are rejected (no INSERT privilege)
-- ---------------------------------------------------------------------------
DO $$
DECLARE cid uuid; uid uuid; other uuid; ok1 boolean := false; ok2 boolean := false; ok3 boolean := false; ok4 boolean := false;
BEGIN
  SELECT v::uuid INTO cid FROM _p0_ctx WHERE k='campaign';
  SELECT v::uuid INTO uid FROM _p0_ctx WHERE k='owner';
  SELECT v::uuid INTO other FROM _p0_ctx WHERE k='other';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  BEGIN
    INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email, status)
    VALUES (cid, 'DK', 'X', 'x1@example.test', 'approved');
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN ok1 := true; END;

  BEGIN
    INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email, assigned_number)
    VALUES (cid, 'DK', 'X', 'x2@example.test', 1);
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN ok2 := true; END;

  BEGIN
    INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email, email_verified_at)
    VALUES (cid, 'DK', 'X', 'x3@example.test', now());
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN ok3 := true; END;

  BEGIN
    INSERT INTO public.campaign_applications (campaign_id, country_code, full_name, email, user_id)
    VALUES (cid, 'DK', 'X', 'x4@example.test', other);
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN ok4 := true; END;

  RESET ROLE;

  PERFORM pg_temp._assert('8a. status=approved insert rejected', ok1);
  PERFORM pg_temp._assert('8b. assigned_number insert rejected', ok2);
  PERFORM pg_temp._assert('8c. email_verified_at insert rejected', ok3);
  PERFORM pg_temp._assert('8d. foreign user_id insert rejected', ok4);
END $$;

-- Nothing is persisted: this is a verification-only script.
ROLLBACK;
