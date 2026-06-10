
-- Enums
CREATE TYPE public.address_place_type AS ENUM ('private','business','vacation','other');
CREATE TYPE public.address_access_method AS ENUM ('home','key_box','key_under_mat','doorman','code','other');

-- Table
CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Hjem',
  address text NOT NULL,
  address_place_id text,
  lat double precision,
  lng double precision,
  is_primary boolean NOT NULL DEFAULT false,
  place_type public.address_place_type NOT NULL DEFAULT 'private',
  size_sqm integer,
  rooms integer,
  floor text,
  has_pets boolean NOT NULL DEFAULT false,
  pet_details text,
  has_children boolean NOT NULL DEFAULT false,
  parking_info text,
  access_method public.address_access_method NOT NULL DEFAULT 'home',
  access_code text,
  access_instructions text,
  wifi_name text,
  wifi_password text,
  cleaning_supplies_available boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own addresses" ON public.customer_addresses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own addresses" ON public.customer_addresses
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own addresses" ON public.customer_addresses
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Only one primary per user
CREATE UNIQUE INDEX customer_addresses_one_primary
  ON public.customer_addresses (user_id) WHERE is_primary;

CREATE INDEX customer_addresses_user_idx
  ON public.customer_addresses (user_id, created_at DESC);

-- Auto-unset other primaries when one is set
CREATE OR REPLACE FUNCTION public.unset_other_primary_addresses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.customer_addresses
       SET is_primary = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_addresses_primary_trg
BEFORE INSERT OR UPDATE OF is_primary ON public.customer_addresses
FOR EACH ROW EXECUTE FUNCTION public.unset_other_primary_addresses();

CREATE TRIGGER customer_addresses_updated_at
BEFORE UPDATE ON public.customer_addresses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
