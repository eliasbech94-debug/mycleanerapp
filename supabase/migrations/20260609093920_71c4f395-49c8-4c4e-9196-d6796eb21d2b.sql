
-- Allow a user to claim a mock provider id
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_id text UNIQUE;

-- Booking status enum
DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('pending','accepted','declined','cancelled','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bookings
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  provider_name text NOT NULL,
  service text NOT NULL,
  hours numeric NOT NULL,
  booking_date date NOT NULL,
  slot text NOT NULL,
  address text NOT NULL,
  address_place_id text,
  lat double precision,
  lng double precision,
  notes text,
  customer_pays integer NOT NULL,
  provider_gets integer NOT NULL,
  currency text NOT NULL DEFAULT 'DKK',
  status public.booking_status NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Helper: does current user own this provider_id (via profiles)
CREATE OR REPLACE FUNCTION public.user_owns_provider(_provider_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND provider_id = _provider_id
  );
$$;

-- Customers
CREATE POLICY "Customers insert own bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_user_id);

CREATE POLICY "Customers select own bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (auth.uid() = customer_user_id);

CREATE POLICY "Customers can cancel own pending" ON public.bookings
  FOR UPDATE TO authenticated
  USING (auth.uid() = customer_user_id)
  WITH CHECK (auth.uid() = customer_user_id);

-- Providers (matched via provider_id on their profile)
CREATE POLICY "Providers select own bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.user_owns_provider(provider_id));

CREATE POLICY "Providers update own bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.user_owns_provider(provider_id))
  WITH CHECK (public.user_owns_provider(provider_id));

-- updated_at trigger
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
