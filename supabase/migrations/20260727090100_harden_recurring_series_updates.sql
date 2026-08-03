-- Harden recurrence updates: participants may read a series, but must not be
-- able to rewrite provider, schedule, timezone or the 12-week horizon through
-- the generic REST API. State changes go through narrow RPCs.

DROP POLICY IF EXISTS recurring_booking_series_participant_update
  ON public.recurring_booking_series;

REVOKE UPDATE ON public.recurring_booking_series FROM authenticated;

CREATE OR REPLACE FUNCTION public.accept_recurring_booking_series(_series_id uuid)
RETURNS public.recurring_booking_series
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_series public.recurring_booking_series;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.recurring_booking_series
  SET status = 'active',
      provider_accepted_at = COALESCE(provider_accepted_at, now()),
      next_materialise_at = now(),
      updated_at = now()
  WHERE id = _series_id
    AND provider_user_id = v_uid
    AND status = 'pending_provider'
  RETURNING * INTO v_series;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'series_not_pending_or_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN v_series;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_recurring_booking_series_state(
  _series_id uuid,
  _new_status text
)
RETURNS public.recurring_booking_series
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_series public.recurring_booking_series;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _new_status NOT IN ('paused', 'active', 'ended', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_series_state' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_series
  FROM public.recurring_booking_series
  WHERE id = _series_id
  FOR UPDATE;

  IF NOT FOUND OR (v_series.provider_user_id <> v_uid AND v_series.customer_user_id <> v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_series.status IN ('ended', 'cancelled') THEN
    RAISE EXCEPTION 'series_is_terminal' USING ERRCODE = 'check_violation';
  END IF;
  IF _new_status = 'active' AND v_series.provider_accepted_at IS NULL THEN
    RAISE EXCEPTION 'provider_acceptance_required' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.recurring_booking_series
  SET status = _new_status,
      paused_at = CASE WHEN _new_status = 'paused' THEN now() ELSE paused_at END,
      ended_at = CASE WHEN _new_status IN ('ended', 'cancelled') THEN now() ELSE ended_at END,
      next_materialise_at = CASE
        WHEN _new_status = 'active' THEN now()
        WHEN _new_status IN ('paused', 'ended', 'cancelled') THEN NULL
        ELSE next_materialise_at
      END,
      updated_at = now()
  WHERE id = _series_id
  RETURNING * INTO v_series;

  RETURN v_series;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_recurring_booking_series(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_recurring_booking_series_state(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_recurring_booking_series(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_recurring_booking_series_state(uuid, text)
  TO authenticated, service_role;
