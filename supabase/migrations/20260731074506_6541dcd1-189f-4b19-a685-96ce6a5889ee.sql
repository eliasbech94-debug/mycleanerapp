-- ============================================================
-- P0-B: provider decision notices + appeal flow
-- ============================================================

-- 1. Provider-facing decision notice ---------------------------------
CREATE TABLE public.provider_decision_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL,
  provider_id uuid,
  admin_action_id bigint REFERENCES public.provider_admin_actions(id) ON DELETE SET NULL,
  decision_type text NOT NULL CHECK (decision_type IN ('suspend','reject','archive','freeze_payout','restrict','other')),
  decision_status text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  provider_reason text NOT NULL,
  rules_applied text[] NOT NULL DEFAULT '{}',
  reason_withheld boolean NOT NULL DEFAULT false,
  reason_withheld_code text CHECK (reason_withheld_code IS NULL OR reason_withheld_code IN ('fraud_prevention','other_user_safety','legal_requirement','ongoing_investigation')),
  human_reviewed boolean NOT NULL DEFAULT true,
  ai_assisted boolean NOT NULL DEFAULT false,
  appealable boolean NOT NULL DEFAULT true,
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_decision_notices_user_idx ON public.provider_decision_notices(provider_user_id, created_at DESC);

GRANT SELECT ON public.provider_decision_notices TO authenticated;
GRANT ALL ON public.provider_decision_notices TO service_role;
ALTER TABLE public.provider_decision_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_decision_notices_owner_read ON public.provider_decision_notices
  FOR SELECT TO authenticated USING (provider_user_id = auth.uid());
CREATE POLICY provider_decision_notices_staff_read ON public.provider_decision_notices
  FOR SELECT TO authenticated USING (public.is_admin_only(auth.uid()) OR public.is_support_agent(auth.uid()));
-- No INSERT/UPDATE/DELETE policies: written only by SECURITY DEFINER functions
-- and service_role. Clients can never author or alter a decision.

-- 2. Appeals ---------------------------------------------------------
CREATE TABLE public.provider_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL REFERENCES public.provider_decision_notices(id) ON DELETE CASCADE,
  provider_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','information_requested','upheld','changed','withdrawn')),
  provider_statement text NOT NULL,
  provider_followup text,
  information_request text,
  reviewer_user_id uuid,
  reviewer_reason text,
  decided_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One open appeal per decision notice.
CREATE UNIQUE INDEX provider_appeals_one_open_per_notice
  ON public.provider_appeals(notice_id)
  WHERE status IN ('submitted','under_review','information_requested');
CREATE INDEX provider_appeals_user_idx ON public.provider_appeals(provider_user_id, created_at DESC);
CREATE INDEX provider_appeals_status_idx ON public.provider_appeals(status, submitted_at);

GRANT SELECT ON public.provider_appeals TO authenticated;
GRANT ALL ON public.provider_appeals TO service_role;
ALTER TABLE public.provider_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_appeals_owner_read ON public.provider_appeals
  FOR SELECT TO authenticated USING (provider_user_id = auth.uid());
CREATE POLICY provider_appeals_staff_read ON public.provider_appeals
  FOR SELECT TO authenticated USING (public.is_admin_only(auth.uid()) OR public.is_support_agent(auth.uid()));
-- No client INSERT/UPDATE/DELETE: all writes go through the RPCs below, which
-- prevents a provider (or anyone else) from setting a final status directly.

-- 3. Appeal attachments (private storage) ----------------------------
CREATE TABLE public.provider_appeal_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES public.provider_appeals(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_appeal_attachments_appeal_idx ON public.provider_appeal_attachments(appeal_id);

GRANT SELECT ON public.provider_appeal_attachments TO authenticated;
GRANT ALL ON public.provider_appeal_attachments TO service_role;
ALTER TABLE public.provider_appeal_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_appeal_attachments_owner_read ON public.provider_appeal_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.provider_appeals a
    WHERE a.id = appeal_id AND a.provider_user_id = auth.uid()
  ));
CREATE POLICY provider_appeal_attachments_staff_read ON public.provider_appeal_attachments
  FOR SELECT TO authenticated
  USING (public.is_admin_only(auth.uid()) OR public.is_support_agent(auth.uid()));
-- Rows are inserted by the signed-upload edge function (service_role) only;
-- the storage object itself lives in a private bucket served via signed URLs.

-- 4. Append-only appeal event log -------------------------------------
CREATE TABLE public.provider_appeal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appeal_id uuid NOT NULL REFERENCES public.provider_appeals(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_role text NOT NULL CHECK (actor_role IN ('provider','admin','support','system')),
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_appeal_events_appeal_idx ON public.provider_appeal_events(appeal_id, created_at);

GRANT SELECT ON public.provider_appeal_events TO authenticated;
GRANT ALL ON public.provider_appeal_events TO service_role;
ALTER TABLE public.provider_appeal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_appeal_events_owner_read ON public.provider_appeal_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.provider_appeals a
    WHERE a.id = appeal_id AND a.provider_user_id = auth.uid()
  ));
CREATE POLICY provider_appeal_events_staff_read ON public.provider_appeal_events
  FOR SELECT TO authenticated
  USING (public.is_admin_only(auth.uid()) OR public.is_support_agent(auth.uid()));

CREATE OR REPLACE FUNCTION public.provider_appeal_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'provider_appeal_events is append-only';
END;
$$;
CREATE TRIGGER provider_appeal_events_no_mutate
  BEFORE UPDATE OR DELETE ON public.provider_appeal_events
  FOR EACH ROW EXECUTE FUNCTION public.provider_appeal_events_append_only();

-- 5. updated_at triggers ----------------------------------------------
CREATE TRIGGER provider_decision_notices_touch
  BEFORE UPDATE ON public.provider_decision_notices
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER provider_appeals_touch
  BEFORE UPDATE ON public.provider_appeals
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 6. RPC: provider submits an appeal ----------------------------------
CREATE OR REPLACE FUNCTION public.submit_provider_appeal_v1(
  _notice_id uuid,
  _statement text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _notice public.provider_decision_notices%ROWTYPE;
  _appeal_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _statement IS NULL OR length(btrim(_statement)) < 20 THEN
    RAISE EXCEPTION 'statement_too_short';
  END IF;
  IF length(_statement) > 10000 THEN RAISE EXCEPTION 'statement_too_long'; END IF;

  SELECT * INTO _notice FROM public.provider_decision_notices WHERE id = _notice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'notice_not_found'; END IF;
  IF _notice.provider_user_id <> _uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT _notice.appealable THEN RAISE EXCEPTION 'decision_not_appealable'; END IF;

  INSERT INTO public.provider_appeals (notice_id, provider_user_id, provider_statement)
  VALUES (_notice_id, _uid, btrim(_statement))
  RETURNING id INTO _appeal_id;

  INSERT INTO public.provider_appeal_events (appeal_id, actor_user_id, actor_role, event_type, to_status)
  VALUES (_appeal_id, _uid, 'provider', 'appeal_submitted', 'submitted');

  RETURN _appeal_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_provider_appeal_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_provider_appeal_v1(uuid, text) TO authenticated;

-- 7. RPC: provider adds follow-up information or withdraws -------------
CREATE OR REPLACE FUNCTION public.provider_appeal_respond_v1(
  _appeal_id uuid,
  _action text,
  _message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _appeal public.provider_appeals%ROWTYPE;
  _new_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _action NOT IN ('add_information','withdraw') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  SELECT * INTO _appeal FROM public.provider_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appeal_not_found'; END IF;
  IF _appeal.provider_user_id <> _uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _appeal.status IN ('upheld','changed','withdrawn') THEN RAISE EXCEPTION 'appeal_closed'; END IF;

  IF _action = 'withdraw' THEN
    _new_status := 'withdrawn';
    UPDATE public.provider_appeals
       SET status = _new_status, decided_at = now()
     WHERE id = _appeal_id;
  ELSE
    IF _message IS NULL OR length(btrim(_message)) = 0 THEN RAISE EXCEPTION 'message_required'; END IF;
    _new_status := 'under_review';
    UPDATE public.provider_appeals
       SET provider_followup = left(btrim(_message), 10000), status = _new_status
     WHERE id = _appeal_id;
  END IF;

  INSERT INTO public.provider_appeal_events (appeal_id, actor_user_id, actor_role, event_type, from_status, to_status)
  VALUES (_appeal_id, _uid, 'provider',
          CASE WHEN _action = 'withdraw' THEN 'appeal_withdrawn' ELSE 'provider_information_added' END,
          _appeal.status, _new_status);

  RETURN _new_status;
END;
$$;
REVOKE ALL ON FUNCTION public.provider_appeal_respond_v1(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_appeal_respond_v1(uuid, text, text) TO authenticated;

-- 8. RPC: staff review transition --------------------------------------
CREATE OR REPLACE FUNCTION public.admin_appeal_transition_v1(
  _appeal_id uuid,
  _to_status text,
  _reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _is_support boolean;
  _appeal public.provider_appeals%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  _is_admin := public.is_admin_only(_uid);
  _is_support := public.is_support_agent(_uid);
  IF NOT (_is_admin OR _is_support) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF _to_status NOT IN ('under_review','information_requested','upheld','changed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  -- Only admins may close an appeal with a final outcome.
  IF _to_status IN ('upheld','changed') AND NOT _is_admin THEN
    RAISE EXCEPTION 'admin_required_for_final_decision';
  END IF;
  IF _to_status IN ('upheld','changed','information_requested')
     AND (_reason IS NULL OR length(btrim(_reason)) < 10) THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO _appeal FROM public.provider_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appeal_not_found'; END IF;
  IF _appeal.status IN ('upheld','changed','withdrawn') THEN RAISE EXCEPTION 'appeal_closed'; END IF;

  UPDATE public.provider_appeals
     SET status = _to_status,
         reviewer_user_id = _uid,
         reviewer_reason = CASE WHEN _to_status IN ('upheld','changed') THEN btrim(_reason) ELSE reviewer_reason END,
         information_request = CASE WHEN _to_status = 'information_requested' THEN btrim(_reason) ELSE information_request END,
         decided_at = CASE WHEN _to_status IN ('upheld','changed') THEN now() ELSE decided_at END
   WHERE id = _appeal_id;

  INSERT INTO public.provider_appeal_events (appeal_id, actor_user_id, actor_role, event_type, from_status, to_status, note)
  VALUES (_appeal_id, _uid, CASE WHEN _is_admin THEN 'admin' ELSE 'support' END,
          'staff_transition', _appeal.status, _to_status, btrim(_reason));

  RETURN _to_status;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_appeal_transition_v1(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_appeal_transition_v1(uuid, text, text) TO authenticated;

-- 9. Providers no longer read the raw internal admin action ledger.
--    They read the sanitised provider_decision_notices instead.
DROP POLICY IF EXISTS provider_admin_actions_owner_read ON public.provider_admin_actions;
