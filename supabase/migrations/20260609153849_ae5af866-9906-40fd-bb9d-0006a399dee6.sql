
-- Stripe Connect fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false;

-- Payment fields on bookings
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('none','authorized','captured','canceled','failed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS authorization_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_fee_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_stripe_account_id text;

CREATE INDEX IF NOT EXISTS bookings_payment_intent_idx ON public.bookings(payment_intent_id);
CREATE INDEX IF NOT EXISTS bookings_expires_idx ON public.bookings(authorization_expires_at)
  WHERE payment_status = 'authorized';
