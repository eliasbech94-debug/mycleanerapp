
-- 1) Update handle_new_user to also grant 'customer' role idempotently
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 2) Backfill: assign 'customer' to existing profile users who have no privileged role
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'customer'::public.app_role
  FROM public.profiles p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role IN ('provider','employee','admin','super_admin')
 )
   AND NOT EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'customer'
 )
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) customer_preferences (persist CustomerRegister onboarding fields)
CREATE TABLE IF NOT EXISTS public.customer_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  property_type TEXT,
  property_size_sqm INT,
  floors TEXT,
  has_garden BOOLEAN NOT NULL DEFAULT false,
  has_pets BOOLEAN NOT NULL DEFAULT false,
  preferred_days TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  preferred_time TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_preferences TO authenticated;
GRANT ALL ON public.customer_preferences TO service_role;

ALTER TABLE public.customer_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own prefs select" ON public.customer_preferences;
DROP POLICY IF EXISTS "own prefs insert" ON public.customer_preferences;
DROP POLICY IF EXISTS "own prefs update" ON public.customer_preferences;
DROP POLICY IF EXISTS "own prefs delete" ON public.customer_preferences;

CREATE POLICY "own prefs select" ON public.customer_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.customer_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.customer_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs delete" ON public.customer_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_customer_preferences_updated_at ON public.customer_preferences;
CREATE TRIGGER trg_customer_preferences_updated_at
  BEFORE UPDATE ON public.customer_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
