
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.provider_tax_profiles
  ADD COLUMN IF NOT EXISTS vat_number_enc         bytea,
  ADD COLUMN IF NOT EXISTS business_name_enc      bytea,
  ADD COLUMN IF NOT EXISTS business_address_enc   bytea,
  ADD COLUMN IF NOT EXISTS tax_id_enc             bytea,
  ADD COLUMN IF NOT EXISTS vat_number_last4       text,
  ADD COLUMN IF NOT EXISTS tax_id_last4           text,
  ADD COLUMN IF NOT EXISTS encryption_version     smallint NOT NULL DEFAULT 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_id_enc         bytea,
  ADD COLUMN IF NOT EXISTS tax_id_last4       text,
  ADD COLUMN IF NOT EXISTS encryption_version smallint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.tax_encrypt(_plaintext text, _key text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN _plaintext IS NULL OR length(_plaintext) = 0 THEN NULL
    ELSE extensions.pgp_sym_encrypt(_plaintext, _key, 'cipher-algo=aes256, s2k-mode=3, s2k-count=65011712')
  END;
$$;

CREATE OR REPLACE FUNCTION public.tax_decrypt(_ciphertext bytea, _key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN _ciphertext IS NULL THEN NULL
    ELSE extensions.pgp_sym_decrypt(_ciphertext, _key)
  END;
$$;

REVOKE ALL ON FUNCTION public.tax_encrypt(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tax_decrypt(bytea, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tax_encrypt(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tax_decrypt(bytea, text) TO service_role;

REVOKE SELECT (vat_number, business_name, business_address, tax_id,
               vat_number_enc, business_name_enc, business_address_enc, tax_id_enc)
  ON public.provider_tax_profiles FROM authenticated;
REVOKE UPDATE (vat_number, business_name, business_address, tax_id,
               vat_number_enc, business_name_enc, business_address_enc, tax_id_enc)
  ON public.provider_tax_profiles FROM authenticated;
REVOKE INSERT (vat_number, business_name, business_address, tax_id,
               vat_number_enc, business_name_enc, business_address_enc, tax_id_enc)
  ON public.provider_tax_profiles FROM authenticated;

REVOKE SELECT (tax_id_encrypted, tax_id_enc) ON public.profiles FROM authenticated;
REVOKE UPDATE (tax_id_encrypted, tax_id_enc) ON public.profiles FROM authenticated;
REVOKE INSERT (tax_id_encrypted, tax_id_enc) ON public.profiles FROM authenticated;

GRANT SELECT, INSERT, UPDATE
  (id, provider_user_id, country_code, provider_type, vat_registered,
   vat_number_last4, tax_id_last4, encryption_version, created_at, updated_at)
  ON public.provider_tax_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_plaintext_tax_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'provider_tax_profiles' THEN
    IF NEW.vat_number IS NOT NULL OR NEW.business_name IS NOT NULL
       OR NEW.business_address IS NOT NULL OR NEW.tax_id IS NOT NULL THEN
      RAISE EXCEPTION 'plaintext_tax_write_forbidden: use provider-tax-profile edge function';
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.tax_id_encrypted IS NOT NULL THEN
      RAISE EXCEPTION 'plaintext_tax_write_forbidden: use profile-tax-id edge function';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_plaintext_tax_ptp ON public.provider_tax_profiles;
CREATE TRIGGER trg_reject_plaintext_tax_ptp
  BEFORE INSERT OR UPDATE ON public.provider_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_tax_write();

DROP TRIGGER IF EXISTS trg_reject_plaintext_tax_profiles ON public.profiles;
CREATE TRIGGER trg_reject_plaintext_tax_profiles
  BEFORE INSERT OR UPDATE OF tax_id_encrypted ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_tax_write();
