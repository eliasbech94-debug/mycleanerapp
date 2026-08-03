-- =============================================================================
-- STAGING_REQUIRED — Incident Evidence Hardening
-- =============================================================================
-- ⚠️  DO NOT apply against the shared production backend. This file lives
-- outside supabase/migrations/ intentionally. Promote by copying to
-- supabase/migrations/<timestamp>_incident_evidence_hardening.sql only after
-- staging validation.
--
-- Scope:
--   1. Revoke direct client metadata writes on incident_evidence.
--   2. Introduce server-side authorization helper can_access_incident_report.
--   3. Add quarantine/verification columns + strict lifecycle status.
--   4. Idempotent upload sessions + unique (incident_id, storage_path).
--   5. Two-phase storage paths (pending/*, final/*) + revised trigger.
--   6. Rate-limit tracking table.
--   7. Retention / legal-hold + orphan reconciliation view.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Revoke direct client writes on public.incident_evidence
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS incident_evidence_insert_owner ON public.incident_evidence;
DROP POLICY IF EXISTS incident_evidence_delete_staff ON public.incident_evidence;
DROP POLICY IF EXISTS incident_evidence_read         ON public.incident_evidence;

-- Only service_role writes; authenticated keeps SELECT only (gated below).
REVOKE INSERT, UPDATE, DELETE ON public.incident_evidence FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.incident_evidence FROM anon;
GRANT  SELECT                   ON public.incident_evidence TO authenticated;
GRANT  ALL                      ON public.incident_evidence TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Authorization helper — explicit, distinct from CMS editor role
-- ---------------------------------------------------------------------------
-- Rule matrix:
--   provider       -> only their own incident_reports.provider_user_id
--   customer       -> DENY (no assignment model exists today; documented risk)
--   editor         -> DENY (CMS role != incident access)
--   publisher      -> DENY
--   support        -> DENY-by-default (no assignment model; global read is
--                     unsafe. See docs/security/INCIDENT_EVIDENCE.md.)
--   employee       -> DENY-by-default (same reasoning as support)
--   admin          -> ALLOW (audited)
--   super_admin    -> ALLOW (audited)
--
-- When an incident assignment model is introduced, extend this helper with a
-- lookup against that table; do NOT widen role checks alone.
CREATE OR REPLACE FUNCTION public.can_access_incident_report(
  _user_id uuid,
  _incident_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF _user_id IS NULL OR _incident_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin / super_admin — always allowed (downloads are audited by callers).
  IF public.has_role(_user_id, 'admin')
     OR public.has_role(_user_id, 'super_admin') THEN
    RETURN true;
  END IF;

  SELECT provider_user_id
    INTO v_owner
    FROM public.incident_reports
   WHERE id = _incident_id;

  IF v_owner IS NULL THEN
    RETURN false;
  END IF;

  -- Provider owner of the incident.
  IF v_owner = _user_id THEN
    RETURN true;
  END IF;

  -- Support/employee: currently deny by default. When incident_assignments
  -- lands, add: EXISTS (SELECT 1 FROM incident_assignments a
  -- WHERE a.incident_id = _incident_id AND a.assignee_user_id = _user_id).
  RETURN false;
END $$;

REVOKE ALL   ON FUNCTION public.can_access_incident_report(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_access_incident_report(uuid, uuid) TO authenticated, service_role;

-- Read policy uses the helper — no more implicit CMS-role bleed-through.
CREATE POLICY incident_evidence_select_authorized
  ON public.incident_evidence
  FOR SELECT TO authenticated
  USING (public.can_access_incident_report(auth.uid(), incident_id));

-- ---------------------------------------------------------------------------
-- 3. Lifecycle columns
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.incident_evidence_status AS ENUM
    ('pending', 'verified', 'quarantined', 'rejected', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_evidence_hash_status AS ENUM
    ('pending', 'verified', 'mismatch', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.incident_evidence
  ADD COLUMN IF NOT EXISTS status public.incident_evidence_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS claimed_file_hash text,          -- legacy: what the client sent
  ADD COLUMN IF NOT EXISTS verified_file_hash text,         -- authoritative SHA-256 of bytes
  ADD COLUMN IF NOT EXISTS hash_verification_status public.incident_evidence_hash_status
    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS detected_mime_type text,         -- from magic-byte sniffing
  ADD COLUMN IF NOT EXISTS verified_extension text,         -- server-chosen
  ADD COLUMN IF NOT EXISTS verified_size_bytes bigint,      -- authoritative byte size
  ADD COLUMN IF NOT EXISTS final_storage_path text,         -- final/<incident>/<uuid>.<ext>
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN public.incident_evidence.claimed_file_hash IS
  'Legacy client-supplied SHA-256. Advisory only; never used for authorization.';
COMMENT ON COLUMN public.incident_evidence.verified_file_hash IS
  'Authoritative SHA-256 computed server-side over the actual object bytes.';
COMMENT ON COLUMN public.incident_evidence.verified_extension IS
  'Server-chosen extension derived from detected MIME. Client input ignored.';

-- Back-fill: existing file_hash rows are demoted to claimed_file_hash.
UPDATE public.incident_evidence
   SET claimed_file_hash = file_hash
 WHERE claimed_file_hash IS NULL AND file_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Two-phase path trigger (replaces validate_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_evidence_validate_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  incident_prefix text := NEW.incident_id::text;
BEGIN
  IF NEW.storage_path IS NULL THEN
    RAISE EXCEPTION 'incident_evidence.storage_path required';
  END IF;

  -- Pending path (initial insert): pending/<incident>/<session_uuid>/<obj_uuid>.bin
  IF NEW.status = 'pending' THEN
    IF NEW.storage_path !~*
      ('^pending/' || incident_prefix ||
       '/[0-9a-f-]{36}/[0-9a-f-]{36}\.bin$') THEN
      RAISE EXCEPTION 'pending path invalid: %', NEW.storage_path;
    END IF;
  ELSIF NEW.status = 'verified' THEN
    IF NEW.final_storage_path IS NULL
       OR NEW.final_storage_path !~*
       ('^final/' || incident_prefix ||
        '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$') THEN
      RAISE EXCEPTION 'final_storage_path invalid: %', NEW.final_storage_path;
    END IF;
    IF NEW.verified_file_hash IS NULL
       OR NEW.hash_verification_status <> 'verified' THEN
      RAISE EXCEPTION 'verified status requires verified_file_hash';
    END IF;
    IF NEW.detected_mime_type IS NULL
       OR NEW.detected_mime_type NOT IN
          ('image/jpeg','image/png','image/webp','application/pdf') THEN
      RAISE EXCEPTION 'verified detected_mime_type invalid: %', NEW.detected_mime_type;
    END IF;
    IF NEW.verified_size_bytes IS NULL
       OR NEW.verified_size_bytes <= 0
       OR NEW.verified_size_bytes > 10*1024*1024 THEN
      RAISE EXCEPTION 'verified_size_bytes out of range';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Idempotency & uniqueness
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_evidence_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,        -- server-generated
  pending_storage_path text NOT NULL,   -- pending/<incident>/<session>/<obj>.bin
  declared_mime_type text,              -- advisory
  declared_size_bytes bigint,           -- advisory
  claimed_file_hash text,               -- advisory (client-computed)
  expires_at timestamptz NOT NULL,      -- MyCleaner session TTL (e.g. now()+15m)
  finalized_at timestamptz,
  evidence_id uuid REFERENCES public.incident_evidence(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_iev_upload_session_idem
  ON public.incident_evidence_upload_sessions (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_iev_upload_session_expiry
  ON public.incident_evidence_upload_sessions (expires_at)
  WHERE finalized_at IS NULL;

GRANT SELECT ON public.incident_evidence_upload_sessions TO authenticated;
GRANT ALL    ON public.incident_evidence_upload_sessions TO service_role;

ALTER TABLE public.incident_evidence_upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY iev_session_select_own
  ON public.incident_evidence_upload_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Unique constraint on final metadata (no duplicate rows per resolved path).
CREATE UNIQUE INDEX IF NOT EXISTS uq_iev_incident_final_path
  ON public.incident_evidence (incident_id, final_storage_path)
  WHERE final_storage_path IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_iev_incident_storage_path
  ON public.incident_evidence (incident_id, storage_path);

-- ---------------------------------------------------------------------------
-- 6. Rate limiting scaffold (server-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_evidence_rate_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  incident_id uuid,
  bucket text NOT NULL,                  -- 'upload_init' | 'finalize' | 'download'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iev_rate_events_user_bucket_time
  ON public.incident_evidence_rate_events (user_id, bucket, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iev_rate_events_incident_bucket_time
  ON public.incident_evidence_rate_events (incident_id, bucket, created_at DESC)
  WHERE incident_id IS NOT NULL;

GRANT SELECT ON public.incident_evidence_rate_events TO authenticated;
GRANT ALL    ON public.incident_evidence_rate_events TO service_role;

ALTER TABLE public.incident_evidence_rate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY iev_rate_events_own ON public.incident_evidence_rate_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Retention / orphan reconciliation view (read-only aid for the worker)
-- ---------------------------------------------------------------------------
-- NOTE: incident_reports.ON DELETE CASCADE removes the incident_evidence rows,
-- but does NOT remove the Storage object. The orphan worker MUST reconcile
-- Storage against DB rows. This view surfaces "expected object paths".
CREATE OR REPLACE VIEW public.incident_evidence_expected_objects AS
SELECT e.id             AS evidence_id,
       e.incident_id,
       e.storage_path   AS pending_path,
       e.final_storage_path,
       e.status,
       e.legal_hold,
       e.verified_at
  FROM public.incident_evidence e;

COMMIT;

-- =============================================================================
-- END STAGING_REQUIRED
-- =============================================================================
