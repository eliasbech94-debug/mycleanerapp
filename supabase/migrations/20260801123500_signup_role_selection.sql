-- Assign the selected public signup role. Only customer/provider are accepted.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  selected_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  selected_role := CASE NEW.raw_user_meta_data->>'signup_role'
    WHEN 'provider' THEN 'provider'::public.app_role
    ELSE 'customer'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, selected_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- OAuth cannot reliably attach custom signup metadata before the first callback.
-- This RPC allows a newly-created authenticated account to claim only one of
-- the two public signup roles during the first ten minutes after creation.
CREATE OR REPLACE FUNCTION public.claim_signup_role(requested_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  uid uuid := auth.uid();
  created_at_value timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF requested_role NOT IN ('customer', 'provider') THEN
    RAISE EXCEPTION 'Invalid signup role';
  END IF;

  SELECT created_at INTO created_at_value
  FROM auth.users
  WHERE id = uid;

  IF created_at_value IS NULL OR created_at_value < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'Signup role claim window expired';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid
      AND role IN ('employee', 'admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Role cannot be changed';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = uid
    AND role IN ('customer', 'provider');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, requested_role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_signup_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_signup_role(text) TO authenticated;
