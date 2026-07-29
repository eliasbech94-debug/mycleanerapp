CREATE OR REPLACE FUNCTION public.calc_provider_completion(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pp public.provider_profiles;
  pr public.profiles;
  items jsonb := '[]'::jsonb;
  done_count int := 0;
  total_count int := 0;
  b boolean;
BEGIN
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('pct', 0, 'items', '[]'::jsonb, 'error','provider_profile_missing');
  END IF;
  SELECT * INTO pr FROM public.profiles WHERE id = _uid;

  b := pp.display_name IS NOT NULL AND length(btrim(pp.display_name)) > 0;
  items := items || jsonb_build_object('key','display_name','label','Visningsnavn','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.headline IS NOT NULL AND length(btrim(pp.headline)) > 0;
  items := items || jsonb_build_object('key','headline','label','Overskrift','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.bio IS NOT NULL AND length(btrim(pp.bio)) >= 40;
  items := items || jsonb_build_object('key','bio','label','Bio (min 40 tegn)','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.photo_path IS NOT NULL;
  items := items || jsonb_build_object('key','photo','label','Profilbillede','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := array_length(pp.languages,1) IS NOT NULL;
  items := items || jsonb_build_object('key','languages','label','Sprog','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := array_length(pp.service_categories,1) IS NOT NULL;
  items := items || jsonb_build_object('key','services','label','Servicekategorier','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := EXISTS (
    SELECT 1 FROM public.provider_service_prices psp
    WHERE psp.user_id = _uid AND psp.active AND psp.amount_minor > 0
  );
  items := items || jsonb_build_object('key','rate','label','Mindst én aktiv servicepris','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.service_area_radius_km IS NOT NULL AND pp.service_area_radius_km > 0;
  items := items || jsonb_build_object('key','service_area','label','Serviceomraade','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.base_address_place_id IS NOT NULL AND pp.base_country_code IS NOT NULL;
  items := items || jsonb_build_object('key','base_address','label','Baseadresse','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.date_of_birth IS NOT NULL;
  items := items || jsonb_build_object('key','dob','label','Foedselsdato','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.terms_accepted_at IS NOT NULL;
  items := items || jsonb_build_object('key','terms','label','Vilkaar accepteret','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pr.sms_verified_at IS NOT NULL;
  items := items || jsonb_build_object('key','phone','label','Telefon verificeret','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.identity_status = 'approved';
  items := items || jsonb_build_object('key','identity','label','Identitet godkendt','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  b := pp.stripe_charges_enabled AND pp.stripe_payouts_enabled AND pp.stripe_details_submitted;
  items := items || jsonb_build_object('key','stripe','label','Stripe klar','required',true,'done',b);
  total_count := total_count+1; done_count := done_count + b::int;

  RETURN jsonb_build_object(
    'pct', CASE WHEN total_count=0 THEN 0 ELSE round((done_count::numeric*100)/total_count) END,
    'done', done_count, 'total', total_count,
    'items', items
  );
END $$;
REVOKE ALL ON FUNCTION public.calc_provider_completion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_provider_completion(uuid) TO authenticated, service_role;

