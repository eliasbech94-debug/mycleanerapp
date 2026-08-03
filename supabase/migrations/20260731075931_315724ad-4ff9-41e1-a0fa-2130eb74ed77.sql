-- 1. Verifiable sender_type on messages. Never derived from message text.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_type text,
  ADD COLUMN IF NOT EXISTS ai_drafted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_draft_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_draft_reviewed_at timestamptz;

UPDATE public.messages
SET sender_type = CASE sender_role
    WHEN 'customer' THEN 'customer'
    WHEN 'provider' THEN 'provider'
    WHEN 'support'  THEN 'support_agent'
    WHEN 'admin'    THEN 'support_agent'
    ELSE 'system'
  END
WHERE sender_type IS NULL;

ALTER TABLE public.messages
  ALTER COLUMN sender_type SET NOT NULL,
  ALTER COLUMN sender_type SET DEFAULT 'system';

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type = ANY (ARRAY['customer','provider','support_agent','ai_assistant','system']));

CREATE INDEX IF NOT EXISTS messages_sender_type_idx ON public.messages (conversation_id, sender_type);

-- 2. Integrity guard: AI can never impersonate a named human, and the label is immutable.
CREATE OR REPLACE FUNCTION public.messages_sender_type_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.sender_type IS DISTINCT FROM OLD.sender_type THEN
    RAISE EXCEPTION 'sender_type is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.sender_type = 'ai_assistant' THEN
    -- An AI message must never carry a human identity.
    IF NEW.sender_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'ai_assistant messages cannot have a human sender' USING ERRCODE = '22023';
    END IF;
    IF NEW.ai_drafted THEN
      RAISE EXCEPTION 'ai_assistant messages are sent by AI, not drafted for review' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.sender_type IN ('customer','provider','support_agent') THEN
    IF NEW.sender_user_id IS NULL THEN
      RAISE EXCEPTION 'human sender_type requires sender_user_id' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- An AI draft only counts as human-reviewed when a human is recorded as reviewer.
  IF NEW.ai_drafted AND NEW.ai_draft_reviewed_by IS NULL THEN
    NEW.ai_draft_reviewed_at := NULL;
  ELSIF NEW.ai_drafted AND NEW.ai_draft_reviewed_at IS NULL THEN
    NEW.ai_draft_reviewed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_sender_type_guard_trg ON public.messages;
CREATE TRIGGER messages_sender_type_guard_trg
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_sender_type_guard();

-- 3. Human takeover state on the conversation.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS human_takeover_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_takeover_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_response_minutes integer;

COMMENT ON COLUMN public.messages.sender_type IS
  'Authoritative, immutable sender classification. AI labelling is driven by this column only — never by analysing message text.';
COMMENT ON COLUMN public.messages.ai_drafted IS
  'True when the body originated as an AI draft that a human reviewed and actively sent. The message is still attributed to the human sender.';