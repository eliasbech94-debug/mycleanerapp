
-- 1. access_attempts: restrict INSERT to service_role only
DROP POLICY IF EXISTS "Anyone can insert access attempts" ON public.access_attempts;
DROP POLICY IF EXISTS "Public can insert access attempts" ON public.access_attempts;
DROP POLICY IF EXISTS "Allow insert access attempts" ON public.access_attempts;
DROP POLICY IF EXISTS "Anon and authenticated can insert access attempts" ON public.access_attempts;

REVOKE INSERT ON public.access_attempts FROM anon;
REVOKE INSERT ON public.access_attempts FROM authenticated;
GRANT INSERT ON public.access_attempts TO service_role;

-- Edge functions (service_role) can insert; clients cannot. No INSERT policy needed
-- since service_role bypasses RLS, and we explicitly revoked client-side INSERT grants.

-- 2. stripe_webhook_events: restrict SELECT to admin role only
DROP POLICY IF EXISTS "Authenticated can read webhook events" ON public.stripe_webhook_events;
DROP POLICY IF EXISTS "Authenticated users can read webhook events" ON public.stripe_webhook_events;

CREATE POLICY "Admins can read webhook events"
  ON public.stripe_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. realtime.messages: intentionally NOT modified here.
--
-- `realtime.messages` is a Supabase-managed internal table owned by the
-- `supabase_admin` role. The migration role used by `supabase db push`
-- (and by Lovable Cloud) is NOT the owner, so
-- `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` fails with
-- `ERROR: must be owner of table messages (SQLSTATE 42501)` on any fresh
-- deploy (e.g. the staging environment).
--
-- Realtime authorization must be configured through supported Supabase
-- mechanisms instead of altering the managed table directly:
--   * Broadcast/Presence authorization policies via the Supabase
--     dashboard (Realtime → Policies) or the Management API.
--   * Per-topic access enforced by the app using private channels and
--     server-signed tokens (supabase.channel(name, { config: { private:
--     true } }) + realtime.set_auth).
--   * RLS on the underlying application tables that Realtime replicates
--     (already enforced elsewhere in these migrations).
--
-- Do NOT re-add an `ALTER TABLE realtime.messages ...` statement here.
