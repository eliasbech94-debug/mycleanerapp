CREATE TABLE IF NOT EXISTS public.campaign_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.campaign_applications(id) ON DELETE CASCADE,
  email text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.campaign_email_outbox TO authenticated;
GRANT ALL ON public.campaign_email_outbox TO service_role;

ALTER TABLE public.campaign_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox_admin_read" ON public.campaign_email_outbox
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS campaign_email_outbox_pending_idx
  ON public.campaign_email_outbox (status, created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public._touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS campaign_email_outbox_touch ON public.campaign_email_outbox;
CREATE TRIGGER campaign_email_outbox_touch
  BEFORE UPDATE ON public.campaign_email_outbox
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();