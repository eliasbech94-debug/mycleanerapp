-- P0 security fix: public clients must not write campaign applications
-- directly. All public submissions go through the campaign-apply edge
-- function, which enforces Turnstile, rate limits, and input validation before
-- inserting with service_role.

DROP POLICY IF EXISTS "ca_public_insert"
ON public.campaign_applications;

REVOKE INSERT
ON public.campaign_applications
FROM anon, authenticated;

-- Defence in depth for applicant PII. RLS already blocks anonymous reads.
REVOKE SELECT
ON public.campaign_applications
FROM anon;

COMMENT ON TABLE public.campaign_applications IS
  'Campaign applications. Public inserts are only allowed through the edge function campaign-apply (Turnstile, rate limits, and input validation; writes with service_role). anon has no INSERT/SELECT privilege; authenticated has no INSERT privilege.';
