-- Conversation system: remove unnecessary anon grants, least-privilege for authenticated.
-- RLS stays enabled and deny-by-default on every table; these grants only cap
-- the maximum privilege the Data API roles can ever attempt.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conversations','messages','conversation_participants','conversation_reads',
    'conversation_events','message_attachments','conversation_tags','conversation_tag_assignments'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Least-privilege re-grants for `authenticated`, matched 1:1 to existing policies.
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;              -- conv_select / conv_insert / conv_update_staff
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;                   -- msg_select / msg_insert / msg_update_own
GRANT SELECT, INSERT, UPDATE ON public.conversation_participants TO authenticated;  -- parts_select / parts_insert_staff / parts_update_staff
GRANT SELECT, INSERT, UPDATE ON public.conversation_reads TO authenticated;         -- reads_select_own / reads_upsert_own_*
GRANT SELECT, INSERT ON public.conversation_events TO authenticated;                -- events_select / events_insert_staff (append-only)
GRANT SELECT, INSERT ON public.message_attachments TO authenticated;                -- att_select / att_insert
GRANT SELECT ON public.conversation_tags TO authenticated;                          -- tags_select
GRANT SELECT, INSERT, DELETE ON public.conversation_tag_assignments TO authenticated; -- tag_assign_select / _insert_staff / _delete_staff
