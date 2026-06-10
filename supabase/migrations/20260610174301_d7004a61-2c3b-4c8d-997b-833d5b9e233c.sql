CREATE TABLE public.access_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  route TEXT NOT NULL,
  allowed_roles TEXT[] NOT NULL DEFAULT '{}',
  user_roles TEXT[] NOT NULL DEFAULT '{}',
  result TEXT NOT NULL CHECK (result IN ('granted','denied','unauthenticated')),
  reason TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.access_attempts TO authenticated;
GRANT INSERT ON public.access_attempts TO anon;
GRANT ALL ON public.access_attempts TO service_role;

ALTER TABLE public.access_attempts ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon) can insert their own attempt log
CREATE POLICY "Anyone can log access attempts"
ON public.access_attempts FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins / super_admins can read logs
CREATE POLICY "Admins can view access attempts"
ON public.access_attempts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_access_attempts_created_at ON public.access_attempts (created_at DESC);
CREATE INDEX idx_access_attempts_user_id ON public.access_attempts (user_id);
CREATE INDEX idx_access_attempts_result ON public.access_attempts (result);