ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS base_postal_code text,
  ADD COLUMN IF NOT EXISTS base_city text;

ALTER TABLE public.provider_profiles
  DROP CONSTRAINT IF EXISTS provider_profiles_postal_city_pair_check;

ALTER TABLE public.provider_profiles
  ADD CONSTRAINT provider_profiles_postal_city_pair_check
  CHECK (
    (base_postal_code IS NULL AND base_city IS NULL)
    OR
    (length(trim(base_postal_code)) >= 3 AND length(trim(base_city)) >= 1)
  );

ALTER TABLE public.place_validations DROP CONSTRAINT IF EXISTS place_validations_source_chk;
ALTER TABLE public.place_validations
  ADD CONSTRAINT place_validations_source_chk CHECK (source IN ('google','dawa','postal'));

GRANT UPDATE (base_postal_code, base_city) ON public.provider_profiles TO authenticated;
