CREATE TABLE public.sms_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_verifications_user_created_idx ON public.sms_verifications(user_id, created_at DESC);

GRANT SELECT ON public.sms_verifications TO authenticated;
GRANT ALL ON public.sms_verifications TO service_role;

ALTER TABLE public.sms_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own sms verifications"
ON public.sms_verifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
