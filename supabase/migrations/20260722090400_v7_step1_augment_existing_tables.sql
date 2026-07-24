-- =============================================================================
-- Funds Release v7 — Step 1 (M-05) — Augment pre-existing tables
-- Adds v7 columns on bookings, stripe_disputes, and provider_profiles.
-- All ADD COLUMN IF NOT EXISTS — idempotent, non-destructive.
-- No self-test rows written.
-- =============================================================================
BEGIN;

-- booking_payout_status enum (pre-existing on bookings if the earlier commit
-- landed; created here defensively for a clean staging database).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='booking_payout_status') THEN
    CREATE TYPE public.booking_payout_status AS ENUM
      ('pending','eligible','attempting','retry_pending','transferred',
       'partially_reversed','fully_reversed','settled_no_transfer',
       'needs_review','frozen','disputed');
  END IF;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_flow_version       public.booking_payment_flow_version,
  ADD COLUMN IF NOT EXISTS provider_stripe_account_id text,
  ADD COLUMN IF NOT EXISTS funds_release_at           timestamptz,
  ADD COLUMN IF NOT EXISTS payout_status              public.booking_payout_status DEFAULT 'pending';

ALTER TABLE public.stripe_disputes
  ADD COLUMN IF NOT EXISTS booking_id           uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS funds_withdrawn_at   timestamptz,
  ADD COLUMN IF NOT EXISTS funds_reinstated_at  timestamptz;

ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS payout_frozen            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_frozen_reason     text,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled   boolean,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled   boolean,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean,
  ADD COLUMN IF NOT EXISTS stripe_disabled_reason   text,
  ADD COLUMN IF NOT EXISTS stripe_requirements_due  text[];

COMMIT;
