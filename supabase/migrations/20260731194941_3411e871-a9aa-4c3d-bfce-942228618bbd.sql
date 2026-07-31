-- 1. Private support notes -------------------------------------------------
CREATE TABLE public.support_entity_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('customer','provider')),
  subject_user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  author_user_id uuid NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_entity_notes_subject_idx
  ON public.support_entity_notes (subject_type, subject_user_id, pinned DESC, created_at DESC);

-- Grants: no direct Data API access for anon/authenticated. Writes and reads
-- go through staff-gated edge functions running with the service role.
REVOKE ALL ON public.support_entity_notes FROM anon, authenticated;
GRANT ALL ON public.support_entity_notes TO service_role;

ALTER TABLE public.support_entity_notes ENABLE ROW LEVEL SECURITY;

-- Defense in depth: even if a grant were added later, only staff may read and
-- nobody may write directly from the client.
CREATE POLICY "Support staff can read private notes"
  ON public.support_entity_notes
  FOR SELECT
  TO authenticated
  USING (public.is_support_agent(auth.uid()));

CREATE OR REPLACE FUNCTION public._support_entity_notes_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.created_at := OLD.created_at;
  NEW.author_user_id := OLD.author_user_id;
  NEW.subject_type := OLD.subject_type;
  NEW.subject_user_id := OLD.subject_user_id;
  RETURN NEW;
END $$;

CREATE TRIGGER support_entity_notes_touch
  BEFORE UPDATE ON public.support_entity_notes
  FOR EACH ROW EXECUTE FUNCTION public._support_entity_notes_touch();

-- 2. Staff-gated recent activity -------------------------------------------
CREATE OR REPLACE FUNCTION public.support_recent_activity(_user uuid, _limit integer DEFAULT 20)
RETURNS TABLE (
  event_id uuid,
  conversation_id uuid,
  event_type text,
  created_at timestamptz,
  conversation_subject text,
  conversation_status text,
  conversation_priority text,
  assigned_to_me boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
BEGIN
  IF _user IS NULL OR NOT public.is_support_agent(_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.conversation_id,
    e.event_type,
    e.created_at,
    left(coalesce(c.subject, ''), 120),
    c.status,
    c.priority,
    (c.assigned_support_id = _user)
  FROM public.conversation_events e
  JOIN public.conversations c ON c.id = e.conversation_id
  ORDER BY e.created_at DESC
  LIMIT v_limit;
END $$;

REVOKE ALL ON FUNCTION public.support_recent_activity(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_recent_activity(uuid, integer) TO service_role;

-- 3. Narrow legacy {public} policies to authenticated ------------------------
-- Verified safe: support_threads / support_messages have no Data API grants and
-- are only touched by service-role edge functions. All four policies already
-- require is_support_agent(auth.uid()), which is false for anon.
ALTER POLICY "Support agents view all threads" ON public.support_threads TO authenticated;
ALTER POLICY "Support agents update all threads" ON public.support_threads TO authenticated;
ALTER POLICY "Support agents view all messages" ON public.support_messages TO authenticated;
ALTER POLICY "Support agents insert messages" ON public.support_messages TO authenticated;