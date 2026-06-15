
-- 1) Tighten access_attempts INSERT policy
DROP POLICY IF EXISTS "Anyone can log access attempts" ON public.access_attempts;
CREATE POLICY "Users can log own access attempts"
  ON public.access_attempts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- 2) Move pg_net to extensions schema (drop + recreate)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role, anon;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 3) Remove market_rate_thresholds from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.market_rate_thresholds;

-- 4) Revoke EXECUTE on trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unset_other_primary_addresses() FROM PUBLIC, anon, authenticated;
