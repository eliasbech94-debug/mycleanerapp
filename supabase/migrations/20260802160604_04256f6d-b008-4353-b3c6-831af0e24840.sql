-- ============================================================
-- Authoritative booking lifecycle (Part B + C)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.booking_lifecycle_state AS ENUM (
    'pending','accepted','declined','cancelled',
    'travelling','arrived','work_started','paused','resumed',
    'completed','awaiting_customer_confirmation','customer_confirmed',
    'hold_active','funds_released','payout_scheduled','paid'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS lifecycle_state public.booking_lifecycle_state,
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS work_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS work_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_pause_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_work_seconds integer;

-- Backfill lifecycle_state from the legacy status for existing rows.
UPDATE public.bookings
SET lifecycle_state = CASE status::text
      WHEN 'pending' THEN 'pending'
      WHEN 'accepted' THEN 'accepted'
      WHEN 'declined' THEN 'declined'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'completed' THEN 'completed'
    END::public.booking_lifecycle_state
WHERE lifecycle_state IS NULL;

-- ---------------- audit trail ----------------
CREATE TABLE IF NOT EXISTS public.booking_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_state public.booking_lifecycle_state,
  to_state public.booking_lifecycle_state NOT NULL,
  actor_user_id uuid,
  actor_role text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  payment_reference text,
  release_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_lifecycle_events_idem_uidx
  ON public.booking_lifecycle_events (booking_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS booking_lifecycle_events_booking_idx
  ON public.booking_lifecycle_events (booking_id, created_at DESC);

GRANT SELECT ON public.booking_lifecycle_events TO authenticated;
GRANT ALL ON public.booking_lifecycle_events TO service_role;

ALTER TABLE public.booking_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants read booking lifecycle" ON public.booking_lifecycle_events;
CREATE POLICY "participants read booking lifecycle"
ON public.booking_lifecycle_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_lifecycle_events.booking_id
      AND (b.customer_user_id = auth.uid() OR b.provider_id = auth.uid()::text)
  )
);

-- Append-only: no client may insert/update/delete (no policies for those).
CREATE OR REPLACE FUNCTION public.booking_lifecycle_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'booking_lifecycle_events is append-only';
END $$;

DROP TRIGGER IF EXISTS booking_lifecycle_events_no_mutation ON public.booking_lifecycle_events;
CREATE TRIGGER booking_lifecycle_events_no_mutation
BEFORE UPDATE OR DELETE ON public.booking_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION public.booking_lifecycle_events_immutable();

-- ---------------- hold duration ----------------
CREATE OR REPLACE FUNCTION public.booking_confirmation_hold_seconds_v1()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT 86400; -- MyCleaner rule: 24h hold after customer confirmation
$$;

-- ---------------- allowed transitions ----------------
CREATE OR REPLACE FUNCTION public.booking_lifecycle_allowed_v1(
  _from public.booking_lifecycle_state,
  _to public.booking_lifecycle_state
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _from::text
    WHEN 'pending'   THEN _to::text IN ('accepted','declined','cancelled')
    WHEN 'accepted'  THEN _to::text IN ('travelling','cancelled')
    WHEN 'travelling' THEN _to::text IN ('arrived','cancelled')
    WHEN 'arrived'   THEN _to::text IN ('work_started','cancelled')
    WHEN 'work_started' THEN _to::text IN ('paused','completed')
    WHEN 'paused'    THEN _to::text IN ('resumed')
    WHEN 'resumed'   THEN _to::text IN ('paused','completed')
    WHEN 'completed' THEN _to::text IN ('awaiting_customer_confirmation')
    WHEN 'awaiting_customer_confirmation' THEN _to::text IN ('customer_confirmed')
    WHEN 'customer_confirmed' THEN _to::text IN ('hold_active')
    WHEN 'hold_active' THEN _to::text IN ('funds_released')
    WHEN 'funds_released' THEN _to::text IN ('payout_scheduled')
    WHEN 'payout_scheduled' THEN _to::text IN ('paid')
    ELSE false
  END;
$$;

-- Which role may request which target state.
CREATE OR REPLACE FUNCTION public.booking_lifecycle_role_allowed_v1(
  _role text, _to public.booking_lifecycle_state
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _role IN ('system','admin') THEN true
    WHEN _role = 'provider' THEN _to::text IN
      ('travelling','arrived','work_started','paused','resumed','completed',
       'awaiting_customer_confirmation','accepted','declined','cancelled')
    WHEN _role = 'customer' THEN _to::text IN ('customer_confirmed','cancelled')
    ELSE false
  END;
$$;

-- ---------------- the state machine ----------------
CREATE OR REPLACE FUNCTION public.booking_lifecycle_transition_v1(
  _booking_id uuid,
  _to_state public.booking_lifecycle_state,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b public.bookings%ROWTYPE;
  v_uid uuid := auth.uid();
  v_role text;
  v_from public.booking_lifecycle_state;
  v_now timestamptz := now();
  v_prev public.booking_lifecycle_events%ROWTYPE;
  v_patch jsonb := '{}'::jsonb;
  v_pause integer;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0002'; END IF;

  -- Resolve the actor role server-side. Never trusted from the client.
  IF v_uid IS NULL THEN
    v_role := 'system';
  ELSIF public.has_role(v_uid,'admin') THEN
    v_role := 'admin';
  ELSIF v_b.customer_user_id = v_uid THEN
    v_role := 'customer';
  ELSIF v_b.provider_id = v_uid::text OR v_b.assigned_provider_id = v_uid THEN
    v_role := 'provider';
  ELSE
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  -- Idempotency by explicit key: replay returns the original result.
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.booking_lifecycle_events
     WHERE booking_id=_booking_id AND idempotency_key=_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('booking_id',_booking_id,'state',v_b.lifecycle_state,
        'applied',false,'idempotent',true,'event_id',v_prev.id);
    END IF;
  END IF;

  v_from := COALESCE(v_b.lifecycle_state,'pending');

  -- Same-state request is a no-op success (idempotent).
  IF v_from = _to_state THEN
    RETURN jsonb_build_object('booking_id',_booking_id,'state',v_from,
      'applied',false,'idempotent',true);
  END IF;

  IF NOT public.booking_lifecycle_role_allowed_v1(v_role,_to_state) THEN
    RAISE EXCEPTION 'role_not_allowed: % cannot set %', v_role, _to_state USING ERRCODE='42501';
  END IF;

  IF NOT public.booking_lifecycle_allowed_v1(v_from,_to_state) THEN
    RAISE EXCEPTION 'invalid_transition: % -> %', v_from, _to_state USING ERRCODE='22023';
  END IF;

  -- ---- side effects, all server-side timestamps ----
  v_patch := jsonb_build_object('lifecycle_state',_to_state,'lifecycle_updated_at',v_now);

  IF _to_state = 'work_started' THEN
    UPDATE public.bookings SET work_started_at = COALESCE(work_started_at, v_now) WHERE id=_booking_id;
  ELSIF _to_state = 'paused' THEN
    UPDATE public.bookings SET last_paused_at = v_now WHERE id=_booking_id;
  ELSIF _to_state = 'resumed' THEN
    v_pause := GREATEST(0, EXTRACT(EPOCH FROM (v_now - COALESCE(v_b.last_paused_at, v_now)))::int);
    UPDATE public.bookings
       SET total_pause_seconds = COALESCE(total_pause_seconds,0) + v_pause,
           last_paused_at = NULL
     WHERE id=_booking_id;
  ELSIF _to_state = 'completed' THEN
    UPDATE public.bookings
       SET work_completed_at = COALESCE(work_completed_at, v_now),
           status = 'completed'::public.booking_status,
           active_work_seconds = GREATEST(0,
             EXTRACT(EPOCH FROM (v_now - COALESCE(work_started_at, v_now)))::int
             - COALESCE(total_pause_seconds,0))
     WHERE id=_booking_id;
  ELSIF _to_state = 'customer_confirmed' THEN
    -- Starts the 24h hold. Funds release eligibility is computed from here.
    UPDATE public.bookings
       SET customer_confirmed_at = COALESCE(customer_confirmed_at, v_now),
           funds_release_at = COALESCE(funds_release_at,
             v_now + make_interval(secs => public.booking_confirmation_hold_seconds_v1()))
     WHERE id=_booking_id;
  ELSIF _to_state IN ('accepted','declined','cancelled') THEN
    UPDATE public.bookings
       SET status = _to_state::text::public.booking_status,
           decided_at = COALESCE(decided_at, v_now)
     WHERE id=_booking_id;
  END IF;

  UPDATE public.bookings
     SET lifecycle_state = _to_state, lifecycle_updated_at = v_now
   WHERE id=_booking_id;

  INSERT INTO public.booking_lifecycle_events (
    booking_id, from_state, to_state, actor_user_id, actor_role,
    reason, metadata, idempotency_key, payment_reference, release_reference
  ) VALUES (
    _booking_id, v_from, _to_state, v_uid, v_role,
    _reason, COALESCE(_metadata,'{}'::jsonb), _idempotency_key,
    v_b.payment_intent_id, NULLIF(_metadata->>'release_reference','')
  );

  -- Provider completion immediately hands the booking to the customer.
  IF _to_state = 'completed' THEN
    UPDATE public.bookings
       SET lifecycle_state='awaiting_customer_confirmation', lifecycle_updated_at=v_now
     WHERE id=_booking_id;
    INSERT INTO public.booking_lifecycle_events (
      booking_id, from_state, to_state, actor_user_id, actor_role, reason, metadata
    ) VALUES (_booking_id,'completed','awaiting_customer_confirmation',NULL,'system',
      'auto_after_completion','{}'::jsonb);
  END IF;

  -- Customer confirmation immediately arms the hold; funds are released only
  -- by the server-side release worker once the hold has elapsed.
  IF _to_state = 'customer_confirmed' THEN
    UPDATE public.bookings
       SET lifecycle_state='hold_active', lifecycle_updated_at=v_now
     WHERE id=_booking_id;
    INSERT INTO public.booking_lifecycle_events (
      booking_id, from_state, to_state, actor_user_id, actor_role, reason, metadata
    ) VALUES (_booking_id,'customer_confirmed','hold_active',NULL,'system',
      'confirmation_hold_started',
      jsonb_build_object('hold_seconds', public.booking_confirmation_hold_seconds_v1()));
  END IF;

  SELECT lifecycle_state INTO v_from FROM public.bookings WHERE id=_booking_id;
  RETURN jsonb_build_object('booking_id',_booking_id,'state',v_from,'applied',true,
    'actor_role',v_role,'at',v_now);
END $$;

REVOKE ALL ON FUNCTION public.booking_lifecycle_transition_v1(uuid, public.booking_lifecycle_state, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_lifecycle_transition_v1(uuid, public.booking_lifecycle_state, text, jsonb, text) TO authenticated, service_role;