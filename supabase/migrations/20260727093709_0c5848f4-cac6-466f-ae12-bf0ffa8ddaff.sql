
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.campaign_applications
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaigns_not_deleted_idx
  ON public.campaigns (lifecycle) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS campaign_applications_not_deleted_idx
  ON public.campaign_applications (campaign_id) WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS campaigns_public_read ON public.campaigns;
CREATE POLICY campaigns_public_read ON public.campaigns
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND public.is_campaign_public(lifecycle));

DROP POLICY IF EXISTS ca_owner_read ON public.campaign_applications;
CREATE POLICY ca_owner_read ON public.campaign_applications
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS ca_owner_update ON public.campaign_applications;
CREATE POLICY ca_owner_update ON public.campaign_applications
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (deleted_at IS NULL AND user_id IS NOT NULL AND user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.campaign_events_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'campaign_events is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS campaign_events_no_update ON public.campaign_events;
CREATE TRIGGER campaign_events_no_update BEFORE UPDATE ON public.campaign_events
  FOR EACH ROW EXECUTE FUNCTION public.campaign_events_append_only();

DROP TRIGGER IF EXISTS campaign_events_no_delete ON public.campaign_events;
CREATE TRIGGER campaign_events_no_delete BEFORE DELETE ON public.campaign_events
  FOR EACH ROW EXECUTE FUNCTION public.campaign_events_append_only();

REVOKE UPDATE, DELETE ON public.campaign_events FROM anon, authenticated;

COMMENT ON COLUMN public.campaigns.ai_config IS
$doc$Reserved architecture for future AI-driven capabilities. Expected shape:
{
  "translations": {},
  "seo":          {},
  "copy":         {},
  "ab_testing":   {},
  "prompt":       {}
}
No implementation yet; architecture reserved only.$doc$;

COMMENT ON COLUMN public.campaign_page_blocks.ai_config IS
$doc$Same shape as campaigns.ai_config (translations, seo, copy, ab_testing, prompt), scoped to a single block.$doc$;

COMMENT ON TABLE public.campaign_rewards IS
$doc$Campaign-owned reward definitions. Fully independent of the finance / fee engine. The fee engine CONSUMES rewards but never owns them. Rewards may be non-financial (badge, priority listing, feature access, custom_action).$doc$;

COMMENT ON TABLE public.campaign_reward_grants IS
$doc$Grant instances of a campaign_rewards row. Read-only input to downstream consumers (fee engine, badge renderer, feature gate). Finance may only record consumption via a dedicated RPC (future work).$doc$;

COMMENT ON TABLE public.campaign_events IS
$doc$Append-only analytics ledger. Enforced by campaign_events_append_only trigger — updates and deletes raise a check_violation.$doc$;
