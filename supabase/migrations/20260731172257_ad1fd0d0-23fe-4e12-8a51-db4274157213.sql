GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_threads TO authenticated;
GRANT ALL ON public.support_threads TO service_role;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

DROP POLICY IF EXISTS "Users receive own user-scoped realtime messages" ON realtime.messages;
CREATE POLICY "Users receive own user-scoped realtime messages"
ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() = ('user:' || (auth.uid())::text));