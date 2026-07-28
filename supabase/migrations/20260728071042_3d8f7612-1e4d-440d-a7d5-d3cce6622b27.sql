
-- ============================================================
-- Knowledge Phase 2: incident evidence hardening & storage RLS
-- ============================================================

ALTER TABLE public.incident_evidence
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS checksum_algo text NOT NULL DEFAULT 'sha256',
  ADD COLUMN IF NOT EXISTS original_filename text;

CREATE OR REPLACE FUNCTION public.incident_evidence_validate_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_prefix text := NEW.incident_id::text || '/';
BEGIN
  IF NEW.storage_path IS NULL OR position(expected_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'incident_evidence.storage_path must start with %', expected_prefix;
  END IF;
  IF NEW.storage_path !~*
     ('^' || NEW.incident_id::text ||
      '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$') THEN
    RAISE EXCEPTION 'incident_evidence.storage_path pattern invalid: %', NEW.storage_path;
  END IF;
  IF NEW.mime_type IS NULL OR NEW.mime_type NOT IN
     ('image/jpeg','image/png','image/webp','application/pdf') THEN
    RAISE EXCEPTION 'incident_evidence.mime_type not allowed: %', NEW.mime_type;
  END IF;
  IF NEW.file_size IS NULL OR NEW.file_size <= 0 OR NEW.file_size > 10*1024*1024 THEN
    RAISE EXCEPTION 'incident_evidence.file_size out of range (max 10 MB)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS incident_evidence_validate_path ON public.incident_evidence;
CREATE TRIGGER incident_evidence_validate_path
  BEFORE INSERT OR UPDATE ON public.incident_evidence
  FOR EACH ROW EXECUTE FUNCTION public.incident_evidence_validate_path();

DROP POLICY IF EXISTS "incident_evidence_no_client_select" ON storage.objects;
CREATE POLICY "incident_evidence_no_client_select"
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id <> 'incident-evidence');

DROP POLICY IF EXISTS "incident_evidence_no_client_insert" ON storage.objects;
CREATE POLICY "incident_evidence_no_client_insert"
  ON storage.objects FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id <> 'incident-evidence');

DROP POLICY IF EXISTS "incident_evidence_no_client_update" ON storage.objects;
CREATE POLICY "incident_evidence_no_client_update"
  ON storage.objects FOR UPDATE TO authenticated, anon
  USING (bucket_id <> 'incident-evidence')
  WITH CHECK (bucket_id <> 'incident-evidence');

DROP POLICY IF EXISTS "incident_evidence_no_client_delete" ON storage.objects;
CREATE POLICY "incident_evidence_no_client_delete"
  ON storage.objects FOR DELETE TO authenticated, anon
  USING (bucket_id <> 'incident-evidence');
