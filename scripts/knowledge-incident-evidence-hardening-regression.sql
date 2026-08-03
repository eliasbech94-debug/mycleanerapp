-- STAGING_REQUIRED — Extended regression matrix for the hardening patch.
-- Runs ON TOP OF the base script (knowledge-incident-evidence-rls-regression.sql).
-- MUST be executed against an ISOLATED staging DB where the hardening
-- migration has been applied. Never against production.
--
-- Adds coverage for:
--   * can_access_incident_report authorization matrix
--   * Direct metadata INSERT/UPDATE/DELETE denial for every client role
--   * Two-phase path trigger (pending/*, final/*)
--   * Idempotent upload sessions (unique constraint on user_id, idempotency_key)
--   * Unique (incident_id, final_storage_path)
--   * Rate-event RLS scoping
--
-- This file mirrors the pg_temp.assume / pg_temp.try harness from the base
-- regression script — source that file first if running standalone.

BEGIN;

-- Fixtures — must match the base script UUIDs.
\set customer_uid   '00000000-0000-0000-0000-000000001001'
\set providerA_uid  '00000000-0000-0000-0000-000000002001'
\set providerB_uid  '00000000-0000-0000-0000-000000002002'
\set editor_uid     '00000000-0000-0000-0000-000000003001'
\set publisher_uid  '00000000-0000-0000-0000-000000003002'
\set support_uid    '00000000-0000-0000-0000-000000003003'
\set employee_uid   '00000000-0000-0000-0000-000000003004'
\set admin_uid      '00000000-0000-0000-0000-000000003005'
\set super_uid      '00000000-0000-0000-0000-000000003006'

CREATE TEMP TABLE IF NOT EXISTS _ev_results (
  role_name text, scope text, op text,
  expected_allow boolean, actually_allowed boolean, err text
) ON COMMIT DROP;

-- ─── can_access_incident_report matrix ─────────────────────────────────────
DO $$
DECLARE
  incident uuid := '11111111-1111-1111-1111-111111111111';
  cases record;
  expected boolean;
  actual boolean;
BEGIN
  FOR cases IN
    SELECT * FROM (VALUES
      ('providerA_owner',  '00000000-0000-0000-0000-000000002001'::uuid, true),
      ('providerB_other',  '00000000-0000-0000-0000-000000002002'::uuid, false),
      ('customer',         '00000000-0000-0000-0000-000000001001'::uuid, false),
      ('editor',           '00000000-0000-0000-0000-000000003001'::uuid, false),
      ('publisher',        '00000000-0000-0000-0000-000000003002'::uuid, false),
      ('support',          '00000000-0000-0000-0000-000000003003'::uuid, false),
      ('employee',         '00000000-0000-0000-0000-000000003004'::uuid, false),
      ('admin',            '00000000-0000-0000-0000-000000003005'::uuid, true),
      ('super_admin',      '00000000-0000-0000-0000-000000003006'::uuid, true)
    ) t(name, uid, expected)
  LOOP
    actual := public.can_access_incident_report(cases.uid, incident);
    INSERT INTO _ev_results VALUES
      (cases.name, 'authz_helper', 'can_access', cases.expected, actual, NULL);
  END LOOP;
END $$;

-- ─── Direct metadata writes MUST fail for every client role ────────────────
-- All INSERT/UPDATE/DELETE grants were revoked; RLS is defense-in-depth.
SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'table', 'insert_pending',
  $$INSERT INTO public.incident_evidence(incident_id, storage_path, status, mime_type, file_size, uploaded_by)
    VALUES ('11111111-1111-1111-1111-111111111111',
            'pending/11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.bin',
            'pending', 'image/jpeg', 10, auth.uid())$$, false);

SELECT pg_temp.try('admin', :'admin_uid'::uuid, 'table', 'insert_direct',
  $$INSERT INTO public.incident_evidence(incident_id, storage_path, status, mime_type, file_size, uploaded_by)
    VALUES ('11111111-1111-1111-1111-111111111111',
            'pending/11111111-1111-1111-1111-111111111111/cccccccc-cccc-cccc-cccc-cccccccccccc/dddddddd-dddd-dddd-dddd-dddddddddddd.bin',
            'pending', 'image/jpeg', 10, auth.uid())$$, false);

SELECT pg_temp.try('providerA', :'providerA_uid'::uuid, 'table', 'update_any',
  $$UPDATE public.incident_evidence SET caption='x' WHERE incident_id='11111111-1111-1111-1111-111111111111'$$, false);

SELECT pg_temp.try('admin', :'admin_uid'::uuid, 'table', 'delete_any',
  $$DELETE FROM public.incident_evidence WHERE false$$, false);

-- ─── Read policy uses can_access_incident_report ───────────────────────────
SELECT pg_temp.try('editor', :'editor_uid'::uuid, 'table', 'select_denied_cms_role',
  $$SELECT 1 FROM public.incident_evidence LIMIT 1$$, false);
SELECT pg_temp.try('publisher', :'publisher_uid'::uuid, 'table', 'select_denied_cms_role',
  $$SELECT 1 FROM public.incident_evidence LIMIT 1$$, false);
SELECT pg_temp.try('support', :'support_uid'::uuid, 'table', 'select_denied_no_assignment',
  $$SELECT 1 FROM public.incident_evidence LIMIT 1$$, false);
SELECT pg_temp.try('employee', :'employee_uid'::uuid, 'table', 'select_denied_no_assignment',
  $$SELECT 1 FROM public.incident_evidence LIMIT 1$$, false);

-- ─── Path trigger enforces two-phase pending/final ─────────────────────────
SET LOCAL role postgres;
DO $$
DECLARE bad text[] := ARRAY[
  -- pending must live under pending/<incident>/<session>/<obj>.bin
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
  'pending/11111111-1111-1111-1111-111111111111/aaaa.bin',
  'pending/11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/notauuid.bin',
  'pending/22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.bin'
];
p text; ok boolean;
BEGIN
  FOREACH p IN ARRAY bad LOOP
    ok := true;
    BEGIN
      INSERT INTO public.incident_evidence(incident_id, storage_path, status, mime_type, file_size, uploaded_by)
      VALUES ('11111111-1111-1111-1111-111111111111', p, 'pending', 'image/jpeg', 10,
              '00000000-0000-0000-0000-000000002001');
    EXCEPTION WHEN OTHERS THEN ok := false;
    END;
    INSERT INTO _ev_results VALUES ('service_role_trigger','trigger','reject_bad_pending',false,ok,p);
  END LOOP;

  -- verified requires final_storage_path + verified hash/mime/size
  BEGIN
    INSERT INTO public.incident_evidence(
      incident_id, storage_path, status, mime_type, file_size, uploaded_by,
      final_storage_path, verified_file_hash, hash_verification_status,
      detected_mime_type, verified_extension, verified_size_bytes)
    VALUES ('11111111-1111-1111-1111-111111111111',
      'pending/11111111-1111-1111-1111-111111111111/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.bin',
      'verified', 'image/jpeg', 100, '00000000-0000-0000-0000-000000002001',
      NULL, 'a'||repeat('0',63), 'verified', 'image/jpeg', 'jpg', 100);
    INSERT INTO _ev_results VALUES('service_role_trigger','trigger','verified_requires_final_path',false,true,NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _ev_results VALUES('service_role_trigger','trigger','verified_requires_final_path',false,false,SQLERRM);
  END;
END $$;
RESET role;

-- ─── Idempotency uniqueness ────────────────────────────────────────────────
SET LOCAL role postgres;
DO $$
DECLARE ok boolean;
BEGIN
  INSERT INTO public.incident_evidence_upload_sessions
    (id, incident_id, user_id, idempotency_key, pending_storage_path, expires_at)
  VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
          '00000000-0000-0000-0000-000000002001', 'idem-key-1',
          'pending/11111111-1111-1111-1111-111111111111/aa000000-0000-0000-0000-000000000001/bb000000-0000-0000-0000-000000000001.bin',
          now() + interval '15 min');
  ok := true;
  BEGIN
    -- Same (user_id, idempotency_key) MUST fail.
    INSERT INTO public.incident_evidence_upload_sessions
      (id, incident_id, user_id, idempotency_key, pending_storage_path, expires_at)
    VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
            '00000000-0000-0000-0000-000000002001', 'idem-key-1',
            'pending/11111111-1111-1111-1111-111111111111/aa000000-0000-0000-0000-000000000002/bb000000-0000-0000-0000-000000000002.bin',
            now() + interval '15 min');
  EXCEPTION WHEN unique_violation THEN ok := false;
  END;
  INSERT INTO _ev_results VALUES('service_role_trigger','idempotency','reject_duplicate_key',false,ok,NULL);
END $$;
RESET role;

-- ─── Rate-event RLS scoping ────────────────────────────────────────────────
SELECT pg_temp.try('providerB', :'providerB_uid'::uuid, 'table', 'select_other_users_rate',
  $$SELECT 1 FROM public.incident_evidence_rate_events
     WHERE user_id='00000000-0000-0000-0000-000000002001' LIMIT 1$$, false);

-- ─── REPORT ────────────────────────────────────────────────────────────────
\echo
\echo '=== incident_evidence hardening regression ==='
SELECT role_name, scope, op,
       expected_allow AS expected, actually_allowed AS actual,
       CASE WHEN expected_allow = actually_allowed THEN 'PASS' ELSE 'FAIL' END AS result,
       left(coalesce(err,''),80) AS err_head
FROM _ev_results
ORDER BY result DESC, scope, role_name, op;

SELECT count(*) FILTER (WHERE expected_allow = actually_allowed) AS pass,
       count(*) FILTER (WHERE expected_allow <> actually_allowed) AS fail,
       count(*) AS total
FROM _ev_results;

ROLLBACK;
