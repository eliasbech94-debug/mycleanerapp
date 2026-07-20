
-- =========================================================================
-- IDENTITY VERIFICATION FOUNDATION (Stage 1)
-- All flows remain OFF via feature flags. No booking/publish/payout gates yet.
-- Never stores raw ID documents, selfies, or biometric data.
-- =========================================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.identity_status AS ENUM
    ('unverified','pending','approved','rejected','on_hold','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.identity_level AS ENUM ('customer','provider');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.identity_link_reason AS ENUM
    ('auto_created','signup','admin_merge','admin_relink');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.identity_webhook_result AS ENUM
    ('received','processed','duplicate','failed','signature_invalid','unknown_type');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- person_identities ----------
CREATE TABLE IF NOT EXISTS public.person_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL DEFAULT 'sumsub',
  external_ref    TEXT,   -- Sumsub applicantId; nullable until created
  status          public.identity_status NOT NULL DEFAULT 'unverified',
  level           public.identity_level,
  country_code    TEXT,
  risk_level      TEXT,
  verified_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  last_review_at  TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- non-PII only
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_ref)
);

GRANT SELECT ON public.person_identities TO authenticated;
GRANT ALL    ON public.person_identities TO service_role;
ALTER TABLE public.person_identities ENABLE ROW LEVEL SECURITY;

-- ---------- identity_account_links ----------
CREATE TABLE IF NOT EXISTS public.identity_account_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id  UUID NOT NULL REFERENCES public.person_identities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_reason  public.identity_link_reason NOT NULL DEFAULT 'auto_created',
  linked_by    UUID,   -- admin uid, or NULL for system
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS identity_account_links_identity_idx
  ON public.identity_account_links(identity_id);

GRANT SELECT ON public.identity_account_links TO authenticated;
GRANT ALL    ON public.identity_account_links TO service_role;
ALTER TABLE public.identity_account_links ENABLE ROW LEVEL SECURITY;

-- ---------- identity_verification_attempts ----------
CREATE TABLE IF NOT EXISTS public.identity_verification_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id           UUID NOT NULL REFERENCES public.person_identities(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL DEFAULT 'sumsub',
  provider_applicant_id TEXT,
  level                 public.identity_level,
  status                public.identity_status NOT NULL DEFAULT 'pending',
  review_summary        JSONB NOT NULL DEFAULT '{}'::jsonb, -- redacted; no doc data
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ivp_identity_idx ON public.identity_verification_attempts(identity_id);

GRANT SELECT ON public.identity_verification_attempts TO authenticated;
GRANT ALL    ON public.identity_verification_attempts TO service_role;
ALTER TABLE public.identity_verification_attempts ENABLE ROW LEVEL SECURITY;

-- ---------- identity_webhook_events (service-role only) ----------
CREATE TABLE IF NOT EXISTS public.identity_webhook_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       TEXT NOT NULL DEFAULT 'sumsub',
  event_id       TEXT NOT NULL,
  event_type     TEXT,
  payload_hash   TEXT NOT NULL,
  signature_ok   BOOLEAN NOT NULL DEFAULT false,
  result         public.identity_webhook_result NOT NULL DEFAULT 'received',
  error          TEXT,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ,
  UNIQUE (provider, event_id)
);

GRANT ALL ON public.identity_webhook_events TO service_role;
ALTER TABLE public.identity_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies -> no access for anon/authenticated. Service role bypasses RLS.

-- ---------- updated_at triggers ----------
DROP TRIGGER IF EXISTS person_identities_touch ON public.person_identities;
CREATE TRIGGER person_identities_touch
  BEFORE UPDATE ON public.person_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS ivp_touch ON public.identity_verification_attempts;
CREATE TRIGGER ivp_touch
  BEFORE UPDATE ON public.identity_verification_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Helper: does the current user own this identity? ----------
CREATE OR REPLACE FUNCTION public.user_owns_identity(_identity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.identity_account_links
    WHERE identity_id = _identity_id AND user_id = auth.uid()
  );
$$;

-- ---------- RLS policies ----------

-- person_identities: users can read their own; admin/support can read all;
-- only service_role writes (no INSERT/UPDATE/DELETE policies for other roles).
CREATE POLICY "identity_self_read" ON public.person_identities
  FOR SELECT TO authenticated
  USING (public.user_owns_identity(id));

CREATE POLICY "identity_staff_read" ON public.person_identities
  FOR SELECT TO authenticated
  USING (public.is_admin_only(auth.uid()) OR public.is_support_agent(auth.uid()));

-- identity_account_links: user can read own link; staff read all; writes -> service_role only.
CREATE POLICY "link_self_read" ON public.identity_account_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "link_staff_read" ON public.identity_account_links
  FOR SELECT TO authenticated
  USING (public.is_admin_only(auth.uid()) OR public.is_support_agent(auth.uid()));

-- identity_verification_attempts: user reads own via ownership fn; staff read all.
CREATE POLICY "attempts_self_read" ON public.identity_verification_attempts
  FOR SELECT TO authenticated
  USING (public.user_owns_identity(identity_id));

CREATE POLICY "attempts_staff_read" ON public.identity_verification_attempts
  FOR SELECT TO authenticated
  USING (public.is_admin_only(auth.uid()) OR public.is_support_agent(auth.uid()));

-- ---------- Safe backfill for existing users ----------
-- Give every profile a placeholder unverified identity + link.
-- Idempotent: skips users who already have a link.
DO $$
DECLARE
  r RECORD;
  new_identity UUID;
BEGIN
  FOR r IN
    SELECT p.id AS user_id, p.country_code, (p.provider_id IS NOT NULL) AS is_provider
    FROM public.profiles p
    LEFT JOIN public.identity_account_links l ON l.user_id = p.id
    WHERE l.id IS NULL
  LOOP
    INSERT INTO public.person_identities (status, level, country_code)
    VALUES (
      'unverified'::public.identity_status,
      CASE WHEN r.is_provider THEN 'provider'::public.identity_level
           ELSE 'customer'::public.identity_level END,
      r.country_code
    )
    RETURNING id INTO new_identity;

    INSERT INTO public.identity_account_links (identity_id, user_id, link_reason)
    VALUES (new_identity, r.user_id, 'auto_created');
  END LOOP;
END $$;

-- ---------- Feature flags (all OFF) ----------
INSERT INTO public.feature_flags (flag_key, scope, target_id, enabled, rollout_pct, reason)
VALUES
  ('identity.enabled',                        'global', NULL, false, 0, 'stage1_seed'),
  ('identity.provider_verification_required', 'global', NULL, false, 0, 'stage1_seed'),
  ('identity.customer_verification_required', 'global', NULL, false, 0, 'stage1_seed'),
  ('identity.webhook_processing',             'global', NULL, false, 0, 'stage1_seed')
ON CONFLICT (flag_key, scope, target_id) DO NOTHING;
