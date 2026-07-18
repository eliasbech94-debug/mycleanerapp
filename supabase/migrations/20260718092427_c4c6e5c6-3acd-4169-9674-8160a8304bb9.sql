
-- Task 3: Harden SECURITY DEFINER function EXECUTE grants.
-- Principle: revoke PUBLIC/anon/authenticated by default; grant back only when
-- callable directly by client (RPC) or referenced by RLS policies (executed as
-- the querying role). Trigger functions run as the definer regardless of
-- EXECUTE grants, so client roles do not need EXECUTE on them.

-- ── Trigger-only functions (no client execution needed) ──────────────────────
REVOKE ALL ON FUNCTION public.enforce_address_country()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unset_other_primary_addresses()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_plaintext_tax_write()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()         FROM PUBLIC, anon, authenticated;

-- ── Encryption helpers: service_role only (already, but enforce) ────────────
REVOKE ALL ON FUNCTION public.tax_encrypt(text, text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tax_decrypt(bytea, text)           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tax_encrypt(text, text)         TO service_role;
GRANT EXECUTE ON FUNCTION public.tax_decrypt(bytea, text)        TO service_role;

-- ── Invoice numbering: edge functions only ──────────────────────────────────
REVOKE ALL ON FUNCTION public.next_invoice_number(text)          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(text)       TO service_role;

-- ── Used inside RLS policies ────────────────────────────────────────────────
-- has_role / get_user_roles / user_owns_provider are referenced by RLS
-- USING/WITH CHECK expressions, which execute as the querying role. They MUST
-- retain EXECUTE for authenticated. anon does not need them.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)        TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_roles(uuid)               FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid)            TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.user_owns_provider(text)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_provider(text)        TO authenticated, service_role;

-- ── Public map browsing (anon + authenticated RPC) ──────────────────────────
-- get_providers_in_bounds returns coarse, non-PII data used by the public
-- Find Cleaner map. Keep client access; ensure PUBLIC has no direct EXECUTE.
REVOKE ALL ON FUNCTION public.get_providers_in_bounds(double precision, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_providers_in_bounds(double precision, double precision, double precision, double precision) TO anon, authenticated, service_role;
