-- 1. Remove direct write grants from client roles (fail-closed)
REVOKE ALL ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 2. Deny-by-default RLS: drop client write policies
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- Read policies remain: own roles + admin read-all (restricted to authenticated)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Defense in depth: hard block privileged role writes from non-service sessions
CREATE OR REPLACE FUNCTION public.guard_privileged_role_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target public.app_role := COALESCE(NEW.role, OLD.role);
  privileged boolean := target IN ('support','employee','admin','super_admin');
BEGIN
  -- Trusted writers only: service_role (edge functions) and superuser/owner (migrations)
  IF privileged
     AND current_user NOT IN ('service_role','postgres','supabase_admin')
     AND NOT pg_catalog.pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    RAISE EXCEPTION 'privileged_role_write_denied'
      USING ERRCODE = '42501';
  END IF;

  -- No session may ever mutate its own privileged role
  IF privileged AND auth.uid() IS NOT NULL
     AND COALESCE(NEW.user_id, OLD.user_id) = auth.uid()
     AND current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'self_privileged_role_change_denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_roles_guard_privileged ON public.user_roles;
CREATE TRIGGER user_roles_guard_privileged
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_role_writes();

-- 4. Signup trigger: hardcoded whitelist default, never reads role from client metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  -- SECURITY: role is NEVER derived from raw_user_meta_data / app_metadata.
  -- Only 'customer' may be self-provisioned at signup. Provider role is granted
  -- server-side after application submission; staff roles only via admin-user-role.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;