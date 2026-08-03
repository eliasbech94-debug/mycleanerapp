-- ============================================================================
-- MIGRATION (PROPOSED — NOT EXECUTED)
-- File name to use when applied: 20260730133000_campaign_applications_p0_lock_public_insert.sql
--
-- P0 security fix: campaign_applications must not be directly writable by
-- public clients.
--
-- Public campaign applications are created ONLY through the edge function
-- `campaign-apply`. That function validates:
--   * Cloudflare Turnstile (bot/captcha protection)
--   * per-IP and per-email rate limits (public.campaign_apply_attempts)
--   * campaign lifecycle, window and country enablement
--   * input shape (email, name, consent flags, array caps)
-- and only then writes the row using the service_role key, which bypasses RLS.
--
-- The current policy "ca_public_insert" (WITH CHECK true, TO anon,
-- authenticated) allows any client holding the publishable anon key to INSERT
-- directly via the Data API, bypassing every one of those controls and
-- permitting privileged fields (status, assigned_number, email_verified_at,
-- foreign user_id) to be set by the caller.
--
-- No client code inserts into this table: the browser only calls
-- supabase.functions.invoke("campaign-apply"). Admin/support read access
-- (ca_admin_read_all), owner read (ca_owner_read) and owner update
-- (ca_owner_update) are intentionally left untouched.
--
-- Reversible: re-create the policy and re-grant to roll back.
-- ============================================================================

-- Remove the always-true public INSERT policy.
DROP POLICY IF EXISTS "ca_public_insert" ON public.campaign_applications;

-- Remove the underlying table privilege as well: RLS is not the only gate —
-- the Data API also requires the GRANT. Public application creation happens
-- exclusively through the service_role inside `campaign-apply`.
REVOKE INSERT ON public.campaign_applications FROM anon, authenticated;

-- anon must never read applications (PII: name, email, phone, city, IP).
-- Authenticated owners keep SELECT via ca_owner_read; admin/support keep
-- SELECT via ca_admin_read_all.
REVOKE SELECT ON public.campaign_applications FROM anon;

COMMENT ON TABLE public.campaign_applications IS
  'Campaign applications. Public inserts are only allowed through the edge function `campaign-apply` (Turnstile + rate limits + input validation, writes with service_role). anon has no INSERT/SELECT privilege; authenticated has no INSERT privilege.';
