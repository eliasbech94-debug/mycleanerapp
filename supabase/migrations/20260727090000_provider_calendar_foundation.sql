-- Provider calendar foundation (Phase 1)
--
-- Privacy by design:
--   * External calendar event titles, attendees, notes, descriptions and
--     locations are never stored.
--   * External events are reduced to busy intervals and a one-way event hash.
--   * Calendar credentials are referenced by an opaque secret reference; raw
--     iCal URLs/tokens must live in the platform secret store, never here.
--
-- Product invariants:
--   * Providers define recurring weekly working intervals in their own TZ.
--   * Time off, accepted bookings and external calendars block availability.
--   * Active slot locks cannot overlap for the same provider.
--   * Recurring agreements materialise at most 12 weeks ahead.
--   * Every occurrence remains an independent booking/payment record.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.provider_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES public.provider_profiles(user_id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- ISO: Mon=1
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  timezone text NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  effective_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_availability_rule_time_check CHECK (starts_at < ends_at),
  CONSTRAINT provider_availability_rule_dates_check CHECK (
    effective_until IS NULL OR effective_until >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS provider_availability_rules_provider_idx
  ON public.provider_availability_rules(provider_user_id, weekday)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.provider_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES public.provider_profiles(user_id) ON DELETE CASCADE,
  connection_type text NOT NULL CHECK (connection_type IN ('ical')),
  credential_ref text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  consented_at timestamptz NOT NULL,
  disconnected_at timestamptz,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_user_id, credential_ref),
  CONSTRAINT provider_calendar_connection_consent_check CHECK (
    status = 'disconnected' OR consented_at IS NOT NULL
  )
);

COMMENT ON COLUMN public.provider_calendar_connections.credential_ref IS
  'Opaque reference to a secret-store entry. Never store a raw iCal URL or token here.';

CREATE TABLE IF NOT EXISTS public.provider_calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES public.provider_profiles(user_id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.provider_calendar_connections(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('manual', 'time_off', 'booking', 'external_calendar')),
  external_event_key_hash text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_calendar_block_time_check CHECK (starts_at < ends_at),
  CONSTRAINT provider_calendar_external_privacy_check CHECK (
    source <> 'external_calendar'
    OR (connection_id IS NOT NULL AND external_event_key_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS provider_calendar_blocks_provider_time_idx
  ON public.provider_calendar_blocks(provider_user_id, starts_at, ends_at);

CREATE UNIQUE INDEX IF NOT EXISTS provider_calendar_blocks_external_event_uidx
  ON public.provider_calendar_blocks(connection_id, external_event_key_hash, starts_at, ends_at)
  WHERE source = 'external_calendar';

CREATE TABLE IF NOT EXISTS public.booking_slot_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES public.provider_profiles(user_id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'confirmed', 'released', 'expired', 'cancelled')),
  hold_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_slot_lock_time_check CHECK (starts_at < ends_at),
  CONSTRAINT booking_slot_lock_hold_expiry_check CHECK (
    status <> 'held' OR hold_expires_at IS NOT NULL
  )
);

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_slot_locks_no_overlap'
      AND conrelid = 'public.booking_slot_locks'::regclass
  ) THEN
    ALTER TABLE public.booking_slot_locks
      ADD CONSTRAINT booking_slot_locks_no_overlap
      EXCLUDE USING gist (
        provider_user_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status IN ('held', 'confirmed'));
  END IF;
END
$constraint$;

CREATE INDEX IF NOT EXISTS booking_slot_locks_booking_idx
  ON public.booking_slot_locks(booking_id)
  WHERE booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recurring_booking_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_user_id uuid NOT NULL REFERENCES public.provider_profiles(user_id) ON DELETE RESTRICT,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'fortnightly', 'monthly')),
  anchor_starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 30 AND 720),
  timezone text NOT NULL,
  monthly_rule jsonb,
  horizon_weeks smallint NOT NULL DEFAULT 12 CHECK (horizon_weeks BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'pending_provider'
    CHECK (status IN ('pending_provider', 'active', 'paused', 'ended', 'cancelled')),
  provider_accepted_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  next_materialise_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_monthly_rule_check CHECK (
    frequency <> 'monthly' OR monthly_rule IS NOT NULL
  )
);

COMMENT ON TABLE public.recurring_booking_series IS
  'Agreement only. Concrete bookings are materialised on a rolling horizon of no more than 12 weeks.';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS recurring_series_id uuid
    REFERENCES public.recurring_booking_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS occurrence_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_recurring_series_idx
  ON public.bookings(recurring_series_id)
  WHERE recurring_series_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.provider_calendar_assert_timezone(_timezone text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF _timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = _timezone
  ) THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_provider_slot_lock(
  _provider_user_id uuid,
  _booking_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _hold_minutes integer DEFAULT 15
)
RETURNS public.booking_slot_locks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer uuid;
  v_lock public.booking_slot_locks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _starts_at >= _ends_at OR _starts_at < now() THEN
    RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
  END IF;
  IF _hold_minutes < 1 OR _hold_minutes > 30 THEN
    RAISE EXCEPTION 'invalid_hold_duration' USING ERRCODE = '22023';
  END IF;

  SELECT customer_user_id INTO v_customer
  FROM public.bookings
  WHERE id = _booking_id;

  IF v_customer IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_slot_locks
  SET status = 'expired', updated_at = now()
  WHERE provider_user_id = _provider_user_id
    AND status = 'held'
    AND hold_expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.provider_calendar_blocks b
    WHERE b.provider_user_id = _provider_user_id
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(_starts_at, _ends_at, '[)')
      AND (b.expires_at IS NULL OR b.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'provider_unavailable' USING ERRCODE = '23P01';
  END IF;

  BEGIN
    INSERT INTO public.booking_slot_locks(
      provider_user_id, booking_id, starts_at, ends_at,
      status, hold_expires_at
    ) VALUES (
      _provider_user_id, _booking_id, _starts_at, _ends_at,
      'held', now() + make_interval(mins => _hold_minutes)
    )
    RETURNING * INTO v_lock;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'slot_already_reserved' USING ERRCODE = '23P01';
  END;

  RETURN v_lock;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_provider_slot_lock(uuid, uuid, timestamptz, timestamptz, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_provider_slot_lock(uuid, uuid, timestamptz, timestamptz, integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_provider_slot_lock(_booking_id uuid)
RETURNS public.booking_slot_locks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer uuid;
  v_lock public.booking_slot_locks;
BEGIN
  SELECT customer_user_id INTO v_customer FROM public.bookings WHERE id = _booking_id;
  IF v_uid IS NULL OR v_customer IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_slot_locks
  SET status = 'confirmed', hold_expires_at = NULL, updated_at = now()
  WHERE booking_id = _booking_id
    AND status = 'held'
    AND hold_expires_at > now()
  RETURNING * INTO v_lock;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_hold_missing_or_expired' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_lock;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_provider_slot_lock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_provider_slot_lock(uuid) TO authenticated, service_role;

ALTER TABLE public.provider_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_slot_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_booking_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_availability_owner_all ON public.provider_availability_rules;
CREATE POLICY provider_availability_owner_all
ON public.provider_availability_rules
FOR ALL TO authenticated
USING (provider_user_id = auth.uid())
WITH CHECK (provider_user_id = auth.uid());

DROP POLICY IF EXISTS provider_calendar_connections_owner_all ON public.provider_calendar_connections;
CREATE POLICY provider_calendar_connections_owner_all
ON public.provider_calendar_connections
FOR ALL TO authenticated
USING (provider_user_id = auth.uid())
WITH CHECK (provider_user_id = auth.uid());

DROP POLICY IF EXISTS provider_calendar_blocks_owner_read ON public.provider_calendar_blocks;
CREATE POLICY provider_calendar_blocks_owner_read
ON public.provider_calendar_blocks
FOR SELECT TO authenticated
USING (provider_user_id = auth.uid());

DROP POLICY IF EXISTS booking_slot_locks_participant_read ON public.booking_slot_locks;
CREATE POLICY booking_slot_locks_participant_read
ON public.booking_slot_locks
FOR SELECT TO authenticated
USING (
  provider_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND b.customer_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS recurring_booking_series_participant_read ON public.recurring_booking_series;
CREATE POLICY recurring_booking_series_participant_read
ON public.recurring_booking_series
FOR SELECT TO authenticated
USING (provider_user_id = auth.uid() OR customer_user_id = auth.uid());

DROP POLICY IF EXISTS recurring_booking_series_customer_insert ON public.recurring_booking_series;
CREATE POLICY recurring_booking_series_customer_insert
ON public.recurring_booking_series
FOR INSERT TO authenticated
WITH CHECK (customer_user_id = auth.uid() AND status = 'pending_provider');

DROP POLICY IF EXISTS recurring_booking_series_participant_update ON public.recurring_booking_series;
CREATE POLICY recurring_booking_series_participant_update
ON public.recurring_booking_series
FOR UPDATE TO authenticated
USING (provider_user_id = auth.uid() OR customer_user_id = auth.uid())
WITH CHECK (provider_user_id = auth.uid() OR customer_user_id = auth.uid());

REVOKE ALL ON public.provider_calendar_connections FROM anon;
REVOKE ALL ON public.provider_calendar_blocks FROM anon;
REVOKE ALL ON public.booking_slot_locks FROM anon;
REVOKE ALL ON public.recurring_booking_series FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_availability_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_calendar_connections TO authenticated;
GRANT SELECT ON public.provider_calendar_blocks TO authenticated;
GRANT SELECT ON public.booking_slot_locks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recurring_booking_series TO authenticated;

-- No calendar connection, busy interval or recurrence can enable Funds Release.
DO $safety$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE flag_key = 'funds_release.enabled'
      AND scope = 'global'
      AND enabled IS TRUE
  ) THEN
    RAISE EXCEPTION 'calendar migration refuses to run while funds_release.enabled is true';
  END IF;
END
$safety$;
