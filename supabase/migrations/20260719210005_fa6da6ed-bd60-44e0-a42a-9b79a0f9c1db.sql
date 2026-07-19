
-- =========================================================================
-- Phase 2 — Unified Conversation Engine
-- =========================================================================

-- --- Tables ---------------------------------------------------------------

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('booking_chat','customer_support','provider_support','dispute','internal','system')),
  booking_id uuid NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  support_case_id uuid NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_support_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_customer','pending_provider','pending_support','escalated','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  country_code text NULL,
  subject text NULL,
  last_message_id uuid NULL,
  last_message_at timestamptz NULL,
  closed_at timestamptz NULL,
  closed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ai_summary text NULL,
  last_ai_summary_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

CREATE TABLE public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_role text NOT NULL CHECK (participant_role IN ('customer','provider','support','admin','system')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz NULL,
  muted_at timestamptz NULL,
  archived_at timestamptz NULL,
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer','provider','support','admin','system')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','system','attachment','booking_event','refund_event','ai_suggestion')),
  body text NULL,
  is_internal_note boolean NOT NULL DEFAULT false,
  reply_to_message_id uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  edited_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(coalesce(body, '')) <= 8000)
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400), -- 25 MB
  width integer NULL,
  height integer NULL,
  thumbnail_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;

CREATE TABLE public.conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.conversation_reads TO authenticated;
GRANT ALL ON public.conversation_reads TO service_role;

CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.conversation_events TO authenticated;
GRANT ALL ON public.conversation_events TO service_role;

CREATE TABLE public.conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversation_tags TO authenticated;
GRANT ALL ON public.conversation_tags TO service_role;

CREATE TABLE public.conversation_tag_assignments (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.conversation_tags(id) ON DELETE CASCADE,
  assigned_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);
GRANT SELECT, INSERT, DELETE ON public.conversation_tag_assignments TO authenticated;
GRANT ALL ON public.conversation_tag_assignments TO service_role;

CREATE TABLE public.refund_requests_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  booking_id uuid NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  requested_amount integer NOT NULL CHECK (requested_amount >= 0),
  currency text NOT NULL,
  reason text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','cancelled')),
  decided_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NULL,
  execution_ref text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.refund_requests_v2 TO authenticated;
GRANT ALL ON public.refund_requests_v2 TO service_role;

-- Unique active booking chat: only one open booking_chat per booking_id
CREATE UNIQUE INDEX conversations_booking_chat_unique_active
  ON public.conversations (booking_id)
  WHERE kind = 'booking_chat' AND status NOT IN ('closed','resolved');

-- --- Indexes --------------------------------------------------------------

CREATE INDEX conversations_last_message_at_idx ON public.conversations (last_message_at DESC NULLS LAST);
CREATE INDEX conversations_status_idx ON public.conversations (status);
CREATE INDEX conversations_assigned_support_idx ON public.conversations (assigned_support_id);
CREATE INDEX conversations_booking_idx ON public.conversations (booking_id);
CREATE INDEX conversations_customer_idx ON public.conversations (customer_user_id);
CREATE INDEX conversations_provider_idx ON public.conversations (provider_user_id);
CREATE INDEX conversations_kind_idx ON public.conversations (kind);

CREATE INDEX messages_conv_created_idx ON public.messages (conversation_id, created_at DESC);
CREATE INDEX messages_conv_internal_idx ON public.messages (conversation_id, is_internal_note);

CREATE INDEX conversation_participants_user_idx ON public.conversation_participants (user_id);
CREATE INDEX conversation_reads_user_idx ON public.conversation_reads (user_id);
CREATE INDEX conversation_events_conv_created_idx ON public.conversation_events (conversation_id, created_at DESC);
CREATE INDEX conversation_tag_assignments_tag_idx ON public.conversation_tag_assignments (tag_id);
CREATE INDEX message_attachments_message_idx ON public.message_attachments (message_id);
CREATE INDEX refund_requests_v2_conv_idx ON public.refund_requests_v2 (conversation_id);
CREATE INDEX refund_requests_v2_status_idx ON public.refund_requests_v2 (status);

-- --- Helpers --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = _user_id
      AND left_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_conversation_visible_to(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_conversation_participant(_conversation_id, _user_id)
    OR public.is_admin_only(_user_id)
    OR (
      public.is_support_agent(_user_id)
      AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = _conversation_id
          AND (
            c.kind IN ('customer_support','provider_support','dispute','internal')
            OR c.assigned_support_id = _user_id
          )
      )
    );
$$;
REVOKE ALL ON FUNCTION public.is_conversation_visible_to(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_conversation_visible_to(uuid, uuid) TO authenticated, service_role;

-- --- Triggers -------------------------------------------------------------

-- updated_at
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER refund_requests_v2_updated_at BEFORE UPDATE ON public.refund_requests_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- messages: enforce append-only for non-service; only allow soft-delete/edit of own recent message body, no role/type/sender changes
CREATE OR REPLACE FUNCTION public.messages_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
     OR NEW.sender_role IS DISTINCT FROM OLD.sender_role
     OR NEW.message_type IS DISTINCT FROM OLD.message_type
     OR NEW.is_internal_note IS DISTINCT FROM OLD.is_internal_note
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'messages: immutable fields cannot be changed';
  END IF;
  -- Only sender may edit/soft-delete their own message; support/admin may soft-delete via edge function (service role)
  IF OLD.sender_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'messages: only sender can edit';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_guard_update_trg BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_guard_update();

-- messages: block customer/provider inserting internal notes and role impersonation
CREATE OR REPLACE FUNCTION public.messages_guard_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_is_support boolean;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  v_is_support := public.is_support_agent(auth.uid());
  IF NEW.is_internal_note AND NOT v_is_support THEN
    RAISE EXCEPTION 'internal_note_forbidden';
  END IF;
  IF NEW.sender_role IN ('support','admin','system') AND NOT v_is_support THEN
    RAISE EXCEPTION 'role_impersonation_forbidden';
  END IF;
  -- Force sender to caller when non-system
  IF NEW.sender_role <> 'system' AND (NEW.sender_user_id IS NULL OR NEW.sender_user_id <> auth.uid()) THEN
    NEW.sender_user_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_guard_insert_trg BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_guard_insert();

-- messages: after insert, bump conversation pointer
CREATE OR REPLACE FUNCTION public.messages_bump_conversation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_id = NEW.id,
         last_message_at = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_bump_conversation_trg AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_bump_conversation();

-- conversation_events: append-only
CREATE OR REPLACE FUNCTION public.conversation_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'conversation_events is append-only';
END $$;
CREATE TRIGGER conversation_events_no_update BEFORE UPDATE ON public.conversation_events
  FOR EACH ROW EXECUTE FUNCTION public.conversation_events_append_only();
CREATE TRIGGER conversation_events_no_delete BEFORE DELETE ON public.conversation_events
  FOR EACH ROW EXECUTE FUNCTION public.conversation_events_append_only();

-- --- RLS ------------------------------------------------------------------

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests_v2 ENABLE ROW LEVEL SECURITY;

-- conversations
CREATE POLICY conv_select ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_visible_to(id, auth.uid()));
CREATE POLICY conv_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
-- Only support/admin can update conversation metadata directly (customers/providers use edge fns)
CREATE POLICY conv_update_staff ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()));

-- participants
CREATE POLICY parts_select ON public.conversation_participants FOR SELECT TO authenticated
  USING (public.is_conversation_visible_to(conversation_id, auth.uid()));
CREATE POLICY parts_insert_staff ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid())
              OR user_id = auth.uid());
CREATE POLICY parts_update_staff ON public.conversation_participants FOR UPDATE TO authenticated
  USING (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()) OR user_id = auth.uid())
  WITH CHECK (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()) OR user_id = auth.uid());

-- messages
CREATE POLICY msg_select ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_conversation_visible_to(conversation_id, auth.uid())
    AND (
      is_internal_note = false
      OR public.is_support_agent(auth.uid())
      OR public.is_admin_only(auth.uid())
    )
    AND deleted_at IS NULL
  );
CREATE POLICY msg_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_conversation_visible_to(conversation_id, auth.uid())
    AND (
      (sender_role IN ('customer','provider') AND sender_user_id = auth.uid())
      OR ((sender_role IN ('support','admin')) AND public.is_support_agent(auth.uid()))
    )
  );
CREATE POLICY msg_update_own ON public.messages FOR UPDATE TO authenticated
  USING (sender_user_id = auth.uid())
  WITH CHECK (sender_user_id = auth.uid());

-- attachments
CREATE POLICY att_select ON public.message_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_visible_to(m.conversation_id, auth.uid())
        AND (m.is_internal_note = false OR public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()))
    )
  );
CREATE POLICY att_insert ON public.message_attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.sender_user_id = auth.uid()
    )
  );

-- reads
CREATE POLICY reads_select_own ON public.conversation_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY reads_upsert_own_insert ON public.conversation_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_visible_to(conversation_id, auth.uid()));
CREATE POLICY reads_upsert_own_update ON public.conversation_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- events
CREATE POLICY events_select ON public.conversation_events FOR SELECT TO authenticated
  USING (
    public.is_conversation_visible_to(conversation_id, auth.uid())
    AND (
      event_type NOT IN ('internal_note_added','support_note')
      OR public.is_support_agent(auth.uid())
      OR public.is_admin_only(auth.uid())
    )
  );
CREATE POLICY events_insert_staff ON public.conversation_events FOR INSERT TO authenticated
  WITH CHECK (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid())
              OR actor_user_id = auth.uid());

-- tags
CREATE POLICY tags_select ON public.conversation_tags FOR SELECT TO authenticated USING (true);

CREATE POLICY tag_assign_select ON public.conversation_tag_assignments FOR SELECT TO authenticated
  USING (public.is_conversation_visible_to(conversation_id, auth.uid()));
CREATE POLICY tag_assign_insert_staff ON public.conversation_tag_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()));
CREATE POLICY tag_assign_delete_staff ON public.conversation_tag_assignments FOR DELETE TO authenticated
  USING (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()));

-- refund requests v2 — support may create, only admin may execute
CREATE POLICY refund_v2_select ON public.refund_requests_v2 FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_support_agent(auth.uid())
    OR public.is_admin_only(auth.uid())
    OR public.is_conversation_visible_to(conversation_id, auth.uid())
  );
CREATE POLICY refund_v2_insert_support ON public.refund_requests_v2 FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()))
    AND requested_by = auth.uid()
    AND status = 'pending'
  );
CREATE POLICY refund_v2_update_admin ON public.refund_requests_v2 FOR UPDATE TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

-- --- Seed tags ------------------------------------------------------------

INSERT INTO public.conversation_tags (name, slug) VALUES
  ('Refund','refund'),('Complaint','complaint'),('Payment','payment'),
  ('Invoice','invoice'),('Provider','provider'),('Customer','customer'),
  ('Urgent','urgent'),('Fraud','fraud'),('Stripe','stripe'),('VIP','vip')
ON CONFLICT (slug) DO NOTHING;

-- --- Realtime -------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_events;

-- --- Legacy migration RPC -------------------------------------------------

CREATE OR REPLACE FUNCTION public.migrate_legacy_support_threads()
RETURNS TABLE(threads_migrated int, messages_migrated int, threads_skipped int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_threads int := 0; v_msgs int := 0; v_skipped int := 0;
  r_thread record; r_msg record; v_conv_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role only';
  END IF;

  FOR r_thread IN
    SELECT t.* FROM public.support_threads t
  LOOP
    -- idempotency: check for existing conversation created from this thread
    SELECT id INTO v_conv_id
      FROM public.conversations
     WHERE (subject IS NOT NULL AND subject = COALESCE(r_thread.subject, 'Legacy thread'))
       AND created_by = r_thread.user_id
       AND kind = 'customer_support'
       AND EXISTS (
         SELECT 1 FROM public.conversation_events e
         WHERE e.conversation_id = conversations.id
           AND e.event_type = 'legacy_migrated'
           AND (e.payload->>'legacy_thread_id') = r_thread.id::text
       )
     LIMIT 1;

    IF v_conv_id IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.conversations (kind, created_by, customer_user_id, subject, status, booking_id)
    VALUES (
      'customer_support',
      r_thread.user_id,
      r_thread.user_id,
      COALESCE(r_thread.subject, 'Legacy thread'),
      CASE r_thread.status WHEN 'escalated' THEN 'escalated' WHEN 'resolved' THEN 'resolved' ELSE 'open' END,
      r_thread.related_booking_id
    )
    RETURNING id INTO v_conv_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id, participant_role)
    VALUES (v_conv_id, r_thread.user_id, 'customer')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.conversation_events (conversation_id, actor_user_id, event_type, payload)
    VALUES (v_conv_id, r_thread.user_id, 'legacy_migrated',
            jsonb_build_object('legacy_thread_id', r_thread.id, 'topic', r_thread.topic));

    FOR r_msg IN
      SELECT * FROM public.support_messages WHERE thread_id = r_thread.id ORDER BY created_at ASC
    LOOP
      INSERT INTO public.messages (conversation_id, sender_user_id, sender_role, message_type, body, created_at)
      VALUES (
        v_conv_id,
        r_msg.user_id,
        CASE r_msg.role WHEN 'assistant' THEN 'system' WHEN 'system' THEN 'system' ELSE 'customer' END,
        CASE r_msg.role WHEN 'system' THEN 'system' ELSE 'text' END,
        r_msg.content,
        r_msg.created_at
      );
      v_msgs := v_msgs + 1;
    END LOOP;

    v_threads := v_threads + 1;
  END LOOP;

  RETURN QUERY SELECT v_threads, v_msgs, v_skipped;
END $$;
REVOKE ALL ON FUNCTION public.migrate_legacy_support_threads() FROM public;
GRANT EXECUTE ON FUNCTION public.migrate_legacy_support_threads() TO service_role;
