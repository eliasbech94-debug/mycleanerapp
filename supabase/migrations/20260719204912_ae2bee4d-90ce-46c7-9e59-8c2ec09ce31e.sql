
-- Helper functions ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_support_agent(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role::text IN ('support', 'admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_only(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role::text IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_support_agent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_only(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_support_agent(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_only(uuid) TO authenticated, service_role;

-- Support inbox RLS -----------------------------------------------------------
DROP POLICY IF EXISTS "Admins and employees can view all support threads" ON public.support_threads;
DROP POLICY IF EXISTS "Admins and employees can update all support threads" ON public.support_threads;
DROP POLICY IF EXISTS "Admins and employees can view all support messages" ON public.support_messages;
DROP POLICY IF EXISTS "Admins and employees can insert support messages" ON public.support_messages;

CREATE POLICY "Support agents view all threads"
  ON public.support_threads FOR SELECT
  USING (public.is_support_agent(auth.uid()));
CREATE POLICY "Support agents update all threads"
  ON public.support_threads FOR UPDATE
  USING (public.is_support_agent(auth.uid()))
  WITH CHECK (public.is_support_agent(auth.uid()));

CREATE POLICY "Support agents view all messages"
  ON public.support_messages FOR SELECT
  USING (public.is_support_agent(auth.uid()));
CREATE POLICY "Support agents insert messages"
  ON public.support_messages FOR INSERT
  WITH CHECK (public.is_support_agent(auth.uid()));

-- Support-safe user lookup ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_search_users(_q text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE(
  id uuid,
  full_name text,
  phone text,
  country_code text,
  deactivated_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.phone, p.country_code, p.deactivated_at, p.created_at
  FROM public.profiles p
  WHERE public.is_support_agent(auth.uid())
    AND (_q IS NULL OR _q = ''
         OR p.full_name ILIKE '%' || _q || '%'
         OR p.phone ILIKE '%' || _q || '%')
  ORDER BY p.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 200);
$$;
REVOKE ALL ON FUNCTION public.support_search_users(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_search_users(text, int) TO authenticated;

-- Protect last super_admin ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_last_super_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining int;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role::text = 'super_admin')
     OR (TG_OP = 'UPDATE' AND OLD.role::text = 'super_admin'
         AND NEW.role::text <> 'super_admin') THEN
    SELECT count(*) INTO remaining
      FROM public.user_roles
     WHERE role::text = 'super_admin'
       AND user_id <> OLD.user_id;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_super_admin'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS user_roles_protect_last_super_admin ON public.user_roles;
CREATE TRIGGER user_roles_protect_last_super_admin
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_super_admin();
