-- Allow country_code = 'GLOBAL' in addition to ISO-2 uppercase, for platform-wide legal doc fallback
ALTER TABLE public.legal_documents DROP CONSTRAINT IF EXISTS legal_docs_country_upper;
ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_docs_country_upper
  CHECK (
    country_code = 'GLOBAL'
    OR (country_code = upper(country_code) AND length(country_code) = 2)
  );