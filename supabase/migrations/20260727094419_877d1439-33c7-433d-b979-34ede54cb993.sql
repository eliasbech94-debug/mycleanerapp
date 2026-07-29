
ALTER TABLE public.campaign_applications
  ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_idempotency_key text;

COMMENT ON COLUMN public.campaign_applications.email_verification_token IS
  'SHA-256 hex hash of the single-use verification token. Raw token appears only in the verification link. Cleared on use.';

CREATE INDEX IF NOT EXISTS campaign_applications_verify_token_hash_idx
  ON public.campaign_applications (email_verification_token)
  WHERE email_verification_token IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_applications_provider_user_uniq
  ON public.campaign_applications (campaign_id, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

-- Storage RLS for campaign-uploads (private bucket)
DROP POLICY IF EXISTS "campaign_uploads_admin_read" ON storage.objects;
CREATE POLICY "campaign_uploads_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campaign-uploads'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'support'::app_role)
    )
  );

DROP POLICY IF EXISTS "campaign_uploads_applicant_read_own" ON storage.objects;
CREATE POLICY "campaign_uploads_applicant_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campaign-uploads'
    AND EXISTS (
      SELECT 1 FROM public.campaign_applications ca
      WHERE ca.user_id = auth.uid()
        AND ca.deleted_at IS NULL
        AND (storage.objects.name LIKE 'applications/' || ca.id::text || '/%')
    )
  );

-- No public/anon INSERT — all writes go through edge functions using service role.
DROP POLICY IF EXISTS "campaign_uploads_no_direct_write" ON storage.objects;
