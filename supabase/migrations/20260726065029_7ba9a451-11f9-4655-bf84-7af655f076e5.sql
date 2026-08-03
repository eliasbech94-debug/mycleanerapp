-- PR-2b: authoritative service duration rules + hardened claim RPC

CREATE TABLE IF NOT EXISTS public.service_duration_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key text NOT NULL,
  country_code text,
  min_minutes integer NOT NULL,
  max_minutes integer NOT NULL DEFAULT 600,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_duration_rules_min_grid CHECK (min_minutes > 0 AND min_minutes % 30 = 0),
  CONSTRAINT service_duration_rules_max_grid CHECK (max_minutes >= min_minutes AND max_minutes % 30 = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS service_duration_rules_country_uq
  ON public.service_duration_rules (service_key, country_code)
  WHERE country_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS service_duration_rules_global_uq
  ON public.service_duration_rules (service_key)
  WHERE country_code IS NULL;

GRANT SELECT ON public.service_duration_rules TO anon, authenticated;
GRANT ALL ON public.service_duration_rules TO service_role;

ALTER TABLE public.service_duration_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service duration rules are readable" ON public.service_duration_rules;
CREATE POLICY "Service duration rules are readable"
  ON public.service_duration_rules FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage service duration rules" ON public.service_duration_rules;
CREATE POLICY "Admins manage service duration rules"
  ON public.service_duration_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_service_duration_rules_updated_at ON public.service_duration_rules;
CREATE TRIGGER trg_service_duration_rules_updated_at
  BEFORE UPDATE ON public.service_duration_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.service_duration_rules (service_key, country_code, min_minutes, max_minutes, notes) VALUES
  ('*',                    NULL, 60,  600, 'Global fallback minimum'),
  ('cleaning',             NULL, 90,  600, 'Standard cleaning minimum 90 minutes'),
  ('home_cleaning',        NULL, 90,  600, 'Standard home cleaning minimum 90 minutes'),
  ('after_party_cleaning', NULL, 120, 600, 'After-party cleaning minimum 120 minutes'),
  ('deep_cleaning',        NULL, 120, 600, 'Deep cleaning minimum 120 minutes'),
  ('move_out_cleaning',    NULL, 120, 600, 'Move-out cleaning minimum 120 minutes'),
  ('office_cleaning',      NULL, 120, 600, 'Commercial cleaning minimum 120 minutes'),
  ('window_cleaning',      NULL, 60,  600, 'Window cleaning minimum 60 minutes'),
  ('handyman',             NULL, 60,  600, 'Handyman minimum 60 minutes'),
  ('garden',               NULL, 60,  600, 'Garden minimum 60 minutes'),
  ('moving',               NULL, 60,  600, 'Moving minimum 60 minutes')
ON CONFLICT DO NOTHING;

-- Resolver: service+country -> service (global) -> '*'+country -> '*' (global)
CREATE OR REPLACE FUNCTION public.resolve_service_duration_rule(_service text, _country_code text)
RETURNS TABLE(min_minutes integer, max_minutes integer, source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.min_minutes, r.max_minutes,
         'service_duration_rules:' || r.service_key || COALESCE(':' || r.country_code, ':*')
    FROM public.service_duration_rules r
   WHERE r.active
     AND r.service_key IN (COALESCE(lower(_service), '*'), '*')
     AND (r.country_code IS NULL OR r.country_code = upper(COALESCE(_country_code, '')))
   ORDER BY (r.service_key = '*') ASC, (r.country_code IS NULL) ASC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_service_duration_rule(text, text) TO authenticated, service_role;

-- Hardened claim RPC
CREATE OR REPLACE FUNCTION public.claim_booking_offer_v1(_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.provider_offers%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_starts timestamptz;
  v_ends timestamptz;
  v_prov public.provider_profiles%ROWTYPE;
  v_min int;
  v_max int;
  v_rule_src text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status','unauthenticated');
  END IF;

  SELECT * INTO v_offer FROM public.provider_offers WHERE id = _offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  IF v_offer.provider_user_id <> v_uid THEN
    RETURN jsonb_build_object('status','forbidden');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_offer.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  IF v_booking.assigned_provider_id = v_uid AND v_offer.offer_status = 'accepted' THEN
    RETURN jsonb_build_object(
      'status','assigned', 'replay', true,
      'booking_id', v_booking.id, 'offer_id', v_offer.id,
      'assigned_provider_id', v_uid);
  END IF;

  IF v_booking.assigned_provider_id IS NOT NULL AND v_booking.assigned_provider_id <> v_uid THEN
    IF v_offer.offer_status IN ('pending','viewed') THEN
      UPDATE public.provider_offers SET offer_status='superseded', expired_at=now() WHERE id = v_offer.id;
    END IF;
    RETURN jsonb_build_object('status','already_assigned','booking_id',v_booking.id);
  END IF;

  IF v_booking.assignment_mode <> 'direct_provider' THEN
    RETURN jsonb_build_object('status','unsupported_mode');
  END IF;
  IF v_booking.requested_provider_id IS NULL OR v_booking.requested_provider_id <> v_uid THEN
    RETURN jsonb_build_object('status','forbidden');
  END IF;
  IF v_offer.offer_status NOT IN ('pending','viewed') THEN
    RETURN jsonb_build_object('status','offer_no_longer_available');
  END IF;
  IF v_booking.status NOT IN ('pending') THEN
    RETURN jsonb_build_object('status','booking_not_claimable');
  END IF;
  IF v_booking.dispatch_status NOT IN ('awaiting_provider','dispatched','queued') THEN
    RETURN jsonb_build_object('status','booking_not_claimable');
  END IF;

  -- Authoritative service duration rule
  SELECT r.min_minutes, r.max_minutes, r.source
    INTO v_min, v_max, v_rule_src
    FROM public.resolve_service_duration_rule(v_booking.service, v_booking.country_code) r;
  v_min := COALESCE(v_min, 60);
  v_max := COALESCE(v_max, 600);

  SELECT s, e INTO v_starts, v_ends
    FROM public.booking_interval_from_row(v_booking) AS x(s,e);

  BEGIN
    PERFORM public.validate_booking_interval(
      _starts_at   => v_starts,
      _ends_at     => v_ends,
      _min_minutes => v_min,
      _max_minutes => v_max
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'status','invalid_interval',
      'min_minutes', v_min,
      'max_minutes', v_max,
      'rule_source', v_rule_src);
  END;

  -- Provider eligibility revalidation
  SELECT * INTO v_prov FROM public.provider_profiles WHERE user_id = v_uid;
  IF v_prov.user_id IS NULL THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','no_profile');
  END IF;
  IF v_prov.status::text <> 'active' THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','status_not_active');
  END IF;
  IF v_prov.suspended_at IS NOT NULL OR v_prov.rejected_at IS NOT NULL OR v_prov.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','suspended_or_blocked');
  END IF;
  IF v_prov.approved_at IS NULL THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','not_approved');
  END IF;
  IF v_prov.terms_accepted_at IS NULL THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','terms_not_accepted');
  END IF;
  IF v_booking.service IS NOT NULL
     AND COALESCE(array_length(v_prov.service_categories, 1), 0) > 0
     AND NOT (lower(v_booking.service) = ANY (SELECT lower(x) FROM unnest(v_prov.service_categories) x)) THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','service_not_offered');
  END IF;
  IF v_booking.country_code IS NOT NULL
     AND v_prov.base_country_code IS NOT NULL
     AND upper(v_prov.base_country_code) <> upper(v_booking.country_code) THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','country_not_served');
  END IF;
  IF v_prov.identity_status IS NOT NULL
     AND lower(v_prov.identity_status) IN ('rejected','failed','expired','blocked') THEN
    RETURN jsonb_build_object('status','provider_ineligible','reason','identity_not_verified');
  END IF;

  BEGIN
    INSERT INTO public.booking_slot_locks
      (booking_id, provider_user_id, booking_date, slot, hours, status, starts_at, ends_at, reason)
    VALUES
      (v_booking.id, v_uid, v_booking.booking_date, v_booking.slot, v_booking.hours,
       'active', v_starts, v_ends, 'claim_booking_offer_v1');
  EXCEPTION
    WHEN exclusion_violation THEN RETURN jsonb_build_object('status','slot_conflict');
    WHEN unique_violation    THEN RETURN jsonb_build_object('status','slot_conflict');
  END;

  UPDATE public.bookings
     SET assigned_provider_id = v_uid,
         provider_id          = v_uid::text,
         assigned_at          = now(),
         dispatch_status      = 'assigned',
         status               = 'accepted',
         decided_at           = COALESCE(decided_at, now()),
         updated_at           = now()
   WHERE id = v_booking.id;

  UPDATE public.provider_offers
     SET offer_status='accepted', accepted_at=now()
   WHERE id = v_offer.id;

  UPDATE public.provider_offers
     SET offer_status='superseded', expired_at=now()
   WHERE booking_id = v_booking.id
     AND id <> v_offer.id
     AND offer_status IN ('pending','viewed');

  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, booking_id, new_state, metadata)
  VALUES
    (v_uid, 'provider', 'booking.offer_accepted', 'booking', v_booking.id::text, v_booking.id,
     jsonb_build_object('offer_id', v_offer.id, 'assigned_provider_id', v_uid,
                        'starts_at', v_starts, 'ends_at', v_ends),
     jsonb_build_object('rpc','claim_booking_offer_v1','duration_rule',v_rule_src,
                        'min_minutes',v_min,'max_minutes',v_max));

  INSERT INTO public.notification_outbox
    (user_id, channel, event_type, subject, payload, related_booking_id, dedupe_key)
  VALUES
    (v_booking.customer_user_id, 'in_app', 'booking.provider_assigned',
     'Din booking er bekræftet',
     jsonb_build_object('booking_id', v_booking.id, 'provider_user_id', v_uid),
     v_booking.id, 'booking:' || v_booking.id || ':assigned:customer')
  ON CONFLICT (user_id, channel, dedupe_key) DO NOTHING;

  INSERT INTO public.notification_outbox
    (user_id, channel, event_type, subject, payload, related_booking_id, dedupe_key)
  VALUES
    (v_uid, 'in_app', 'booking.offer_accepted_confirmation',
     'Booking tildelt',
     jsonb_build_object('booking_id', v_booking.id),
     v_booking.id, 'booking:' || v_booking.id || ':assigned:provider')
  ON CONFLICT (user_id, channel, dedupe_key) DO NOTHING;

  RETURN jsonb_build_object(
    'status','assigned', 'replay', false,
    'booking_id', v_booking.id, 'offer_id', v_offer.id,
    'assigned_provider_id', v_uid,
    'starts_at', v_starts, 'ends_at', v_ends,
    'min_minutes', v_min, 'max_minutes', v_max, 'rule_source', v_rule_src);
END;
$function$;
