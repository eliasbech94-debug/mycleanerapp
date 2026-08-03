-- Knowledge / incident_evidence RLS regression harness.
--
-- Run against an ISOLATED staging DB only. NEVER against production.
--   psql -v ON_ERROR_STOP=0 -f scripts/knowledge-incident-evidence-rls-regression.sql
--
-- The script assumes fixtures created by service-role setup (see FIXTURES
-- block below). Service role is used ONLY to plant fixtures & clean up,
-- NEVER as evidence that RLS permits an action. Every assertion is executed
-- as either the `anon` or `authenticated` Postgres role with the matching
-- JWT claim, mirroring how PostgREST evaluates policies at request time.
--
-- All results are collected in _ev_results and reported as PASS/FAIL.

BEGIN;

CREATE TEMP TABLE _ev_results (
  role_name        text,
  scope            text,   -- 'table' | 'storage.objects' | 'trigger'
  op               text,
  expected_allow   boolean,
  actually_allowed boolean,
  err              text
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.assume(_role text, _uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE jwt_role text; claims jsonb;
BEGIN
  jwt_role := CASE WHEN _role = 'anon' THEN 'anon' ELSE 'authenticated' END;
  claims := jsonb_build_object(
    'sub', COALESCE(_uid::text,''),
    'role', jwt_role,
    'aud', 'authenticated'
  );
  PERFORM set_config('role', jwt_role, true);
  PERFORM set_config('request.jwt.claims', claims::text, true);
  PERFORM set_config('request.jwt.claim.sub',  COALESCE(_uid::text,''), true);
  PERFORM set_config('request.jwt.claim.role', jwt_role, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.try(
  _role text, _uid uuid, _scope text, _op text, _sql text, _expected boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE allowed boolean := true; msg text := NULL; row_ct int;
BEGIN
  PERFORM pg_temp.assume(_role, _uid);
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS row_ct = ROW_COUNT;
    -- A SELECT that returns 0 rows under RLS is NOT allowed access. Treat
    -- as "denied" so negative tests can prove filtering rather than empty tables.
    IF _op LIKE 'select%' AND row_ct = 0 THEN
      allowed := false; msg := 'zero_rows';
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    allowed := false; msg := SQLERRM;
  END;
  RESET role;
  INSERT INTO _ev_results VALUES (_role,_scope,_op,_expected,allowed,msg);
END $$;

-- ─── FIXTURES ──────────────────────────────────────────────────────────────
-- Expect these users to already exist in auth.users on the staging DB. Seed
-- them via the service-role script `staging-validation/seed/create-test-users.ts`
-- or by hand; replace the UUIDs below to match your staging seed.
\set anon_uid       NULL
\set customer_uid   '00000000-0000-0000-0000-000000001001'
\set providerA_uid  '00000000-0000-0000-0000-000000002001'
\set providerB_uid  '00000000-0000-0000-0000-000000002002'
\set editor_uid     '00000000-0000-0000-0000-000000003001'   -- has editor-only, no staff role
\set publisher_uid  '00000000-0000-0000-0000-000000003002'
\set support_uid    '00000000-0000-0000-0000-000000003003'
\set employee_uid   '00000000-0000-0000-0000-000000003004'
\set admin_uid      '00000000-0000-0000-0000-000000003005'
\set super_uid      '00000000-0000-0000-0000-000000003006'

-- Two incident reports, one per provider. Service role is used ONLY for
-- fixture setup; it is not part of any assertion below.
INSERT INTO public.incident_reports (id, provider_user_id, title, description, severity, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', :'providerA_uid'::uuid, 'A', 'a', 'low','submitted'),
  ('22222222-2222-2222-2222-222222222222', :'providerB_uid'::uuid, 'B', 'b', 'low','submitted')
ON CONFLICT (id) DO NOTHING;

-- Existing evidence row for provider A (fixture): needed so provider B can
-- try to read someone else's data.
INSERT INTO public.incident_evidence
  (id, incident_id, storage_path, mime_type, file_size, uploaded_by)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
  'image/jpeg', 1024, :'providerA_uid'::uuid
) ON CONFLICT (id) DO NOTHING;

-- ─── incident_evidence TABLE POLICIES ──────────────────────────────────────
-- OWN read: provider A can see own row (expected)
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'table', 'select_own',
  'SELECT 1 FROM public.incident_evidence WHERE incident_id=''11111111-1111-1111-1111-111111111111''', true);

-- CROSS-tenant read: provider B must NOT see provider A's evidence
SELECT pg_temp.try('providerB', :'providerB_uid'::uuid, 'table', 'select_other',
  'SELECT 1 FROM public.incident_evidence WHERE incident_id=''11111111-1111-1111-1111-111111111111''', false);

-- Customer / anon must never read
SELECT pg_temp.try('customer', :'customer_uid'::uuid, 'table', 'select_any',
  'SELECT 1 FROM public.incident_evidence LIMIT 1', false);
SELECT pg_temp.try('anon', NULL, 'table', 'select_any',
  'SELECT 1 FROM public.incident_evidence LIMIT 1', false);

-- CMS roles: editor / publisher must NOT get evidence access solely from CMS role
SELECT pg_temp.try('editor', :'editor_uid'::uuid, 'table', 'select_any',
  'SELECT 1 FROM public.incident_evidence LIMIT 1', false);
SELECT pg_temp.try('publisher', :'publisher_uid'::uuid, 'table', 'select_any',
  'SELECT 1 FROM public.incident_evidence LIMIT 1', false);

-- Staff read allowed
SELECT pg_temp.try('support', :'support_uid'::uuid, 'table', 'select_any', 'SELECT 1 FROM public.incident_evidence LIMIT 1', true);
SELECT pg_temp.try('admin', :'admin_uid'::uuid, 'table', 'select_any', 'SELECT 1 FROM public.incident_evidence LIMIT 1', true);
SELECT pg_temp.try('super', :'super_uid'::uuid, 'table', 'select_any', 'SELECT 1 FROM public.incident_evidence LIMIT 1', true);

-- Direct client INSERT MUST fail for every role — only the edge function
-- (service_role) should ever write metadata rows.
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'table', 'insert_own',
  'INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by) VALUES ('
  '''11111111-1111-1111-1111-111111111111'','
  '''11111111-1111-1111-1111-111111111111/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'','
  '''image/jpeg'',10,auth.uid())', false);
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'table', 'insert_other_incident',
  'INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by) VALUES ('
  '''22222222-2222-2222-2222-222222222222'','
  '''22222222-2222-2222-2222-222222222222/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg'','
  '''image/jpeg'',10,auth.uid())', false);
SELECT pg_temp.try('editor', :'editor_uid'::uuid, 'table', 'insert_any',
  'INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by) VALUES ('
  '''11111111-1111-1111-1111-111111111111'','
  '''11111111-1111-1111-1111-111111111111/dddddddd-dddd-dddd-dddd-dddddddddddd.jpg'','
  '''image/jpeg'',10,auth.uid())', false);
SELECT pg_temp.try('admin', :'admin_uid'::uuid, 'table', 'insert_any',
  'INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by) VALUES ('
  '''11111111-1111-1111-1111-111111111111'','
  '''11111111-1111-1111-1111-111111111111/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg'','
  '''image/jpeg'',10,auth.uid())', false);

-- Direct UPDATE / DELETE from any client role must fail
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'table', 'update_own',
  'UPDATE public.incident_evidence SET caption=''hack'' WHERE id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', false);
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'table', 'delete_own',
  'DELETE FROM public.incident_evidence WHERE id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', false);
SELECT pg_temp.try('editor', :'editor_uid'::uuid, 'table', 'delete_any',
  'DELETE FROM public.incident_evidence WHERE false', false);

-- ─── PATH TRIGGER ──────────────────────────────────────────────────────────
-- Uses service role (via SET LOCAL role postgres) to bypass RLS so that we
-- test ONLY the trigger contract, not the RLS layer. The trigger must reject
-- malformed paths regardless of the actor.
SET LOCAL role postgres;
DO $$
DECLARE bad_paths text[] := ARRAY[
  '11111111-1111-1111-1111-111111111111/notauuid.jpg',            -- non-uuid filename
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.svg',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.exe',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg.exe',
  '../11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
  '11111111-1111-1111-1111-111111111111//aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
  '11111111-1111-1111-1111-111111111111/sub/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
  '22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg' -- wrong incident
];
p text; ok boolean;
BEGIN
  FOREACH p IN ARRAY bad_paths LOOP
    ok := true;
    BEGIN
      INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by)
      VALUES ('11111111-1111-1111-1111-111111111111', p, 'image/jpeg', 10, '00000000-0000-0000-0000-000000002001');
    EXCEPTION WHEN OTHERS THEN ok := false;
    END;
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_bad_path',false,ok, p);
  END LOOP;

  -- Size / MIME edge cases
  BEGIN
    INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by)
    VALUES ('11111111-1111-1111-1111-111111111111',
      '11111111-1111-1111-1111-111111111111/99999999-9999-9999-9999-999999999999.jpg',
      'image/jpeg', 0, '00000000-0000-0000-0000-000000002001');
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_zero_size',false,true,NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_zero_size',false,false,SQLERRM);
  END;

  BEGIN
    INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by)
    VALUES ('11111111-1111-1111-1111-111111111111',
      '11111111-1111-1111-1111-111111111111/88888888-8888-8888-8888-888888888888.jpg',
      'image/jpeg', 11*1024*1024, '00000000-0000-0000-0000-000000002001');
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_oversized',false,true,NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_oversized',false,false,SQLERRM);
  END;

  BEGIN
    INSERT INTO public.incident_evidence(incident_id,storage_path,mime_type,file_size,uploaded_by)
    VALUES ('11111111-1111-1111-1111-111111111111',
      '11111111-1111-1111-1111-111111111111/77777777-7777-7777-7777-777777777777.jpg',
      'text/html', 10, '00000000-0000-0000-0000-000000002001');
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_bad_mime',false,true,NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_bad_mime',false,false,SQLERRM);
  END;
END $$;
RESET role;

-- ─── storage.objects DIRECT ACCESS ─────────────────────────────────────────
-- Bucket-level RLS: every non-service-role client must be blocked from all
-- verbs regardless of path. Path-variant probes catch policies that split on
-- `name LIKE '...'` and could be bypassed with encoded segments.
SELECT pg_temp.try('anon',    NULL,                     'storage.objects','select',
  'SELECT 1 FROM storage.objects WHERE bucket_id=''incident-evidence'' LIMIT 1', false);
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'storage.objects','select_own',
  'SELECT 1 FROM storage.objects WHERE bucket_id=''incident-evidence'' LIMIT 1', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,   'storage.objects','select', 'SELECT 1 FROM storage.objects WHERE bucket_id=''incident-evidence'' LIMIT 1', false);
SELECT pg_temp.try('editor',   :'editor_uid'::uuid,     'storage.objects','select', 'SELECT 1 FROM storage.objects WHERE bucket_id=''incident-evidence'' LIMIT 1', false);
SELECT pg_temp.try('admin',    :'admin_uid'::uuid,      'storage.objects','select', 'SELECT 1 FROM storage.objects WHERE bucket_id=''incident-evidence'' LIMIT 1', false);
SELECT pg_temp.try('super',    :'super_uid'::uuid,      'storage.objects','select', 'SELECT 1 FROM storage.objects WHERE bucket_id=''incident-evidence'' LIMIT 1', false);

SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'storage.objects','insert',
  'INSERT INTO storage.objects(bucket_id,name,owner) VALUES(''incident-evidence'',''11111111-1111-1111-1111-111111111111/xxxx.jpg'',auth.uid())', false);
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'storage.objects','update',
  'UPDATE storage.objects SET name=name WHERE bucket_id=''incident-evidence''', false);
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'storage.objects','delete',
  'DELETE FROM storage.objects WHERE bucket_id=''incident-evidence'' AND false', false);

-- Casing / mixed-case bucket spoof: RLS matches bucket_id exactly (text),
-- so a spoofed name should not exist and should also not be creatable.
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'storage.objects','insert_spoof_bucket',
  'INSERT INTO storage.objects(bucket_id,name,owner) VALUES(''Incident-Evidence'',''foo'',auth.uid())', false);

-- ─── REPORT ────────────────────────────────────────────────────────────────
\echo
\echo '=== incident_evidence RLS regression ==='
SELECT role_name, scope, op,
       expected_allow AS expected,
       actually_allowed AS actual,
       CASE WHEN expected_allow = actually_allowed THEN 'PASS' ELSE 'FAIL' END AS result,
       left(coalesce(err,''),80) AS err_head
FROM _ev_results
ORDER BY result DESC, scope, role_name, op;

\echo
\echo '=== Summary ==='
SELECT count(*) FILTER (WHERE expected_allow = actually_allowed)   AS pass,
       count(*) FILTER (WHERE expected_allow <> actually_allowed)  AS fail,
       count(*)                                                    AS total
FROM _ev_results;

ROLLBACK;
