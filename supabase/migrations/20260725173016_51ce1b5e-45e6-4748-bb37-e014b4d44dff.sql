-- =====================================================================
-- PR-2: Atomic provider offer claim + decline (direct-provider mode)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: derive [starts_at, ends_at) for a booking row
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_interval_from_row(_b public.bookings)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tz text := COALESCE(_b.timezone, 'Europe/Copenhagen');
  v_slot text := _b.slot;
  v_local timestamp;
  v_starts timestamptz;
BEGIN
  IF v_slot IS NULL OR v_slot !~ '^[0-2][0-9]:[0-5][0-9]$' THEN
    RAISE EXCEPTION 'booking slot % is not HH:MM', v_slot USING ERRCODE = '22023';
  END IF;
  v_local := (to_char(_b.booking_date, 'YYYY-MM-DD') || ' ' || v_slot || ':00')::timestamp;
  v_starts := v_local AT TIME ZONE v_tz;
  RETURN QUERY SELECT v_starts, v_starts + (_b.hours * interval '1 hour');
END;
$$;

REVOKE ALL ON FUNCTION public.booking_interval_from_row(public.bookings) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_interval_from_row(public.bookings) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- claim_booking_offer_v1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_booking_offer_v1(_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.provider_offers%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_starts timestamptz;
  v_ends timestamptz;
  v_prov_status text;
  v_existing_lock uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status','unauthenticated');
  END IF;

  -- Lock the offer row
  SELECT * INTO v_offer FROM public.provider_offers
   WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  IF v_offer.provider_user_id <> v_uid THEN
    RETURN jsonb_build_object('status','forbidden');
  END IF;

  -- Lock the booking row
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = v_offer.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  -- IDEMPOTENT REPLAY: same provider already assigned
  IF v_booking.assigned_provider_id = v_uid AND v_offer.offer_status = 'accepted' THEN
    RETURN jsonb_build_object(
      'status','assigned',
      'replay', true,
      'booking_id', v_booking.id,
      'offer_id', v_offer.id,
      'assigned_provider_id', v_uid
    );
  END IF;

  -- Losing/late claim: booking already assigned to someone else
  IF v_booking.assigned_provider_id IS NOT NULL AND v_booking.assigned_provider_id <> v_uid THEN
    -- Ensure this offer reflects reality
    IF v_offer.offer_status IN ('pending','viewed') THEN
      UPDATE public.provider_offers
         SET offer_status='superseded', expired_at=now()
       WHERE id = v_offer.id;
    END IF;
    RETURN jsonb_build_object('status','already_assigned');
  END IF;

  -- Direct-provider mode only in PR-2
  IF v_booking.assignment_mode <> 'direct_provider' THEN
    RETURN jsonb_build_object('status','unsupported_mode');
  END IF;
  IF v_booking.requested_provider_id IS NULL OR v_booking.requested_provider_id <> v_uid THEN
    RETURN jsonb_build_object('status','forbidden');
  END IF;

  -- Offer must be claimable
  IF v_offer.offer_status NOT IN ('pending','viewed') THEN
    RETURN jsonb_build_object('status','offer_no_longer_available');
  END IF;

  -- Booking status must be claimable
  IF v_booking.status NOT IN ('pending') THEN
    RETURN jsonb_build_object('status','booking_not_claimable');
  END IF;
  IF v_booking.dispatch_status NOT IN ('awaiting_provider','dispatched','queued') THEN
    RETURN jsonb_build_object('status','booking_not_claimable');
  END IF;

  -- Compute interval + validate
  SELECT s, e INTO v_starts, v_ends
    FROM public.booking_interval_from_row(v_booking) AS x(s,e);
  PERFORM public.validate_booking_interval(v_starts, v_ends, NULL, 600);

  -- Provider eligibility revalidation
  SELECT status::text INTO v_prov_status FROM public.provider_profiles WHERE user_id = v_uid;
  IF v_prov_status IS NULL OR v_prov_status NOT IN ('active') THEN
    RETURN jsonb_build_object('status','provider_ineligible');
  END IF;

  -- Insert slot lock; rely on exclusion constraint for concurrency
  BEGIN
    INSERT INTO public.booking_slot_locks
      (booking_id, provider_user_id, booking_date, slot, hours, status, starts_at, ends_at, reason)
    VALUES
      (v_booking.id, v_uid, v_booking.booking_date, v_booking.slot, v_booking.hours,
       'active', v_starts, v_ends, 'claim_booking_offer_v1');
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('status','slot_conflict');
    WHEN unique_violation THEN
      -- extremely unlikely race
      RETURN jsonb_build_object('status','slot_conflict');
  END;

  -- Assign booking
  UPDATE public.bookings
     SET assigned_provider_id = v_uid,
         provider_id          = v_uid::text,
         assigned_at          = now(),
         dispatch_status      = 'assigned',
         status               = 'accepted',
         decided_at           = COALESCE(decided_at, now()),
         updated_at           = now()
   WHERE id = v_booking.id;

  -- Mark winning offer accepted
  UPDATE public.provider_offers
     SET offer_status='accepted', accepted_at=now()
   WHERE id = v_offer.id;

  -- Close competing offers
  UPDATE public.provider_offers
     SET offer_status='superseded', expired_at=now()
   WHERE booking_id = v_booking.id
     AND id <> v_offer.id
     AND offer_status IN ('pending','viewed');

  -- Audit trail
  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, booking_id, new_state, metadata)
  VALUES
    (v_uid, 'provider', 'booking.offer_accepted', 'booking', v_booking.id::text, v_booking.id,
     jsonb_build_object('offer_id', v_offer.id, 'assigned_provider_id', v_uid,
                        'starts_at', v_starts, 'ends_at', v_ends),
     jsonb_build_object('rpc','claim_booking_offer_v1'));

  -- Notification outbox (idempotent via dedupe_key)
  INSERT INTO public.notification_outbox
    (user_id, channel, event_type, subject, payload, related_booking_id, dedupe_key)
  VALUES
    (v_booking.customer_user_id, 'in_app', 'booking.provider_assigned',
     'Din booking er bekræftet',
     jsonb_build_object('booking_id', v_booking.id, 'provider_user_id', v_uid),
     v_booking.id,
     'booking:' || v_booking.id || ':assigned:customer')
  ON CONFLICT (user_id, channel, dedupe_key) DO NOTHING;

  INSERT INTO public.notification_outbox
    (user_id, channel, event_type, subject, payload, related_booking_id, dedupe_key)
  VALUES
    (v_uid, 'in_app', 'booking.offer_accepted_confirmation',
     'Booking tildelt',
     jsonb_build_object('booking_id', v_booking.id),
     v_booking.id,
     'booking:' || v_booking.id || ':assigned:provider')
  ON CONFLICT (user_id, channel, dedupe_key) DO NOTHING;

  RETURN jsonb_build_object(
    'status','assigned',
    'replay', false,
    'booking_id', v_booking.id,
    'offer_id', v_offer.id,
    'assigned_provider_id', v_uid,
    'starts_at', v_starts,
    'ends_at', v_ends
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_booking_offer_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_booking_offer_v1(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- decline_booking_offer_v1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_booking_offer_v1(_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.provider_offers%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status','unauthenticated');
  END IF;

  SELECT * INTO v_offer FROM public.provider_offers
   WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  IF v_offer.provider_user_id <> v_uid THEN
    RETURN jsonb_build_object('status','forbidden');
  END IF;

  -- Idempotent replay
  IF v_offer.offer_status = 'declined' THEN
    RETURN jsonb_build_object('status','declined','replay',true,'offer_id',v_offer.id);
  END IF;

  IF v_offer.offer_status NOT IN ('pending','viewed') THEN
    RETURN jsonb_build_object('status','offer_no_longer_available');
  END IF;

  SELECT * INTO v_booking FROM public.bookings
   WHERE id = v_offer.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  UPDATE public.provider_offers
     SET offer_status='declined', declined_at=now()
   WHERE id = v_offer.id;

  -- Direct-provider mode: mark booking unfulfilled so customer can rebook
  IF v_booking.assignment_mode = 'direct_provider'
     AND v_booking.assigned_provider_id IS NULL
     AND v_booking.requested_provider_id = v_uid THEN
    UPDATE public.bookings
       SET dispatch_status='unfulfilled', updated_at=now()
     WHERE id = v_booking.id;
  END IF;

  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, booking_id, new_state, metadata)
  VALUES
    (v_uid, 'provider', 'booking.offer_declined', 'booking', v_booking.id::text, v_booking.id,
     jsonb_build_object('offer_id', v_offer.id),
     jsonb_build_object('rpc','decline_booking_offer_v1'));

  INSERT INTO public.notification_outbox
    (user_id, channel, event_type, subject, payload, related_booking_id, dedupe_key)
  VALUES
    (v_booking.customer_user_id, 'in_app', 'booking.provider_declined',
     'Din valgte cleaner kunne ikke tage bookingen',
     jsonb_build_object('booking_id', v_booking.id, 'provider_user_id', v_uid),
     v_booking.id,
     'booking:' || v_booking.id || ':declined:' || v_uid::text)
  ON CONFLICT (user_id, channel, dedupe_key) DO NOTHING;

  RETURN jsonb_build_object(
    'status','declined',
    'replay', false,
    'offer_id', v_offer.id,
    'booking_id', v_booking.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_booking_offer_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_booking_offer_v1(uuid) TO authenticated;
