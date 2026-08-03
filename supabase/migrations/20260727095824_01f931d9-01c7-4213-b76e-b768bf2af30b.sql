-- =========================================================================
-- Campaign Engine: security correction (email outbox) + M3 feature flags.
-- No changes to existing campaigns.* tables. campaigns.enabled stays OFF.
-- =========================================================================

-- 1) Dedicated outbox for campaign emails (applicants have no user account,
--    so we cannot reuse notification_outbox which requires user_id NOT NULL).
CREATE TABLE IF NOT EXISTS public.campaign_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.campaign_applications(id) ON DELETE CASCADE,
  email citext NOT NULL,
  template text NOT NULL CHECK (template IN (
    'verification', 'already_verified', 'waiting_list',
    'approved', 'rejected', 'reminder'
  )),
  -- payload may transiently hold the raw verification token; the delivery
  -- worker MUST clear it (set to '{}') on successful send.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sending', 'sent', 'failed', 'suppressed'
  )),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, template, dedupe_key)
);

-- Locked down: only admins can read; only service_role writes.
GRANT SELECT ON public.campaign_email_outbox TO authenticated;
GRANT ALL ON public.campaign_email_outbox TO service_role;
ALTER TABLE public.campaign_email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_email_outbox_admin_read" ON public.campaign_email_outbox;
CREATE POLICY "campaign_email_outbox_admin_read"
  ON public.campaign_email_outbox
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_campaign_email_outbox_pending
  ON public.campaign_email_outbox (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_campaign_email_outbox_application
  ON public.campaign_email_outbox (application_id);

DROP TRIGGER IF EXISTS trg_campaign_email_outbox_updated_at ON public.campaign_email_outbox;
CREATE TRIGGER trg_campaign_email_outbox_updated_at
  BEFORE UPDATE ON public.campaign_email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.campaign_email_outbox IS
  'Server-only queue of Campaign Engine emails. Applicants are not registered users, so we cannot reuse notification_outbox. payload may transiently store raw verification tokens; workers MUST clear payload once sent. Admin-read only, service-role write only.';

-- 2) Feature flags for M3 (all default OFF; existing rows preserved).
INSERT INTO public.feature_flags (flag_key, scope, enabled)
VALUES
  ('campaigns.public_ui',      'global', false),
  ('campaigns.admin_ui',       'global', false),
  ('campaigns.personalization','global', false),
  ('campaigns.analytics',      'global', false)
ON CONFLICT DO NOTHING;