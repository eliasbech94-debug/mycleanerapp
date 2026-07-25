
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='provider_profiles'
      AND column_name='provider_slug' AND data_type='text'
  ) THEN
    ALTER TABLE public.provider_profiles
      ALTER COLUMN provider_slug TYPE citext USING provider_slug::citext;
  END IF;
END$$;

-- 1. Reservations
CREATE TABLE IF NOT EXISTS public.provider_slug_reservations (
  slug        citext PRIMARY KEY,
  reason      text NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_slug_reservations TO authenticated;
GRANT ALL    ON public.provider_slug_reservations TO service_role;
ALTER TABLE public.provider_slug_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slug_reservations_read" ON public.provider_slug_reservations;
CREATE POLICY "slug_reservations_read" ON public.provider_slug_reservations
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.provider_slug_reservations (slug, reason) VALUES
  ('admin','system'),('api','system'),('app','system'),('auth','system'),
  ('auth-callback','system'),('oauth','system'),('callback','system'),
  ('book','system'),('booking','system'),('bookings','system'),
  ('c','system'),('p','system'),
  ('dashboard','system'),('marketplace','system'),('find-cleaner','system'),
  ('profile','system'),('provider','system'),('providers','system'),
  ('register','system'),('login','system'),('logout','system'),
  ('signup','system'),('reset','system'),('reset-password','system'),
  ('support','system'),('terms','legal'),('privacy','legal'),('legal','legal'),
  ('about','marketing'),('contact','marketing'),('blog','marketing'),
  ('trust','marketing'),('docs','marketing'),('status','marketing'),
  ('faq','marketing'),('pricing','marketing'),('home','system'),
  ('index','system'),('root','system'),('static','system'),
  ('my','system'),('mycleaner','brand'),('www','system'),
  ('assets','system'),('public','system'),('null','system'),
  ('undefined','system'),('true','system'),('false','system'),
  ('cleaning','category'),('handyman','category'),('garden','category'),
  ('moving','category'),('help','marketing'),('press','marketing'),
  ('careers','marketing'),('jobs','marketing'),('security','marketing'),
  ('gdpr','legal'),('cookies','legal'),('imprint','legal')
ON CONFLICT (slug) DO NOTHING;

-- 2. History (keyed on provider user_id)
CREATE TABLE IF NOT EXISTS public.provider_slug_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_slug        citext NOT NULL UNIQUE,
  new_slug        citext NOT NULL,
  provider_user_id uuid NOT NULL REFERENCES public.provider_profiles(user_id) ON DELETE CASCADE,
  changed_by      uuid REFERENCES auth.users(id),
  reason          text NOT NULL DEFAULT 'rename',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_slug_history_user_idx
  ON public.provider_slug_history(provider_user_id, created_at DESC);
GRANT SELECT ON public.provider_slug_history TO anon, authenticated;
GRANT ALL    ON public.provider_slug_history TO service_role;
ALTER TABLE public.provider_slug_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slug_history_read" ON public.provider_slug_history;
CREATE POLICY "slug_history_read" ON public.provider_slug_history
  FOR SELECT TO anon, authenticated USING (true);

-- 3. Format validator
CREATE OR REPLACE FUNCTION public.validate_provider_slug_format(_slug citext)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE s text := lower(_slug::text);
BEGIN
  IF s IS NULL OR length(s) < 2 OR length(s) > 40 THEN RETURN 'length'; END IF;
  IF s !~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$' THEN RETURN 'format'; END IF;
  IF s LIKE '%--%' THEN RETURN 'format'; END IF;
  RETURN 'ok';
END$$;
REVOKE ALL ON FUNCTION public.validate_provider_slug_format(citext) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_provider_slug_format(citext) TO anon, authenticated, service_role;

-- Enforce format on write
CREATE OR REPLACE FUNCTION public.provider_profiles_validate_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF NEW.provider_slug IS NULL THEN RETURN NEW; END IF;
  NEW.provider_slug := lower(NEW.provider_slug::text)::citext;
  v := public.validate_provider_slug_format(NEW.provider_slug);
  IF v <> 'ok' THEN RAISE EXCEPTION 'invalid_slug_%', v USING ERRCODE='22023'; END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_provider_profiles_validate_slug ON public.provider_profiles;
CREATE TRIGGER trg_provider_profiles_validate_slug
  BEFORE INSERT OR UPDATE OF provider_slug ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.provider_profiles_validate_slug();

-- 4. History trigger
CREATE OR REPLACE FUNCTION public.provider_profiles_record_slug_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.provider_slug IS DISTINCT FROM OLD.provider_slug AND OLD.provider_slug IS NOT NULL THEN
    DELETE FROM public.provider_slug_history WHERE old_slug = NEW.provider_slug;
    INSERT INTO public.provider_slug_history (old_slug, new_slug, provider_user_id, changed_by, reason)
    VALUES (OLD.provider_slug, NEW.provider_slug, NEW.user_id, auth.uid(), 'rename')
    ON CONFLICT (old_slug) DO UPDATE
      SET new_slug = EXCLUDED.new_slug,
          provider_user_id = EXCLUDED.provider_user_id,
          changed_by = EXCLUDED.changed_by,
          created_at = now();
  END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_provider_profiles_slug_history ON public.provider_profiles;
CREATE TRIGGER trg_provider_profiles_slug_history
  AFTER UPDATE OF provider_slug ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.provider_profiles_record_slug_history();

-- 5. check_slug_availability_v1
CREATE OR REPLACE FUNCTION public.check_slug_availability_v1(_slug citext)
RETURNS TABLE(available boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s citext := lower(_slug::text)::citext;
  v text; uid uuid := auth.uid(); my_uid uuid; taken uuid; hist uuid;
BEGIN
  IF uid IS NULL THEN RETURN QUERY SELECT false, 'unauthorized'; RETURN; END IF;
  v := public.validate_provider_slug_format(s);
  IF v <> 'ok' THEN RETURN QUERY SELECT false, v; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.provider_slug_reservations WHERE slug = s) THEN
    RETURN QUERY SELECT false, 'reserved'; RETURN;
  END IF;
  SELECT user_id INTO my_uid FROM public.provider_profiles WHERE user_id = uid;
  SELECT user_id INTO taken FROM public.provider_profiles WHERE provider_slug = s;
  IF taken IS NOT NULL THEN
    IF taken = my_uid THEN RETURN QUERY SELECT true, 'current'; RETURN; END IF;
    RETURN QUERY SELECT false, 'taken'; RETURN;
  END IF;
  SELECT provider_user_id INTO hist FROM public.provider_slug_history WHERE old_slug = s;
  IF hist IS NOT NULL AND hist <> COALESCE(my_uid, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RETURN QUERY SELECT false, 'history_conflict'; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'ok';
END$$;
REVOKE ALL ON FUNCTION public.check_slug_availability_v1(citext) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_slug_availability_v1(citext) TO authenticated, service_role;

-- 6. rename_provider_slug_v1 (1/90 days)
CREATE OR REPLACE FUNCTION public.rename_provider_slug_v1(_new_slug citext)
RETURNS TABLE(old_slug citext, new_slug citext, next_change_allowed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s citext := lower(_new_slug::text)::citext;
  uid uuid := auth.uid();
  pp public.provider_profiles%ROWTYPE;
  last_change timestamptz;
  avail RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(uid, 'provider') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = uid FOR UPDATE;
  IF pp.user_id IS NULL THEN RAISE EXCEPTION 'no_provider_profile' USING ERRCODE='P0002'; END IF;
  IF pp.provider_slug = s THEN
    RETURN QUERY SELECT pp.provider_slug, pp.provider_slug, now(); RETURN;
  END IF;
  SELECT max(created_at) INTO last_change FROM public.provider_slug_history
    WHERE provider_user_id = pp.user_id AND reason = 'rename';
  IF last_change IS NOT NULL AND last_change > now() - interval '90 days' THEN
    RAISE EXCEPTION 'rename_rate_limited: next allowed at %',
      (last_change + interval '90 days') USING ERRCODE='P0001';
  END IF;
  SELECT * INTO avail FROM public.check_slug_availability_v1(s);
  IF NOT avail.available THEN
    RAISE EXCEPTION 'slug_unavailable_%', avail.reason USING ERRCODE='23505';
  END IF;
  UPDATE public.provider_profiles SET provider_slug = s WHERE user_id = pp.user_id;
  RETURN QUERY SELECT pp.provider_slug, s, (now() + interval '90 days');
END$$;
REVOKE ALL ON FUNCTION public.rename_provider_slug_v1(citext) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_provider_slug_v1(citext) TO authenticated, service_role;

-- 7. resolve_slug_v1 (public)
CREATE OR REPLACE FUNCTION public.resolve_slug_v1(_slug citext)
RETURNS TABLE(status text, slug citext)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s citext := lower(_slug::text)::citext; active_slug citext; redir citext;
BEGIN
  SELECT provider_slug INTO active_slug FROM public.provider_profiles
   WHERE provider_slug = s AND is_public = true;
  IF active_slug IS NOT NULL THEN RETURN QUERY SELECT 'active'::text, active_slug; RETURN; END IF;
  SELECT new_slug INTO redir FROM public.provider_slug_history WHERE old_slug = s;
  IF redir IS NOT NULL THEN RETURN QUERY SELECT 'redirect'::text, redir; RETURN; END IF;
  RETURN QUERY SELECT 'not_found'::text, NULL::citext;
END$$;
REVOKE ALL ON FUNCTION public.resolve_slug_v1(citext) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_slug_v1(citext) TO anon, authenticated, service_role;

-- 8. Admin reserve / release
CREATE OR REPLACE FUNCTION public.admin_reserve_slug_v1(_slug citext, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.provider_slug_reservations (slug, reason, created_by)
  VALUES (lower(_slug::text)::citext, coalesce(_reason,'manual'), auth.uid())
  ON CONFLICT (slug) DO UPDATE SET reason = EXCLUDED.reason;
END$$;

CREATE OR REPLACE FUNCTION public.admin_release_slug_v1(_slug citext)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.provider_slug_reservations WHERE slug = lower(_slug::text)::citext;
END$$;
REVOKE ALL ON FUNCTION public.admin_reserve_slug_v1(citext, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_release_slug_v1(citext) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reserve_slug_v1(citext, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_release_slug_v1(citext) TO authenticated, service_role;
