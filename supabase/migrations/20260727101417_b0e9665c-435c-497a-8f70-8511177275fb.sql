-- =========================================================================
-- Milestone 3.1: Campaign email outbox — remove raw token persistence.
-- Preferred pattern: outbox stores only non-sensitive routing metadata.
-- The delivery worker mints a fresh single-use token just before sending,
-- persists only its SHA-256 hash on campaign_applications, and discards
-- the raw value. Admin/support get a safe status view — never payloads.
-- =========================================================================

-- 1) Purge any legacy queued rows that may hold raw tokens in payload.
--    We do not attempt to salvage: campaign-apply is being redesigned to
--    enqueue tokenless rows, and unverified applicants can request a new
--    verification email through the standard flow.
DELETE FROM public.campaign_email_outbox
WHERE payload ? 'token' OR payload ? 'verification_url';

-- 2) Lock down the outbox: revoke ALL grants from non-service roles and
--    drop every existing RLS policy so nothing but service_role can touch it.
REVOKE ALL ON public.campaign_email_outbox FROM PUBLIC;
REVOKE ALL ON public.campaign_email_outbox FROM anon;
REVOKE ALL ON public.campaign_email_outbox FROM authenticated;
GRANT  ALL ON public.campaign_email_outbox TO service_role;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaign_email_outbox'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.campaign_email_outbox', p.policyname);
  END LOOP;
END $$;

-- RLS stays enabled with zero policies => no authenticated/anon access at all.
ALTER TABLE public.campaign_email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_email_outbox FORCE ROW LEVEL SECURITY;

-- 3) Structural hardening.
--    a) Forbid tokens/URLs from ever being written into payload again.
ALTER TABLE public.campaign_email_outbox
  DROP CONSTRAINT IF EXISTS campaign_email_outbox_payload_no_secrets;
ALTER TABLE public.campaign_email_outbox
  ADD CONSTRAINT campaign_email_outbox_payload_no_secrets
  CHECK (
    NOT (payload ? 'token')
    AND NOT (payload ? 'verification_token')
    AND NOT (payload ? 'verification_url')
    AND NOT (payload ? 'raw_token')
  );

--    b) Locale for template rendering (safe metadata).
ALTER TABLE public.campaign_email_outbox
  ADD COLUMN IF NOT EXISTS locale text;

--    c) Structured error code separate from free-form last_error text.
ALTER TABLE public.campaign_email_outbox
  ADD COLUMN IF NOT EXISTS last_error_code text;

--    d) Explicit next_attempt_at for exponential backoff scheduling.
ALTER TABLE public.campaign_email_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

-- Reset in-flight rows so the new worker picks them up cleanly.
UPDATE public.campaign_email_outbox
SET status = 'pending',
    payload = '{}'::jsonb,
    next_attempt_at = now()
WHERE status IN ('pending','sending');

CREATE INDEX IF NOT EXISTS idx_campaign_email_outbox_next_attempt
  ON public.campaign_email_outbox (next_attempt_at)
  WHERE status = 'pending';

-- 4) Safe admin/support-facing status view — no email, no payload, no tokens.
DROP VIEW IF EXISTS public.campaign_email_outbox_status;
CREATE VIEW public.campaign_email_outbox_status
WITH (security_invoker = true) AS
SELECT
  id,
  campaign_id,
  application_id,
  template,
  status,
  attempts,
  last_error_code,
  scheduled_for,
  next_attempt_at,
  sent_at,
  created_at,
  updated_at
FROM public.campaign_email_outbox
WHERE public.has_role(auth.uid(), 'admin'::app_role)
   OR public.has_role(auth.uid(), 'super_admin'::app_role);

REVOKE ALL ON public.campaign_email_outbox_status FROM PUBLIC;
GRANT SELECT ON public.campaign_email_outbox_status TO authenticated;

COMMENT ON VIEW public.campaign_email_outbox_status IS
  'Operational health of campaign email delivery. Excludes recipient email, payload, and any token material. Filtered to admin/super_admin.';

-- 5) Retention: cleanup function callable by service_role/cron.
CREATE OR REPLACE FUNCTION public.campaign_email_outbox_cleanup()
RETURNS TABLE(deleted_sent bigint, deleted_failed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ds bigint := 0;
  df bigint := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.campaign_email_outbox
    WHERE status = 'sent' AND sent_at < now() - interval '30 days'
    RETURNING 1
  ) SELECT count(*) INTO ds FROM d;

  WITH d AS (
    DELETE FROM public.campaign_email_outbox
    WHERE status = 'failed' AND updated_at < now() - interval '90 days'
    RETURNING 1
  ) SELECT count(*) INTO df FROM d;

  RETURN QUERY SELECT ds, df;
END $$;

REVOKE ALL ON FUNCTION public.campaign_email_outbox_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_email_outbox_cleanup() TO service_role;

COMMENT ON TABLE public.campaign_email_outbox IS
  'Server-only queue of Campaign Engine emails. Stores routing metadata only (application_id, template, locale, country). CHECK constraint forbids raw tokens in payload. The delivery worker mints and hashes verification tokens just-in-time, then discards the raw value. Zero RLS policies -> no non-service access.';
