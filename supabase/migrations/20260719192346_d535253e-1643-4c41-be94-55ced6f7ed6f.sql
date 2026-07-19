
-- =========================================================
-- Production Security Hardening — Phase 1
-- Idempotent. Data-preserving. Rollback notes in report.
-- =========================================================

-- ---------- Part 1: Lock down internal config tables ----------

-- finance_settings — drop permissive SELECT (admin ALL policy already covers admin)
DROP POLICY IF EXISTS "Anyone authenticated can read finance settings" ON public.finance_settings;

-- platform_tax_settings — drop permissive SELECT
DROP POLICY IF EXISTS "Authenticated read platform tax settings" ON public.platform_tax_settings;

-- market_rate_thresholds — drop permissive SELECT and add admin/employee SELECT
DROP POLICY IF EXISTS "Authenticated can read thresholds" ON public.market_rate_thresholds;
DROP POLICY IF EXISTS "Admins and employees read thresholds" ON public.market_rate_thresholds;
CREATE POLICY "Admins and employees read thresholds"
  ON public.market_rate_thresholds
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'employee'::app_role));

-- feature_flags — drop permissive SELECT. Client access goes through evaluate_feature_flag RPC.
DROP POLICY IF EXISTS "authenticated read flags" ON public.feature_flags;

-- ---------- Public-safe feature-flag evaluator RPC ----------
-- Returns only a boolean; never exposes rollout_pct/rollout_seed/target_id/notes.
CREATE OR REPLACE FUNCTION public.evaluate_feature_flag(
  _flag_key   text,
  _user_id    uuid    DEFAULT NULL,
  _provider_id text   DEFAULT NULL,
  _country_iso text   DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         public.feature_flags%ROWTYPE;
  v_subject text;
  v_bucket  int;
  v_hash    bytea;
BEGIN
  IF _flag_key IS NULL OR length(_flag_key) = 0 OR length(_flag_key) > 128 THEN
    RETURN false;
  END IF;

  -- Precedence: user → provider → country → beta → global
  FOR r IN
    SELECT * FROM public.feature_flags
     WHERE flag_key = _flag_key
       AND (
         (scope = 'user'     AND _user_id     IS NOT NULL AND target_id = _user_id::text) OR
         (scope = 'provider' AND _provider_id IS NOT NULL AND target_id = _provider_id)   OR
         (scope = 'country'  AND _country_iso IS NOT NULL AND target_id = upper(_country_iso)) OR
         (scope IN ('beta','global') AND target_id IS NULL)
       )
     ORDER BY CASE scope
                WHEN 'user' THEN 1 WHEN 'provider' THEN 2
                WHEN 'country' THEN 3 WHEN 'beta' THEN 4 ELSE 5 END
     LIMIT 1
  LOOP
    IF NOT r.enabled THEN RETURN false; END IF;
    IF r.rollout_pct >= 100 THEN RETURN true; END IF;
    v_subject := COALESCE(_user_id::text, _provider_id, _country_iso, 'anon');
    v_hash := extensions.digest(r.flag_key || ':' || v_subject || ':' || COALESCE(r.rollout_seed,''), 'sha256');
    v_bucket := (get_byte(v_hash,0) * 16777216
               + get_byte(v_hash,1) * 65536
               + get_byte(v_hash,2) * 256
               + get_byte(v_hash,3)) % 100;
    RETURN v_bucket < r.rollout_pct;
  END LOOP;

  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.evaluate_feature_flag(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_feature_flag(text, uuid, text, text) TO anon, authenticated, service_role;


-- ---------- Part 2/3: Harden SECURITY DEFINER functions ----------

-- Internal-only functions: revoke ALL, grant only to service_role.
-- Also add an explicit service-role guard inside each callable RPC.

-- next_invoice_number
REVOKE ALL ON FUNCTION public.next_invoice_number(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(text) TO service_role;

CREATE OR REPLACE FUNCTION public.next_invoice_number(_country_code text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_prefix text; v_seq bigint; v_year int := EXTRACT(YEAR FROM now())::int;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;
  UPDATE public.platform_tax_settings
     SET next_invoice_number = next_invoice_number + 1, updated_at = now()
   WHERE country_code = upper(_country_code)
  RETURNING invoice_series_prefix, next_invoice_number - 1
    INTO v_prefix, v_seq;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'platform_tax_settings row missing for country %', _country_code;
  END IF;
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');
END; $function$;

-- next_credit_note_number
REVOKE ALL ON FUNCTION public.next_credit_note_number(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_credit_note_number(text) TO service_role;

CREATE OR REPLACE FUNCTION public.next_credit_note_number(_country_code text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_prefix text; v_seq bigint; v_year int := EXTRACT(YEAR FROM now())::int;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;
  UPDATE public.platform_tax_settings
     SET next_invoice_number = next_invoice_number + 1, updated_at = now()
   WHERE country_code = upper(_country_code)
  RETURNING invoice_series_prefix, next_invoice_number - 1
    INTO v_prefix, v_seq;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'platform_tax_settings row missing for country %', _country_code;
  END IF;
  RETURN v_prefix || '-CN-' || v_year || '-' || lpad(v_seq::text, 6, '0');
END; $function$;

-- tax_encrypt / tax_decrypt
REVOKE ALL ON FUNCTION public.tax_encrypt(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tax_encrypt(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.tax_decrypt(bytea, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tax_decrypt(bytea, text) TO service_role;

-- raise_system_alert / resolve_system_alert — service-role only
REVOKE ALL ON FUNCTION public.raise_system_alert(text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raise_system_alert(text, text, text, text, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_system_alert(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_system_alert(text, uuid) TO service_role;

-- is_under_legal_hold — service-role/admin only
REVOKE ALL ON FUNCTION public.is_under_legal_hold(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_under_legal_hold(text, text) TO service_role;

-- Trigger-only functions: revoke direct EXECUTE (triggers still fire).
REVOKE ALL ON FUNCTION public.country_configs_publish_snapshot()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_address_country()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unset_other_primary_addresses()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audit_immutable()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consent_ledger_immutable()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookings_freeze_snapshots()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.country_config_versions_immutable()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.legal_documents_enforce_immutable()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_legal_acceptances_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_plaintext_tax_write()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()           FROM PUBLIC, anon, authenticated;

-- Functions that MUST remain callable by clients (RLS policies + app RPCs)
-- Explicit grants (kept minimal).
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.user_owns_provider(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_provider(text) TO authenticated, service_role;

-- Public map (anon needs to see providers on map)
REVOKE ALL ON FUNCTION public.get_providers_in_bounds(double precision, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_providers_in_bounds(double precision, double precision, double precision, double precision) TO anon, authenticated, service_role;

-- Public country config lookups
REVOKE ALL ON FUNCTION public.get_published_country_config(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_country_config(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_country_bookable(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_country_bookable(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_country_visible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_country_visible(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_country_launch_ready(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_country_launch_ready(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_lifecycle_public_isos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lifecycle_public_isos() TO anon, authenticated, service_role;

-- ---------- Part 5: Sanitise access-attempt logging ----------
-- Cap client-controlled string lengths to prevent log flooding / injection.
DO $$ BEGIN
  BEGIN
    ALTER TABLE public.access_attempts
      ADD CONSTRAINT access_attempts_ua_len_chk CHECK (user_agent IS NULL OR length(user_agent) <= 512);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE public.access_attempts
      ADD CONSTRAINT access_attempts_ref_len_chk CHECK (referrer IS NULL OR length(referrer) <= 512);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE public.access_attempts
      ADD CONSTRAINT access_attempts_reason_len_chk CHECK (reason IS NULL OR length(reason) <= 512);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
