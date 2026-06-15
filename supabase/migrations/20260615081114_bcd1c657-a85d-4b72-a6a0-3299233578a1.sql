
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

-- 3. realtime.messages: add baseline RLS so users only receive their own topics
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users receive own user-scoped realtime messages" ON realtime.messages;
CREATE POLICY "Users receive own user-scoped realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- Allow topics that explicitly include the auth uid as a suffix,
    -- e.g. 'bookings:user:<uid>', 'notifications:<uid>', 'inbox:<uid>'
    realtime.messages.topic LIKE '%' || auth.uid()::text
  );
