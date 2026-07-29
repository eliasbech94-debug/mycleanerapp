-- =============================================================================
-- PR-1 — Booking Dispatch Schema Foundation (additive only)
--
-- Adds provider-selection modes (direct_provider / quick_match), offer objects,
-- slot locks, dispatch metadata, indexes, RLS, backfill, and self-tests.
-- No existing behaviour is changed. Legacy bookings.provider_id is preserved.
-- =============================================================================

-- 1. Enums --------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_assignment_mode') THEN
    CREATE TYPE public.booking_assignment_mode AS ENUM ('direct_provider','quick_match');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_dispatch_status') THEN
    CREATE TYPE public.booking_dispatch_status AS ENUM
      ('queued','awaiting_provider','dispatched','assigned','unfulfilled','cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status') THEN
    CREATE TYPE public.offer_status AS ENUM
      ('pending','viewed','accepted','declined','expired','superseded');
  END IF;
END $$;

-- 2. Extend public.bookings ---------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS assignment_mode          public.booking_assignment_mode,
  ADD COLUMN IF NOT EXISTS requested_provider_id    uuid,
  ADD COLUMN IF NOT EXISTS assigned_provider_id     uuid,
  ADD COLUMN IF NOT EXISTS dispatch_status          public.booking_dispatch_status,
  ADD COLUMN IF NOT EXISTS dispatched_at            timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_deadline_at   timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_at              timestamptz,
  ADD COLUMN IF NOT EXISTS max_provider_cost_minor  bigint;

-- Foreign keys (soft — SET NULL on auth.users delete so bookings survive)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_requested_provider_fk') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_requested_provider_fk
      FOREIGN KEY (requested_provider_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_assigned_provider_fk') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_assigned_provider_fk
      FOREIGN KEY (assigned_provider_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Backfill -----------------------------------------------------------------
-- All existing bookings are direct-provider by construction.
UPDATE public.bookings
   SET assignment_mode = 'direct_provider'::public.booking_assignment_mode
 WHERE assignment_mode IS NULL;

-- Copy legacy provider_id into requested_provider_id where it is a valid uuid.
UPDATE public.bookings
   SET requested_provider_id = provider_id::uuid
 WHERE requested_provider_id IS NULL
   AND provider_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Copy legacy provider_id into assigned_provider_id only for terminal states.
UPDATE public.bookings
   SET assigned_provider_id = provider_id::uuid,
       assigned_at          = COALESCE(assigned_at, decided_at, updated_at)
 WHERE assigned_provider_id IS NULL
   AND provider_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND status IN ('accepted'::public.booking_status, 'completed'::public.booking_status);

-- Derive an initial dispatch_status consistent with new constraints.
UPDATE public.bookings
   SET dispatch_status = CASE
     WHEN status IN ('accepted'::public.booking_status, 'completed'::public.booking_status)
       THEN 'assigned'::public.booking_dispatch_status
     WHEN status IN ('cancelled'::public.booking_status, 'declined'::public.booking_status)
       THEN 'cancelled'::public.booking_dispatch_status
     WHEN requested_provider_id IS NOT NULL
       THEN 'awaiting_provider'::public.booking_dispatch_status
     ELSE 'queued'::public.booking_dispatch_status
   END
 WHERE dispatch_status IS NULL;

-- Lock in NOT NULLs after backfill.
ALTER TABLE public.bookings
  ALTER COLUMN assignment_mode SET NOT NULL,
  ALTER COLUMN assignment_mode SET DEFAULT 'direct_provider'::public.booking_assignment_mode,
  ALTER COLUMN dispatch_status SET NOT NULL,
  ALTER COLUMN dispatch_status SET DEFAULT 'awaiting_provider'::public.booking_dispatch_status;

-- 4. Constraints on bookings --------------------------------------------------
-- direct_provider must have a requested provider unless still queued.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_direct_requires_requested_ck') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_direct_requires_requested_ck
      CHECK (
        assignment_mode <> 'direct_provider'
        OR requested_provider_id IS NOT NULL
        OR dispatch_status = 'queued'
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_max_provider_cost_nonneg_ck') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_max_provider_cost_nonneg_ck
      CHECK (max_provider_cost_minor IS NULL OR max_provider_cost_minor >= 0);
  END IF;
END $$;

-- 5. provider_offers ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_offers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_status        public.offer_status NOT NULL DEFAULT 'pending',
  offer_batch         smallint NOT NULL DEFAULT 1 CHECK (offer_batch >= 1),
  offered_at          timestamptz NOT NULL DEFAULT now(),
  viewed_at           timestamptz,
  accepted_at         timestamptz,
  declined_at         timestamptz,
  expired_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_offers_unique_per_booking UNIQUE (booking_id, provider_user_id)
);

-- Data API grants — writes only via SECURITY DEFINER RPCs / service_role.
REVOKE ALL ON public.provider_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_offers TO authenticated;
GRANT ALL    ON public.provider_offers TO service_role;

ALTER TABLE public.provider_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_offers FORCE ROW LEVEL SECURITY;

-- Providers may read only their own offers.
DROP POLICY IF EXISTS provider_offers_select_own ON public.provider_offers;
CREATE POLICY provider_offers_select_own
  ON public.provider_offers
  FOR SELECT
  TO authenticated
  USING (provider_user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policy => all direct writes denied.

-- 6. booking_slot_locks -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_slot_locks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_date      date NOT NULL,
  slot              text NOT NULL,
  hours             numeric NOT NULL CHECK (hours > 0),
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','released','cancelled')),
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  released_at       timestamptz
);

REVOKE ALL ON public.booking_slot_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_slot_locks TO authenticated;
GRANT ALL    ON public.booking_slot_locks TO service_role;

ALTER TABLE public.booking_slot_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_slot_locks FORCE ROW LEVEL SECURITY;

-- Provider sees own locks; customer sees locks on own bookings.
DROP POLICY IF EXISTS booking_slot_locks_select_provider ON public.booking_slot_locks;
CREATE POLICY booking_slot_locks_select_provider
  ON public.booking_slot_locks
  FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid());

DROP POLICY IF EXISTS booking_slot_locks_select_customer ON public.booking_slot_locks;
CREATE POLICY booking_slot_locks_select_customer
  ON public.booking_slot_locks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.id = booking_slot_locks.booking_id
       AND b.customer_user_id = auth.uid()
  ));
-- No write policy => direct writes denied.

-- One ACTIVE lock per (provider, date, slot).
CREATE UNIQUE INDEX IF NOT EXISTS booking_slot_locks_active_uniq
  ON public.booking_slot_locks (provider_user_id, booking_date, slot)
  WHERE status = 'active';

-- 7. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS provider_offers_inbox_idx
  ON public.provider_offers (provider_user_id, offer_status, offered_at DESC);

CREATE INDEX IF NOT EXISTS provider_offers_booking_idx
  ON public.provider_offers (booking_id);

CREATE INDEX IF NOT EXISTS provider_offers_expiry_idx
  ON public.provider_offers (offer_status, offered_at)
  WHERE offer_status IN ('pending','viewed');

CREATE INDEX IF NOT EXISTS bookings_dispatch_status_idx
  ON public.bookings (dispatch_status, dispatched_at)
  WHERE dispatch_status IN ('queued','awaiting_provider','dispatched');

CREATE INDEX IF NOT EXISTS bookings_assigned_provider_idx
  ON public.bookings (assigned_provider_id) WHERE assigned_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_requested_provider_idx
  ON public.bookings (requested_provider_id) WHERE requested_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_slot_locks_booking_idx
  ON public.booking_slot_locks (booking_id);

CREATE INDEX IF NOT EXISTS booking_slot_locks_provider_active_idx
  ON public.booking_slot_locks (provider_user_id, booking_date)
  WHERE status = 'active';

COMMENT ON COLUMN public.bookings.assignment_mode IS
  'Booking selection mode. direct_provider = customer chose a specific provider; quick_match = platform dispatches to eligible providers.';
COMMENT ON COLUMN public.bookings.requested_provider_id IS
  'Provider explicitly targeted by the customer (direct_provider) or null for quick_match.';
COMMENT ON COLUMN public.bookings.assigned_provider_id IS
  'Provider that has atomically claimed the booking. Null until a claim RPC succeeds.';
COMMENT ON COLUMN public.bookings.max_provider_cost_minor IS
  'Quick-match ceiling: providers whose payout would exceed this may not claim the offer.';
COMMENT ON TABLE  public.provider_offers IS
  'One row per provider that a booking is offered to. Writes only via service_role or approved SECURITY DEFINER RPCs.';
COMMENT ON TABLE  public.booking_slot_locks IS
  'Slot reservations backing atomic claim. Partial unique index enforces one active lock per (provider, date, slot).';

-- =============================================================================
-- 8. In-migration self-tests. Any RAISE EXCEPTION aborts the transaction.
-- =============================================================================
DO $$
DECLARE
  v_count int;
  v_expected text[];
  v_labels  text[];
BEGIN
  -- 8.1 Enum labels
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO v_labels
    FROM pg_enum WHERE enumtypid = 'public.booking_assignment_mode'::regtype;
  IF v_labels <> ARRAY['direct_provider','quick_match']::text[] THEN
    RAISE EXCEPTION 'self-test: booking_assignment_mode labels wrong: %', v_labels;
  END IF;

  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO v_labels
    FROM pg_enum WHERE enumtypid = 'public.offer_status'::regtype;
  v_expected := ARRAY['pending','viewed','accepted','declined','expired','superseded']::text[];
  IF v_labels <> v_expected THEN
    RAISE EXCEPTION 'self-test: offer_status labels wrong: %', v_labels;
  END IF;

  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO v_labels
    FROM pg_enum WHERE enumtypid = 'public.booking_dispatch_status'::regtype;
  v_expected := ARRAY['queued','awaiting_provider','dispatched','assigned','unfulfilled','cancelled']::text[];
  IF v_labels <> v_expected THEN
    RAISE EXCEPTION 'self-test: booking_dispatch_status labels wrong: %', v_labels;
  END IF;

  -- 8.2 Backfill completeness
  SELECT count(*) INTO v_count FROM public.bookings WHERE assignment_mode IS NULL;
  IF v_count <> 0 THEN RAISE EXCEPTION 'self-test: % bookings with null assignment_mode', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.bookings
    WHERE assignment_mode <> 'direct_provider';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'self-test: expected all backfilled rows to be direct_provider (got %)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.bookings
    WHERE provider_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND requested_provider_id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'self-test: % rows have castable provider_id but null requested_provider_id', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.bookings
    WHERE status IN ('accepted'::public.booking_status, 'completed'::public.booking_status)
      AND provider_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND assigned_provider_id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'self-test: % accepted/completed rows missing assigned_provider_id', v_count;
  END IF;

  -- 8.3 Legacy column preserved
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='bookings'
       AND column_name='provider_id' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'self-test: legacy bookings.provider_id missing or nullable';
  END IF;

  -- 8.4 Unique constraint on provider_offers
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='provider_offers_unique_per_booking' AND conrelid='public.provider_offers'::regclass
  ) THEN
    RAISE EXCEPTION 'self-test: provider_offers unique constraint missing';
  END IF;

  -- 8.5 Partial-unique slot lock index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='booking_slot_locks_active_uniq'
  ) THEN
    RAISE EXCEPTION 'self-test: booking_slot_locks_active_uniq index missing';
  END IF;

  -- 8.6 RLS enabled + no write policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.provider_offers'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'self-test: RLS not enabled on provider_offers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='provider_offers'
       AND cmd IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'self-test: unexpected write policy on provider_offers';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.booking_slot_locks'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'self-test: RLS not enabled on booking_slot_locks';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='booking_slot_locks'
       AND cmd IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'self-test: unexpected write policy on booking_slot_locks';
  END IF;

  -- 8.7 Slot-lock uniqueness works (runtime insert; rollback via savepoint)
  DECLARE
    v_booking uuid;
    v_provider uuid;
  BEGIN
    SELECT id, requested_provider_id INTO v_booking, v_provider
      FROM public.bookings WHERE requested_provider_id IS NOT NULL LIMIT 1;
    IF v_booking IS NOT NULL AND v_provider IS NOT NULL THEN
      BEGIN
        INSERT INTO public.booking_slot_locks(booking_id, provider_user_id, booking_date, slot, hours)
          VALUES (v_booking, v_provider, DATE '2099-01-01', '09:00', 1);
        BEGIN
          INSERT INTO public.booking_slot_locks(booking_id, provider_user_id, booking_date, slot, hours)
            VALUES (v_booking, v_provider, DATE '2099-01-01', '09:00', 1);
          RAISE EXCEPTION 'self-test: duplicate active slot lock unexpectedly allowed';
        EXCEPTION WHEN unique_violation THEN
          NULL; -- expected
        END;
        -- Clean up test rows
        DELETE FROM public.booking_slot_locks
          WHERE booking_id = v_booking AND booking_date = DATE '2099-01-01';
      END;

      -- 8.8 Duplicate provider offer rejected
      BEGIN
        INSERT INTO public.provider_offers(booking_id, provider_user_id)
          VALUES (v_booking, v_provider);
        BEGIN
          INSERT INTO public.provider_offers(booking_id, provider_user_id)
            VALUES (v_booking, v_provider);
          RAISE EXCEPTION 'self-test: duplicate provider_offer unexpectedly allowed';
        EXCEPTION WHEN unique_violation THEN
          NULL; -- expected
        END;
        DELETE FROM public.provider_offers WHERE booking_id = v_booking AND provider_user_id = v_provider;
      END;
    END IF;
  END;

  RAISE NOTICE 'PR-1 self-tests passed';
END $$;
