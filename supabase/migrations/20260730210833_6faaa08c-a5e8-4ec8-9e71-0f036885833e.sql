-- =====================================================================
-- LEGAL-ARCH-002 — Legal Center 2.0 architecture upgrade
-- Backwards compatible: no drops, no data loss, existing hashes intact.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Document metadata
-- ---------------------------------------------------------------------
ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS category            text,
  ADD COLUMN IF NOT EXISTS owner_id            uuid,
  ADD COLUMN IF NOT EXISTS approved_by         uuid,
  ADD COLUMN IF NOT EXISTS approved_at         timestamptz,
  ADD COLUMN IF NOT EXISTS published_by        uuid,
  ADD COLUMN IF NOT EXISTS original_language   text,
  ADD COLUMN IF NOT EXISTS last_review_at      timestamptz,
  ADD COLUMN IF NOT EXISTS next_review_at      timestamptz,
  ADD COLUMN IF NOT EXISTS review_interval_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS word_count          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reading_minutes     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS section_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy_version      text;

ALTER TABLE public.legal_document_sections
  ADD COLUMN IF NOT EXISTS word_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reading_minutes integer NOT NULL DEFAULT 0;

UPDATE public.legal_documents
   SET original_language = COALESCE(original_language, language),
       category = COALESCE(category,
         CASE
           WHEN kind IN ('provider_agreement') THEN 'provider'
           WHEN kind IN ('terms','customer_terms','subscription_terms','referral_terms','payment_terms') THEN 'commercial'
           WHEN kind IN ('privacy','cookie_policy') THEN 'privacy'
           WHEN kind IN ('trust_safety','platform_integrity','verification_policy','community_guidelines','acceptable_use','content_policy','review_policy','marketplace_rules') THEN 'trust'
           WHEN kind IN ('refund_policy','cancellation_policy') THEN 'money'
           WHEN kind IN ('ai_policy') THEN 'technology'
           ELSE 'general'
         END);

-- ---------------------------------------------------------------------
-- 2. Lifecycle statuses (superset of the old list — nothing removed)
-- ---------------------------------------------------------------------
ALTER TABLE public.legal_documents DROP CONSTRAINT IF EXISTS legal_documents_status_check;
ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_status_check CHECK (status IN (
    'draft','internal_review','legal_review','approved','scheduled','published','superseded','archived'
  ));

ALTER TABLE public.legal_document_sections DROP CONSTRAINT IF EXISTS legal_document_sections_status_check;
ALTER TABLE public.legal_document_sections
  ADD CONSTRAINT legal_document_sections_status_check CHECK (status IN (
    'draft','internal_review','legal_review','approved','published','superseded','archived'
  ));

-- ---------------------------------------------------------------------
-- 3. Semantic versions everywhere (1.0 -> 1.0.0, 1.0-draft -> 1.1.0)
--    The immutability trigger is bypassed for this one-off normalisation.
-- ---------------------------------------------------------------------
ALTER TABLE public.legal_documents DISABLE TRIGGER legal_documents_immutable;

UPDATE public.legal_documents SET legacy_version = COALESCE(legacy_version, version);

-- Pre-release / suffixed drafts become the next minor of their numeric base.
UPDATE public.legal_documents d
   SET version = (
         COALESCE(split_part(regexp_replace(version, '[^0-9.].*$', ''), '.', 1), '1')::int
       )::text || '.' || (
         COALESCE(NULLIF(split_part(regexp_replace(version, '[^0-9.].*$', ''), '.', 2), ''), '0')::int + 1
       )::text || '.0'
 WHERE version !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
   AND version ~ '[^0-9.]';

-- "1.0" style -> "1.0.0"
UPDATE public.legal_documents
   SET version = version || '.0'
 WHERE version ~ '^[0-9]+\.[0-9]+$';

UPDATE public.legal_documents
   SET version = version || '.0.0'
 WHERE version ~ '^[0-9]+$';

UPDATE public.legal_documents
   SET version_major = split_part(version, '.', 1)::int,
       version_minor = split_part(version, '.', 2)::int,
       version_patch = split_part(version, '.', 3)::int;

ALTER TABLE public.legal_documents ENABLE TRIGGER legal_documents_immutable;

ALTER TABLE public.legal_documents DROP CONSTRAINT IF EXISTS legal_documents_semver_format;
ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_semver_format CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

UPDATE public.legal_document_sections SET version = version || '.0' WHERE version ~ '^[0-9]+\.[0-9]+$';
UPDATE public.legal_document_sections SET version = version || '.0.0' WHERE version ~ '^[0-9]+$';

ALTER TABLE public.legal_document_sections DROP CONSTRAINT IF EXISTS legal_sections_semver_format;
ALTER TABLE public.legal_document_sections
  ADD CONSTRAINT legal_sections_semver_format CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

-- ---------------------------------------------------------------------
-- 4. Derived metrics kept in sync by triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_word_count(_text text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_length(regexp_split_to_array(btrim(COALESCE(_text, '')), '\s+'), 1), 0)
$$;

CREATE OR REPLACE FUNCTION public.legal_documents_sync_metrics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version_major := split_part(NEW.version, '.', 1)::int;
  NEW.version_minor := split_part(NEW.version, '.', 2)::int;
  NEW.version_patch := split_part(NEW.version, '.', 3)::int;
  NEW.word_count := public.legal_word_count(NEW.body_md);
  NEW.reading_minutes := GREATEST(1, CEIL(NEW.word_count / 200.0))::int;
  NEW.section_count := (
    SELECT count(*) FROM public.legal_document_sections s
     WHERE s.document_id = NEW.id AND s.language = NEW.language AND s.status <> 'archived'
  );
  IF NEW.status = 'published' AND NEW.published_at IS NOT NULL THEN
    NEW.last_review_at := COALESCE(NEW.last_review_at, NEW.published_at);
    NEW.next_review_at := COALESCE(
      NEW.next_review_at,
      NEW.published_at + make_interval(months => GREATEST(1, NEW.review_interval_months))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_documents_metrics ON public.legal_documents;
CREATE TRIGGER legal_documents_metrics
BEFORE INSERT OR UPDATE ON public.legal_documents
FOR EACH ROW EXECUTE FUNCTION public.legal_documents_sync_metrics();

CREATE OR REPLACE FUNCTION public.legal_sections_sync_metrics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.word_count := public.legal_word_count(NEW.content_md);
  NEW.reading_minutes := GREATEST(1, CEIL(NEW.word_count / 200.0))::int;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_sections_metrics ON public.legal_document_sections;
CREATE TRIGGER legal_sections_metrics
BEFORE INSERT OR UPDATE ON public.legal_document_sections
FOR EACH ROW EXECUTE FUNCTION public.legal_sections_sync_metrics();

-- Backfill metrics for existing rows without touching immutable fields.
UPDATE public.legal_document_sections
   SET word_count = public.legal_word_count(content_md),
       reading_minutes = GREATEST(1, CEIL(public.legal_word_count(content_md) / 200.0))::int;

ALTER TABLE public.legal_documents DISABLE TRIGGER legal_documents_immutable;
UPDATE public.legal_documents
   SET word_count = public.legal_word_count(body_md),
       reading_minutes = GREATEST(1, CEIL(public.legal_word_count(body_md) / 200.0))::int,
       section_count = (
         SELECT count(*) FROM public.legal_document_sections s
          WHERE s.document_id = legal_documents.id
            AND s.language = legal_documents.language
            AND s.status <> 'archived'
       ),
       last_review_at = COALESCE(last_review_at, published_at),
       next_review_at = COALESCE(next_review_at, published_at + interval '12 months');
ALTER TABLE public.legal_documents ENABLE TRIGGER legal_documents_immutable;

-- ---------------------------------------------------------------------
-- 5. Immutability rules updated for the richer lifecycle
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_documents_enforce_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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
       OR NEW.doc_uid IS DISTINCT FROM OLD.doc_uid
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'legal_documents: cannot mutate published document; create new version';
    END IF;
    -- Only lifecycle end-states and review bookkeeping remain editable.
    IF NEW.status NOT IN ('published','superseded','archived') THEN
      RAISE EXCEPTION 'legal_documents: invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- The permanent document identity can never be rewritten once assigned.
  IF TG_OP = 'UPDATE' AND OLD.doc_uid IS NOT NULL AND NEW.doc_uid IS DISTINCT FROM OLD.doc_uid THEN
    RAISE EXCEPTION 'legal_documents: doc_uid is permanent and cannot change';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Full-text search across the library
-- ---------------------------------------------------------------------
ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(body_md,''))) STORED;

ALTER TABLE public.legal_document_sections
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_md,''))) STORED;

CREATE INDEX IF NOT EXISTS legal_documents_search_idx ON public.legal_documents USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS legal_sections_search_idx ON public.legal_document_sections USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS legal_documents_review_idx ON public.legal_documents (next_review_at) WHERE status = 'published';

-- ---------------------------------------------------------------------
-- 7. Review-due helper (admin only, respects RLS via security invoker)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_documents_due_for_review(_within_days integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  doc_uid text,
  slug text,
  title text,
  version text,
  country_code text,
  language text,
  next_review_at timestamptz,
  days_until integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT d.id, d.doc_uid, d.slug, d.title, d.version, d.country_code, d.language,
         d.next_review_at,
         EXTRACT(day FROM (d.next_review_at - now()))::int AS days_until
    FROM public.legal_documents d
   WHERE d.status = 'published'
     AND d.next_review_at IS NOT NULL
     AND d.next_review_at <= now() + make_interval(days => GREATEST(0, _within_days))
   ORDER BY d.next_review_at ASC
$$;

GRANT EXECUTE ON FUNCTION public.legal_documents_due_for_review(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.legal_word_count(text) TO authenticated, anon;