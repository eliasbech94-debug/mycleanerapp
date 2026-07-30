ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text;

ALTER TABLE public.legal_documents DROP CONSTRAINT IF EXISTS legal_documents_kind_check;
ALTER TABLE public.legal_documents ADD CONSTRAINT legal_documents_kind_check CHECK (kind = ANY (ARRAY[
  'terms','privacy','provider_agreement','cookie_policy',
  'customer_terms','marketplace_rules','community_guidelines','trust_safety',
  'platform_integrity','refund_policy','cancellation_policy','payment_terms',
  'subscription_terms','referral_terms','verification_policy','review_policy',
  'ai_policy','acceptable_use','content_policy'
]));

UPDATE public.legal_documents SET slug = CASE kind
  WHEN 'terms' THEN 'customer-terms'
  WHEN 'privacy' THEN 'privacy-policy'
  WHEN 'provider_agreement' THEN 'provider-terms'
  WHEN 'cookie_policy' THEN 'cookie-policy'
  ELSE replace(kind, '_', '-') END
WHERE slug IS NULL;

ALTER TABLE public.legal_documents ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.legal_documents ADD CONSTRAINT legal_documents_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_slug_scope_version_key
  ON public.legal_documents (slug, country_code, language, version);
CREATE INDEX IF NOT EXISTS legal_documents_slug_published_idx
  ON public.legal_documents (slug) WHERE status = 'published';

GRANT SELECT ON public.legal_documents TO anon, authenticated;
GRANT ALL ON public.legal_documents TO service_role;
GRANT SELECT, INSERT ON public.user_legal_acceptances TO authenticated;
GRANT ALL ON public.user_legal_acceptances TO service_role;