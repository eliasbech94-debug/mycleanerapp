-- RLS Regression Harness
-- Run: psql -v ON_ERROR_STOP=0 -f scripts/rls-regression.sql
--
-- For each role (anon, customer, provider, support, admin, super_admin) we
-- switch to the `authenticated`/`anon` Postgres role AND inject a matching
-- JWT claim so `auth.uid()` and role-check functions behave as they do in the
-- Supabase Data API. Every attempted operation is recorded in _rls_results
-- with expected_allow vs actually_allowed so a mismatch is a FAIL.
--
-- This is a SMOKE SUITE covering the highest-risk tables. Extend the
-- `_rls_cases` seed for full coverage.

BEGIN;

CREATE TEMP TABLE _rls_results (
  role_name        text,
  table_name       text,
  op               text,
  expected_allow   boolean,
  actually_allowed boolean,
  err              text
) ON COMMIT DROP;

-- ─── helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume(_role text, _uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  jwt_role text;
  claims   jsonb;
BEGIN
  jwt_role := CASE WHEN _role = 'anon' THEN 'anon' ELSE 'authenticated' END;
  claims := jsonb_build_object(
    'sub',  COALESCE(_uid::text, ''),
    'role', jwt_role,
    'aud',  'authenticated'
  );
  PERFORM set_config('role', jwt_role, true);
  PERFORM set_config('request.jwt.claims', claims::text, true);
  PERFORM set_config('request.jwt.claim.sub',  COALESCE(_uid::text,''), true);
  PERFORM set_config('request.jwt.claim.role', jwt_role, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.try(
  _role text, _uid uuid, _tbl text, _op text, _sql text, _expected boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE allowed boolean := true; msg text := NULL;
BEGIN
  PERFORM pg_temp.assume(_role, _uid);
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    allowed := false; msg := SQLERRM;
  END;
  RESET role;
  INSERT INTO _rls_results VALUES (_role,_tbl,_op,_expected,allowed,msg);
END $$;

-- ─── fixture users (must pre-exist in auth.users; seed manually if not) ────
-- Replace these UUIDs with real seed users in your dev DB before running.
\set anon_uid       NULL
\set customer_uid   '00000000-0000-0000-0000-000000000001'
\set provider_uid   '00000000-0000-0000-0000-000000000002'
\set support_uid    '00000000-0000-0000-0000-000000000003'
\set admin_uid      '00000000-0000-0000-0000-000000000004'
\set super_uid      '00000000-0000-0000-0000-000000000005'

-- ─── test matrix (highest-risk tables) ─────────────────────────────────────
-- profiles: users read own, admins read all, no one deletes
SELECT pg_temp.try('anon',     NULL,                                'profiles', 'select', 'SELECT 1 FROM public.profiles LIMIT 1', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'profiles', 'select_self', 'SELECT 1 FROM public.profiles WHERE id = auth.uid()', true);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'profiles', 'select_other', 'SELECT 1 FROM public.profiles WHERE id <> auth.uid() LIMIT 1', false);
SELECT pg_temp.try('admin',    :'admin_uid'::uuid,                  'profiles', 'select_any', 'SELECT 1 FROM public.profiles LIMIT 1', true);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'profiles', 'update_self_provider_id', 'UPDATE public.profiles SET provider_id = ''HACK'' WHERE id = auth.uid()', false);

-- user_roles: only admin/super_admin writes; users read own
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'user_roles','insert_self_admin','INSERT INTO public.user_roles(user_id,role) VALUES (auth.uid(),''admin'')', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'user_roles','select_self','SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()', true);
SELECT pg_temp.try('admin',    :'admin_uid'::uuid,                  'user_roles','insert_other_support','INSERT INTO public.user_roles(user_id,role) VALUES (''00000000-0000-0000-0000-000000000099'',''support'')', true);

-- bookings: customer sees own; provider sees theirs; no cross-tenant
SELECT pg_temp.try('anon',     NULL,                                'bookings','select','SELECT 1 FROM public.bookings LIMIT 1', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'bookings','select_other','SELECT 1 FROM public.bookings WHERE customer_user_id <> auth.uid() LIMIT 1', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'bookings','update_pays','UPDATE public.bookings SET customer_pays = 1 WHERE customer_user_id = auth.uid()', false);

-- messages: only conversation participants; internal notes staff-only
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'messages','select_all','SELECT 1 FROM public.messages LIMIT 1', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'messages','insert_internal_note',
  'INSERT INTO public.messages(conversation_id,sender_user_id,sender_role,message_type,body,is_internal_note) '
  'VALUES (gen_random_uuid(),auth.uid(),''customer'',''text'',''x'',true)', false);

-- admin_audit_log: append-only, admins read
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'admin_audit_log','select','SELECT 1 FROM public.admin_audit_log LIMIT 1', false);
SELECT pg_temp.try('admin',    :'admin_uid'::uuid,                  'admin_audit_log','delete','DELETE FROM public.admin_audit_log WHERE false', false);

-- consent_ledger / user_legal_acceptances: append-only
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'consent_ledger','update','UPDATE public.consent_ledger SET consent_type=''x'' WHERE false', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'user_legal_acceptances','update','UPDATE public.user_legal_acceptances SET accepted_at=now() WHERE false', false);

-- finance_payouts / statements: provider sees own, admin all, no writes from customer
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'finance_payouts','select','SELECT 1 FROM public.finance_payouts LIMIT 1', false);
SELECT pg_temp.try('anon',     NULL,                                'finance_statements','select','SELECT 1 FROM public.finance_statements LIMIT 1', false);

-- stripe_disputes: no anon, no customer writes
SELECT pg_temp.try('anon',     NULL,                                'stripe_disputes','select','SELECT 1 FROM public.stripe_disputes LIMIT 1', false);
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'stripe_disputes','insert','INSERT INTO public.stripe_disputes(booking_id) VALUES(gen_random_uuid())', false);

-- provider_tax_profiles: plaintext write must be blocked by trigger
SELECT pg_temp.try('provider', :'provider_uid'::uuid,               'provider_tax_profiles','insert_plaintext_vat',
  'INSERT INTO public.provider_tax_profiles(user_id,vat_number) VALUES (auth.uid(),''DK12345678'')', false);

-- customer_addresses: only owner; place_id required by trigger
SELECT pg_temp.try('customer', :'customer_uid'::uuid,               'customer_addresses','insert_other_user',
  'INSERT INTO public.customer_addresses(user_id) VALUES (''00000000-0000-0000-0000-000000000099'')', false);

-- conversations: participants + support scoping
SELECT pg_temp.try('anon',     NULL,                                'conversations','select','SELECT 1 FROM public.conversations LIMIT 1', false);
SELECT pg_temp.try('support',  :'support_uid'::uuid,                'conversations','select_support_kinds',
  'SELECT 1 FROM public.conversations WHERE kind = ''customer_support'' LIMIT 1', true);

-- ─── report ────────────────────────────────────────────────────────────────
\echo
\echo '=== RLS Regression Report ==='
SELECT
  role_name, table_name, op,
  expected_allow AS expected,
  actually_allowed AS actual,
  CASE WHEN expected_allow = actually_allowed THEN 'PASS' ELSE 'FAIL' END AS result,
  left(coalesce(err,''),80) AS err_head
FROM _rls_results
ORDER BY result DESC, role_name, table_name, op;

\echo
\echo '=== Summary ==='
SELECT
  count(*) FILTER (WHERE expected_allow = actually_allowed)   AS pass,
  count(*) FILTER (WHERE expected_allow <> actually_allowed)  AS fail,
  count(*)                                                    AS total
FROM _rls_results;

ROLLBACK;
