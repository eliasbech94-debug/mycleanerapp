
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"email":true,"push":true,"sms":false,"marketing":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS sms_phone text,
  ADD COLUMN IF NOT EXISTS sms_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS tax_id_encrypted text,
  ADD COLUMN IF NOT EXISTS tax_municipality text,
  ADD COLUMN IF NOT EXISTS tax_type text,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;
