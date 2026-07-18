
-- =========================================================
-- Task 8 · Phase 1 — Multi-country foundation
-- =========================================================

-- 1. country_configs (server-side authoritative)
CREATE TABLE public.country_configs (
  iso TEXT PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT false,
  launch_status TEXT NOT NULL DEFAULT 'development'
    CHECK (launch_status IN ('development','beta','launch_ready','active')),
  default_language TEXT NOT NULL,
  supported_languages TEXT[] NOT NULL DEFAULT '{}',
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  commission_bps INTEGER NOT NULL DEFAULT 2800 CHECK (commission_bps BETWEEN 0 AND 10000),
  vat_rate_bps INTEGER NOT NULL DEFAULT 2500 CHECK (vat_rate_bps BETWEEN 0 AND 10000),
  stripe_account_id TEXT,
  config_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  published_by UUID,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT country_configs_iso_upper CHECK (iso = upper(iso) AND length(iso) = 2),
  CONSTRAINT country_configs_currency_upper CHECK (currency = upper(currency) AND length(currency) = 3),
  CONSTRAINT country_configs_default_lang_in_supported CHECK (default_language = ANY(supported_languages))
);

GRANT SELECT ON public.country_configs TO authenticated;
GRANT ALL ON public.country_configs TO service_role;

ALTER TABLE public.country_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read published"
  ON public.country_configs FOR SELECT TO authenticated
  USING (status = 'published' AND active = true);

CREATE POLICY "admin full access"
  ON public.country_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER country_configs_touch
  BEFORE UPDATE ON public.country_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Public restricted VIEW — allowlisted fields only (safe for anon)
CREATE VIEW public.country_configs_public AS
SELECT
  iso,
  active,
  launch_status,
  default_language,
  supported_languages,
  currency,
  timezone,
  -- pull only public-safe sub-objects out of the JSONB blob
  COALESCE(config -> 'booking_public', '{}'::jsonb) AS booking_public,
  COALESCE(config -> 'payment_methods_public', '[]'::jsonb) AS payment_methods_public,
  COALESCE(config -> 'contact_public', '{}'::jsonb) AS contact_public,
  COALESCE(config -> 'feature_availability_public', '{}'::jsonb) AS feature_availability_public,
  COALESCE(config -> 'legal_references_public', '[]'::jsonb) AS legal_references_public
FROM public.country_configs
WHERE status = 'published' AND active = true;

GRANT SELECT ON public.country_configs_public TO anon, authenticated;

-- 3. legal_documents (immutable body after publish)
CREATE TABLE public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('terms','privacy','provider_agreement','cookie_policy')),
  country_code TEXT NOT NULL,
  language TEXT NOT NULL,
  version TEXT NOT NULL,
  body_md TEXT NOT NULL,
  body_hash TEXT NOT NULL, -- sha256 hex of body_md, immutable after publish
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','published','superseded','archived')),
  effective_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT legal_docs_country_upper CHECK (country_code = upper(country_code) AND length(country_code) = 2),
  CONSTRAINT legal_docs_language_valid CHECK (language ~ '^[a-z]{2}$'),
  UNIQUE (kind, country_code, language, version)
);

GRANT SELECT ON public.legal_documents TO anon, authenticated;
GRANT ALL ON public.legal_documents TO service_role;

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read published effective"
  ON public.legal_documents FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND effective_at IS NOT NULL
    AND effective_at <= now()
  );

CREATE POLICY "admin manage legal docs"
  ON public.legal_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Immutability trigger: once published, body/kind/country/language/version cannot change
CREATE OR REPLACE FUNCTION public.legal_documents_enforce_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','superseded') THEN
      RAISE EXCEPTION 'legal_documents: published/superseded rows are immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('published','superseded') THEN
    IF NEW.body_md IS DISTINCT FROM OLD.body_md
       OR NEW.body_hash IS DISTINCT FROM OLD.body_hash
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.country_code IS DISTINCT FROM OLD.country_code
       OR NEW.language IS DISTINCT FROM OLD.language
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'legal_documents: cannot mutate published document; create new version';
    END IF;
    -- allow status transition to superseded/archived only
    IF NEW.status NOT IN ('published','superseded','archived') THEN
      RAISE EXCEPTION 'legal_documents: invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER legal_documents_immutable
  BEFORE UPDATE OR DELETE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.legal_documents_enforce_immutable();

-- 4. user_legal_acceptances (append-only)
CREATE TABLE public.user_legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE RESTRICT,
  country_code TEXT NOT NULL,
  language TEXT NOT NULL,
  version TEXT NOT NULL,
  document_hash TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web','mobile','api','admin')),
  CONSTRAINT ula_country_upper CHECK (country_code = upper(country_code) AND length(country_code) = 2),
  UNIQUE (user_id, document_id)
);

GRANT SELECT, INSERT ON public.user_legal_acceptances TO authenticated;
GRANT ALL ON public.user_legal_acceptances TO service_role;

ALTER TABLE public.user_legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user read own acceptances"
  ON public.user_legal_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user insert own acceptance"
  ON public.user_legal_acceptances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin read all acceptances"
  ON public.user_legal_acceptances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.user_legal_acceptances_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'user_legal_acceptances is append-only';
END; $$;

CREATE TRIGGER user_legal_acceptances_no_update
  BEFORE UPDATE OR DELETE ON public.user_legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.user_legal_acceptances_append_only();

-- 5. feature_flags (with deterministic percentage rollout support)
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global','country','provider','user','beta')),
  target_id TEXT, -- country ISO / provider_id / user_id / cohort name; NULL for global
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_pct INTEGER NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  rollout_seed TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (flag_key, scope, target_id)
);

GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read flags"
  ON public.feature_flags FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage flags"
  ON public.feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER feature_flags_touch
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Profile: separate marketplace country from language, and manual-choice guards
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketplace_country TEXT,
  ADD COLUMN IF NOT EXISTS ui_language TEXT,
  ADD COLUMN IF NOT EXISTS language_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS country_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_acceptance_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_marketplace_country_upper
    CHECK (marketplace_country IS NULL OR (marketplace_country = upper(marketplace_country) AND length(marketplace_country) = 2)),
  ADD CONSTRAINT profiles_ui_language_valid
    CHECK (ui_language IS NULL OR ui_language ~ '^[a-z]{2}$');

-- 7. Seed DK / GB / SE / ES (published + active only for DK — others development)
INSERT INTO public.country_configs
  (iso, active, launch_status, default_language, supported_languages, currency, timezone,
   commission_bps, vat_rate_bps, status, published_at, config)
VALUES
  ('DK', true,  'active',      'da', ARRAY['da','en'], 'DKK', 'Europe/Copenhagen', 2800, 2500,
   'published', now(),
   jsonb_build_object(
     'booking_public',   jsonb_build_object('min_notice_hours', 4, 'allow_same_day', true),
     'payment_methods_public', jsonb_build_array('card','apple_pay','google_pay','mobilepay'),
     'contact_public',   jsonb_build_object('support_email','support@mycleaner.dk','privacy_email','privacy@mycleaner.dk'),
     'feature_availability_public', jsonb_build_object('marketplace_map', true),
     'legal_references_public', jsonb_build_array('terms','privacy','provider_agreement','cookie_policy')
   )),
  ('GB', false, 'development', 'en', ARRAY['en'], 'GBP', 'Europe/London', 2800, 2000,
   'draft', NULL,
   jsonb_build_object(
     'booking_public',   jsonb_build_object('min_notice_hours', 4, 'allow_same_day', true),
     'payment_methods_public', jsonb_build_array('card','apple_pay','google_pay'),
     'contact_public',   jsonb_build_object('support_email','support@mycleaner.co.uk')
   )),
  ('SE', false, 'development', 'sv', ARRAY['sv','en'], 'SEK', 'Europe/Stockholm', 2800, 2500,
   'draft', NULL,
   jsonb_build_object(
     'booking_public',   jsonb_build_object('min_notice_hours', 4, 'allow_same_day', true),
     'payment_methods_public', jsonb_build_array('card','swish','apple_pay','google_pay')
   )),
  ('ES', false, 'development', 'es', ARRAY['es','en'], 'EUR', 'Europe/Madrid', 2800, 2100,
   'draft', NULL,
   jsonb_build_object(
     'booking_public',   jsonb_build_object('min_notice_hours', 4, 'allow_same_day', true),
     'payment_methods_public', jsonb_build_array('card','apple_pay','google_pay','bizum')
   ));
