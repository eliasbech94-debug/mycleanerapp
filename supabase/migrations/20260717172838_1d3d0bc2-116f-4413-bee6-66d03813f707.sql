
-- Extend support_threads to allow booking-scoped threads
ALTER TABLE public.support_threads DROP CONSTRAINT IF EXISTS support_threads_topic_check;
ALTER TABLE public.support_threads ADD CONSTRAINT support_threads_topic_check
  CHECK (topic = ANY (ARRAY['support'::text, 'complaint'::text, 'booking'::text]));
ALTER TABLE public.support_threads ADD COLUMN IF NOT EXISTS related_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- Cleaning plans
CREATE TABLE public.cleaning_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('booking','property')),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  address_id uuid REFERENCES public.customer_addresses(id) ON DELETE CASCADE,
  rooms jsonb NOT NULL DEFAULT '[]'::jsonb,
  focus_areas text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'booking' AND booking_id IS NOT NULL) OR (scope = 'property' AND address_id IS NOT NULL))
);

CREATE INDEX cleaning_plans_user_idx ON public.cleaning_plans(user_id, updated_at DESC);
CREATE INDEX cleaning_plans_booking_idx ON public.cleaning_plans(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX cleaning_plans_address_idx ON public.cleaning_plans(address_id) WHERE address_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_plans TO authenticated;
GRANT ALL ON public.cleaning_plans TO service_role;

ALTER TABLE public.cleaning_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own plans" ON public.cleaning_plans
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER cleaning_plans_updated_at BEFORE UPDATE ON public.cleaning_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
