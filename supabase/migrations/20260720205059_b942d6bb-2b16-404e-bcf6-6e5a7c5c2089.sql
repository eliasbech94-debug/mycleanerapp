
CREATE OR REPLACE FUNCTION public.toggle_favorite_by_slug_v1(_slug text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  pid uuid;
  existed boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT user_id INTO pid FROM public.provider_profiles
    WHERE provider_slug = _slug
      AND is_public = true
      AND status = 'active'
      AND visibility = 'public';
  IF pid IS NULL THEN RAISE EXCEPTION 'provider_not_found'; END IF;
  DELETE FROM public.customer_favorites
    WHERE customer_id = uid AND provider_id = pid
    RETURNING true INTO existed;
  IF existed THEN RETURN false; END IF;
  INSERT INTO public.customer_favorites(customer_id, provider_id)
    VALUES (uid, pid) ON CONFLICT DO NOTHING;
  RETURN true;
END;$$;

REVOKE ALL ON FUNCTION public.toggle_favorite_by_slug_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_favorite_by_slug_v1(text) TO authenticated, service_role;
