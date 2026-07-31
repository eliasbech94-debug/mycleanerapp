ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_completed_job_popup_seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_first_completed_job_popup_state()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider_id TEXT;
  v_seen TIMESTAMPTZ;
  v_is_provider BOOLEAN;
  v_booking RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT p.provider_id, p.first_completed_job_popup_seen_at
    INTO v_provider_id, v_seen
  FROM public.profiles p
  WHERE p.id = v_uid;

  v_is_provider := public.has_role(v_uid, 'provider'::app_role);

  IF v_seen IS NOT NULL OR NOT v_is_provider THEN
    RETURN jsonb_build_object('eligible', false, 'seen_at', v_seen);
  END IF;

  -- First ever completed *and paid* booking for this provider.
  SELECT b.id, COALESCE(b.decided_at, b.updated_at, b.created_at) AS completed_at
    INTO v_booking
  FROM public.bookings b
  WHERE b.status = 'completed'::booking_status
    AND b.payment_status = 'captured'::payment_status
    AND (
      b.assigned_provider_id = v_uid
      OR (v_provider_id IS NOT NULL AND b.provider_id = v_provider_id)
    )
  ORDER BY COALESCE(b.decided_at, b.updated_at, b.created_at) ASC
  LIMIT 1;

  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'seen_at', NULL);
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'seen_at', NULL,
    'booking_id', v_booking.id,
    'completed_at', v_booking.completed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_first_completed_job_popup_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_first_completed_job_popup_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_first_completed_job_popup_seen()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_seen TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.profiles (id, first_completed_job_popup_seen_at)
  VALUES (v_uid, now())
  ON CONFLICT (id) DO UPDATE
    SET first_completed_job_popup_seen_at = COALESCE(public.profiles.first_completed_job_popup_seen_at, now())
  RETURNING first_completed_job_popup_seen_at INTO v_seen;

  RETURN v_seen;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_first_completed_job_popup_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_first_completed_job_popup_seen() TO authenticated;