
-- 1) Public marketplace view (safe fields only, obfuscated coords)
CREATE OR REPLACE VIEW public.public_provider_marketplace
WITH (security_invoker = true) AS
SELECT
  pp.user_id,
  pp.display_name,
  pp.headline,
  pp.bio,
  pp.photo_path,
  pp.languages,
  pp.years_experience,
  pp.hourly_rate,
  pp.service_categories,
  pp.service_area_radius_km,
  pp.base_country_code,
  round(pp.base_lat::numeric, 2)::float AS approx_lat,
  round(pp.base_lng::numeric, 2)::float AS approx_lng,
  pp.provider_score,
  pp.provider_tier,
  pp.tier_calculated_at
FROM public.provider_profiles pp
WHERE public.provider_is_marketplace_visible(pp.user_id);

GRANT SELECT ON public.public_provider_marketplace TO anon, authenticated;

-- 2) Trigger: sync person_identities.status -> provider_profiles.identity_status
CREATE OR REPLACE FUNCTION public._sync_identity_to_provider()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  linked_uid uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM public._pp_as_service();
  FOR linked_uid IN
    SELECT user_id FROM public.identity_account_links WHERE identity_id = NEW.id
  LOOP
    UPDATE public.provider_profiles
       SET identity_status = NEW.status::text, updated_at = now()
     WHERE user_id = linked_uid;
    PERFORM public.reconcile_provider_status(linked_uid);
    PERFORM public.calc_provider_completion(linked_uid);
    PERFORM public.refresh_provider_score_tier(linked_uid, 'identity_status_changed');
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_identity_to_provider ON public.person_identities;
CREATE TRIGGER trg_sync_identity_to_provider
AFTER UPDATE OF status ON public.person_identities
FOR EACH ROW EXECUTE FUNCTION public._sync_identity_to_provider();

-- 3) Storage policies for provider-documents (private)
--    Path convention: <user_id>/<filename>
DROP POLICY IF EXISTS "provider docs: owner read" ON storage.objects;
DROP POLICY IF EXISTS "provider docs: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "provider docs: owner delete" ON storage.objects;
DROP POLICY IF EXISTS "provider docs: admin read" ON storage.objects;

CREATE POLICY "provider docs: owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "provider docs: owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'provider-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "provider docs: owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "provider docs: admin read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND public.is_admin_only(auth.uid())
);
