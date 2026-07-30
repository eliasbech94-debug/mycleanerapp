-- 1. Permanent document identity + semantic version on existing documents
ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS doc_uid text,
  ADD COLUMN IF NOT EXISTS version_major integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_patch integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.legal_documents
SET doc_uid = 'MC-' || upper(replace(kind, '_', '-')) || '-001'
WHERE doc_uid IS NULL;

CREATE INDEX IF NOT EXISTS legal_documents_doc_uid_idx ON public.legal_documents (doc_uid);

-- 2. Sections (chapters)
CREATE TABLE IF NOT EXISTS public.legal_document_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  slug text NOT NULL,
  content_md text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'draft',
  hash text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'da',
  translation_of uuid REFERENCES public.legal_document_sections(id) ON DELETE SET NULL,
  effective_date timestamptz,
  published_at timestamptz,
  created_by uuid,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_sections_status_check CHECK (status IN ('draft','published','superseded','archived')),
  CONSTRAINT legal_sections_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT legal_sections_language_valid CHECK (language ~ '^[a-z]{2}$'),
  CONSTRAINT legal_sections_unique_key UNIQUE (document_id, section_key, language, version)
);

GRANT SELECT ON public.legal_document_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_document_sections TO authenticated;
GRANT ALL ON public.legal_document_sections TO service_role;

ALTER TABLE public.legal_document_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read published sections"
  ON public.legal_document_sections FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.legal_documents d
      WHERE d.id = document_id AND d.status = 'published'
    )
  );

CREATE POLICY "admin manage legal sections"
  ON public.legal_document_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS legal_sections_document_order_idx
  ON public.legal_document_sections (document_id, language, section_order);
CREATE INDEX IF NOT EXISTS legal_sections_translation_idx
  ON public.legal_document_sections (translation_of);

-- 3. Changelog
CREATE TABLE IF NOT EXISTS public.legal_document_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
  doc_uid text,
  version text NOT NULL,
  previous_version text,
  summary text,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.legal_document_changelog TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_document_changelog TO authenticated;
GRANT ALL ON public.legal_document_changelog TO service_role;

ALTER TABLE public.legal_document_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read changelog for published docs"
  ON public.legal_document_changelog FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.legal_documents d WHERE d.id = document_id AND d.status = 'published'));

CREATE POLICY "admin manage changelog"
  ON public.legal_document_changelog FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS legal_changelog_document_idx
  ON public.legal_document_changelog (document_id, published_at DESC);

-- 4. Audit log (append-only)
CREATE TABLE IF NOT EXISTS public.legal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  section_id uuid REFERENCES public.legal_document_sections(id) ON DELETE SET NULL,
  actor_id uuid,
  action text NOT NULL,
  old_hash text,
  new_hash text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.legal_audit_log TO authenticated;
GRANT ALL ON public.legal_audit_log TO service_role;

ALTER TABLE public.legal_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read legal audit"
  ON public.legal_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin append legal audit"
  ON public.legal_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE INDEX IF NOT EXISTS legal_audit_document_idx
  ON public.legal_audit_log (document_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.legal_audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'legal_audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS legal_audit_log_no_mutate ON public.legal_audit_log;
CREATE TRIGGER legal_audit_log_no_mutate
  BEFORE UPDATE OR DELETE ON public.legal_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.legal_audit_log_append_only();

-- 5. updated_at maintenance
CREATE OR REPLACE FUNCTION public.legal_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_sections_touch_updated_at ON public.legal_document_sections;
CREATE TRIGGER legal_sections_touch_updated_at
  BEFORE UPDATE ON public.legal_document_sections
  FOR EACH ROW EXECUTE FUNCTION public.legal_touch_updated_at();

DROP TRIGGER IF EXISTS legal_documents_touch_updated_at ON public.legal_documents;
CREATE TRIGGER legal_documents_touch_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.legal_touch_updated_at();