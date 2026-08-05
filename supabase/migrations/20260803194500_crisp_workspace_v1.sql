-- Crisp Workspace v1: durable linkage, case numbers, snapshots and audit trail.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS crisp_session_id text,
  ADD COLUMN IF NOT EXISTS crisp_website_id text,
  ADD COLUMN IF NOT EXISTS case_number text,
  ADD COLUMN IF NOT EXISTS support_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS crisp_state text,
  ADD COLUMN IF NOT EXISTS crisp_last_event_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_crisp_session_unique
  ON public.conversations (crisp_session_id)
  WHERE crisp_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_case_number_unique
  ON public.conversations (case_number)
  WHERE case_number IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.support_case_number_seq;

CREATE OR REPLACE FUNCTION public.next_support_case_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'MC-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('public.support_case_number_seq')::text, 6, '0');
$$;
REVOKE ALL ON FUNCTION public.next_support_case_number() FROM public;
GRANT EXECUTE ON FUNCTION public.next_support_case_number() TO service_role;

CREATE OR REPLACE FUNCTION public.conversations_assign_case_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IN ('customer_support','provider_support','dispute') AND NEW.case_number IS NULL THEN
    NEW.case_number := public.next_support_case_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_assign_case_number_trg ON public.conversations;
CREATE TRIGGER conversations_assign_case_number_trg
BEFORE INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.conversations_assign_case_number();

CREATE TABLE IF NOT EXISTS public.support_integration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'crisp',
  external_id text NULL,
  event_type text NOT NULL,
  actor_type text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_integration_audit_conversation_idx
  ON public.support_integration_audit (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_integration_audit_external_idx
  ON public.support_integration_audit (provider, external_id, created_at DESC);

ALTER TABLE public.support_integration_audit ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.support_integration_audit TO service_role;
GRANT SELECT ON public.support_integration_audit TO authenticated;

DROP POLICY IF EXISTS support_integration_audit_staff_select ON public.support_integration_audit;
CREATE POLICY support_integration_audit_staff_select
ON public.support_integration_audit FOR SELECT TO authenticated
USING (public.is_support_agent(auth.uid()) OR public.is_admin_only(auth.uid()));
