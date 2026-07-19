
-- Only allow reads/writes when the caller is a participant or staff on the
-- conversation whose id is the first path segment.

CREATE POLICY chat_att_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND public.is_conversation_visible_to(
    (split_part(name, '/', 1))::uuid,
    auth.uid()
  )
);

CREATE POLICY chat_att_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND public.is_conversation_participant(
    (split_part(name, '/', 1))::uuid,
    auth.uid()
  )
);

CREATE POLICY chat_att_delete_staff ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()))
);
