-- =====================================================================
-- MILESTONE 1 — Campaign Engine (schema only)
-- Reusable engine. First consumer (Founding Provider) is seeded in a
-- later milestone. No user-facing surfaces are wired up in this file.
-- =====================================================================

-- ---------- Enums ----------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.campaign_kind AS ENUM (
    'provider_recruitment',
    'customer_promo',
    'referral',
    'seasonal',
    'launch'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_lifecycle AS ENUM (
    'draft',
    'scheduled',
    'pre_launch',
    'preview',
    'active',
    'paused',
    'ended',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_block_type AS ENUM (
    'hero','text','image','cards','benefits','testimonials',
    'faq','cta','countdown','counter','richtext'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_reward_type AS ENUM (
    'commission_discount','voucher','cash_bonus',
    'free_months','credits','points','campaign_badge'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_reward_grant_status AS ENUM (
    'active','expired','exhausted','revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_application_status AS ENUM (
    'pending','approved','rejected','waiting_list','withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_event_type AS ENUM (
    'landing_viewed','cta_clicked','application_started',
    'application_submitted','application_approved','application_rejected',
    'email_verified','stripe_connected','identity_verified',
    'first_booking','first_completed_job','first_payout',
    'campaign_completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Public lifecycle predicate (used by RLS + view).
CREATE OR REPLACE FUNCTION public.is_campaign_public(_lc public.campaign_lifecycle)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT _lc IN ('scheduled','pre_launch','preview','active') $$;

-- ---------- campaigns ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE
                          CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 80),
  kind                  public.campaign_kind NOT NULL,
  lifecycle             public.campaign_lifecycle NOT NULL DEFAULT 'draft',
  starts_at             timestamptz,
  ends_at               timestamptz,
  default_locale        text NOT NULL DEFAULT 'en',
  owner_role            text NOT NULL DEFAULT 'admin',

  -- Per-campaign feature toggles (all default OFF; per-country can further gate).
  enable_waiting_list   boolean NOT NULL DEFAULT false,
  enable_badges         boolean NOT NULL DEFAULT false,
  enable_rewards        boolean NOT NULL DEFAULT false,
  enable_referrals      boolean NOT NULL DEFAULT false,
  enable_testimonials   boolean NOT NULL DEFAULT false,
  enable_countdown      boolean NOT NULL DEFAULT false,
  enable_live_counter   boolean NOT NULL DEFAULT false,

  -- Reserved for future AI features (copy / translations / SEO / CTA / A/B).
  -- No implementation this sprint — shape kept open on purpose.
  ai_config             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_window_valid CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

GRANT SELECT ON public.campaigns TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_public_read" ON public.campaigns
  FOR SELECT TO anon, authenticated
  USING (public.is_campaign_public(lifecycle));

CREATE POLICY "campaigns_admin_read_all" ON public.campaigns
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "campaigns_admin_write" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-campaign sequence for assigning "Founding #N"-style numbers on approval.
-- Stored numeric so we don't spawn a real sequence per campaign.
-- Kept in a small helper table.
CREATE TABLE IF NOT EXISTS public.campaign_number_counters (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.campaign_number_counters TO authenticated;
GRANT ALL ON public.campaign_number_counters TO service_role;
ALTER TABLE public.campaign_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cnc_admin_read" ON public.campaign_number_counters
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- campaign_country_settings --------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_country_settings (
  campaign_id           uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  country_code          text NOT NULL,
  enabled               boolean NOT NULL DEFAULT true,
  title                 text,
  hero_headline         text,
  hero_subheadline      text,
  cta_primary_label     text,
  cta_secondary_label   text,
  badge_label           text,
  badge_emoji           text,
  badge_template        text,          -- e.g. "Founding #{n}"
  countdown_enabled     boolean NOT NULL DEFAULT false,
  countdown_target_at   timestamptz,
  max_applicants        integer,       -- NULL = unlimited
  waiting_list_enabled  boolean NOT NULL DEFAULT true,
  currency              text,
  seo_title             text,
  seo_description       text,
  seo_og_image_url      text,
  ai_config             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, country_code),
  CONSTRAINT ccs_max_applicants_nonneg CHECK (max_applicants IS NULL OR max_applicants >= 0)
);

GRANT SELECT ON public.campaign_country_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.campaign_country_settings TO authenticated;
GRANT ALL ON public.campaign_country_settings TO service_role;

ALTER TABLE public.campaign_country_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccs_public_read" ON public.campaign_country_settings
  FOR SELECT TO anon, authenticated
  USING (
    enabled = true
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_country_settings.campaign_id
        AND public.is_campaign_public(c.lifecycle)
    )
  );

CREATE POLICY "ccs_admin_read_all" ON public.campaign_country_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "ccs_admin_write" ON public.campaign_country_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_ccs_updated_at
  BEFORE UPDATE ON public.campaign_country_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Reusable public-content pattern ---------------------------
-- (page blocks, benefits, faq, testimonials, rewards all share shape:
--  campaign_id + optional country_code override + enabled + sort_order)

CREATE TABLE IF NOT EXISTS public.campaign_page_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  country_code  text,                   -- NULL = default for all countries
  sort_order    integer NOT NULL DEFAULT 0,
  block_type    public.campaign_block_type NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled       boolean NOT NULL DEFAULT true,
  ai_config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpb_campaign ON public.campaign_page_blocks(campaign_id, country_code, sort_order);

CREATE TABLE IF NOT EXISTS public.campaign_benefits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  country_code  text,
  sort_order    integer NOT NULL DEFAULT 0,
  icon          text,
  title         text NOT NULL,
  description   text,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cb_campaign ON public.campaign_benefits(campaign_id, country_code, sort_order);

CREATE TABLE IF NOT EXISTS public.campaign_faq (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  country_code  text,
  sort_order    integer NOT NULL DEFAULT 0,
  question      text NOT NULL,
  answer        text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cf_campaign ON public.campaign_faq(campaign_id, country_code, sort_order);

CREATE TABLE IF NOT EXISTS public.campaign_testimonials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  country_code  text,
  sort_order    integer NOT NULL DEFAULT 0,
  author        text NOT NULL,
  role_label    text,
  quote         text NOT NULL,
  avatar_url    text,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ct_campaign ON public.campaign_testimonials(campaign_id, country_code, sort_order);

CREATE TABLE IF NOT EXISTS public.campaign_rewards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  country_code   text,
  reward_type    public.campaign_reward_type NOT NULL,
  value_minor    bigint,
  value_percent  numeric(6,3),
  currency       text,
  duration_days  integer,
  cap_minor      bigint,
  description    text,
  enabled        boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cr_value_present CHECK (
    value_minor IS NOT NULL OR value_percent IS NOT NULL OR reward_type IN ('campaign_badge','points')
  )
);
CREATE INDEX IF NOT EXISTS idx_cr_campaign ON public.campaign_rewards(campaign_id, country_code);

-- Grants + RLS for all five (identical pattern).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaign_page_blocks','campaign_benefits','campaign_faq','campaign_testimonials','campaign_rewards']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format($f$
      CREATE POLICY "%1$s_public_read" ON public.%1$I
        FOR SELECT TO anon, authenticated
        USING (
          enabled = true
          AND EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = %1$I.campaign_id
              AND public.is_campaign_public(c.lifecycle)
          )
        )
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_read_all" ON public.%1$I
        FOR SELECT TO authenticated
        USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_write" ON public.%1$I
        FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
        WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
    $f$, t);

    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- ---------- campaign_applications ------------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_applications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id            uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  country_code           text NOT NULL,
  user_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Applicant fields
  full_name              text NOT NULL,
  company_name           text,
  email                  citext NOT NULL,
  phone                  text,
  city                   text,
  languages              text[] NOT NULL DEFAULT '{}',
  categories             text[] NOT NULL DEFAULT '{}',
  experience_years       integer,
  hourly_rate_minor      bigint,
  postal_codes           text[] NOT NULL DEFAULT '{}',
  profile_photo_path     text,
  company_logo_path      text,

  -- Attribution
  referral_code          text,
  referred_by            uuid REFERENCES public.campaign_applications(id) ON DELETE SET NULL,
  invite_source          text,
  utm_source             text,
  utm_medium             text,
  utm_campaign           text,
  heard_about            text,

  -- Consent
  accepted_terms_at      timestamptz,
  accepted_privacy_at    timestamptz,

  -- Email verification
  email_verification_token text,
  email_verified_at      timestamptz,

  -- Lifecycle
  status                 public.campaign_application_status NOT NULL DEFAULT 'pending',
  waiting_list_position  integer,
  assigned_number        integer,
  reviewed_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  rejection_reason       text,

  -- Fingerprint
  ip                     text,
  user_agent             text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ca_experience_nonneg CHECK (experience_years IS NULL OR experience_years >= 0),
  CONSTRAINT ca_hourly_nonneg     CHECK (hourly_rate_minor IS NULL OR hourly_rate_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ca_campaign_status ON public.campaign_applications(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ca_country         ON public.campaign_applications(campaign_id, country_code, status);
CREATE INDEX IF NOT EXISTS idx_ca_user            ON public.campaign_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_email           ON public.campaign_applications(campaign_id, email);
CREATE INDEX IF NOT EXISTS idx_ca_created         ON public.campaign_applications(campaign_id, created_at DESC);

-- Duplicate prevention (per campaign).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ca_campaign_email
  ON public.campaign_applications (campaign_id, lower(email::text));
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ca_campaign_company
  ON public.campaign_applications (campaign_id, lower(company_name))
  WHERE company_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ca_campaign_number
  ON public.campaign_applications (campaign_id, assigned_number)
  WHERE assigned_number IS NOT NULL;

GRANT INSERT ON public.campaign_applications TO anon, authenticated;
GRANT SELECT, UPDATE ON public.campaign_applications TO authenticated;
GRANT ALL ON public.campaign_applications TO service_role;

ALTER TABLE public.campaign_applications ENABLE ROW LEVEL SECURITY;

-- Public may insert; server-side edge fn enforces Turnstile + rate limits.
CREATE POLICY "ca_public_insert" ON public.campaign_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Owner may read/withdraw their own application.
CREATE POLICY "ca_owner_read" ON public.campaign_applications
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "ca_owner_update" ON public.campaign_applications
  FOR UPDATE TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "ca_admin_read_all" ON public.campaign_applications
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'support')
  );

CREATE POLICY "ca_admin_write" ON public.campaign_applications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_ca_updated_at
  BEFORE UPDATE ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Classify new applications (pending vs waiting_list) atomically.
CREATE OR REPLACE FUNCTION public.campaign_application_classify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_wl_enabled boolean;
  v_current integer;
  v_next_wl integer;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT ccs.max_applicants, COALESCE(ccs.waiting_list_enabled, true)
    INTO v_max, v_wl_enabled
    FROM public.campaign_country_settings ccs
    WHERE ccs.campaign_id = NEW.campaign_id
      AND ccs.country_code = NEW.country_code
    FOR UPDATE;

  IF v_max IS NULL THEN
    RETURN NEW;   -- unlimited
  END IF;

  SELECT count(*) INTO v_current
    FROM public.campaign_applications ca
    WHERE ca.campaign_id = NEW.campaign_id
      AND ca.country_code = NEW.country_code
      AND ca.status IN ('pending','approved');

  IF v_current >= v_max THEN
    IF NOT v_wl_enabled THEN
      RAISE EXCEPTION 'campaign_capacity_reached'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(max(waiting_list_position), 0) + 1
      INTO v_next_wl
      FROM public.campaign_applications
      WHERE campaign_id = NEW.campaign_id
        AND country_code = NEW.country_code
        AND status = 'waiting_list';
    NEW.status := 'waiting_list';
    NEW.waiting_list_position := v_next_wl;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_ca_classify
  BEFORE INSERT ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.campaign_application_classify();

-- Assign sequential number on transition to approved.
CREATE OR REPLACE FUNCTION public.campaign_application_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_next integer;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.assigned_number IS NULL THEN
    INSERT INTO public.campaign_number_counters(campaign_id, last_number)
      VALUES (NEW.campaign_id, 1)
      ON CONFLICT (campaign_id) DO UPDATE
        SET last_number = public.campaign_number_counters.last_number + 1
      RETURNING last_number INTO v_next;
    NEW.assigned_number := v_next;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ca_assign_number
  BEFORE UPDATE ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.campaign_application_assign_number();

-- ---------- campaign_reward_grants ------------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_reward_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.campaign_applications(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reward_id      uuid NOT NULL REFERENCES public.campaign_rewards(id) ON DELETE RESTRICT,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  consumed_minor bigint NOT NULL DEFAULT 0,
  remaining_minor bigint,
  status         public.campaign_reward_grant_status NOT NULL DEFAULT 'active',
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crg_user ON public.campaign_reward_grants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_crg_application ON public.campaign_reward_grants(application_id);

GRANT SELECT ON public.campaign_reward_grants TO authenticated;
GRANT ALL ON public.campaign_reward_grants TO service_role;

ALTER TABLE public.campaign_reward_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crg_owner_read" ON public.campaign_reward_grants
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "crg_admin_all" ON public.campaign_reward_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_crg_updated_at
  BEFORE UPDATE ON public.campaign_reward_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- campaign_events (analytics) ------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_events (
  id             bigserial PRIMARY KEY,
  campaign_id    uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.campaign_applications(id) ON DELETE SET NULL,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type     public.campaign_event_type NOT NULL,
  country_code   text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id     text,
  ip             text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ce_campaign_type_created
  ON public.campaign_events(campaign_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_application ON public.campaign_events(application_id);

GRANT SELECT ON public.campaign_events TO authenticated;
GRANT ALL ON public.campaign_events TO service_role;

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ce_admin_read" ON public.campaign_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'support')
  );

-- No public writes: events are written by edge functions using the service role.

-- ---------- campaign_apply_attempts (ad-hoc rate limit) --------------

CREATE TABLE IF NOT EXISTS public.campaign_apply_attempts (
  id             bigserial PRIMARY KEY,
  campaign_id    uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ip             text,
  email          citext,
  outcome        text NOT NULL,   -- accepted | rejected | rate_limited | duplicate | turnstile_failed
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_caa_ip_created ON public.campaign_apply_attempts(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caa_email_created ON public.campaign_apply_attempts(email, created_at DESC);

GRANT ALL ON public.campaign_apply_attempts TO service_role;
ALTER TABLE public.campaign_apply_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caa_admin_read" ON public.campaign_apply_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- campaign_counters view ------------------------------------
-- Aggregates only — safe to expose publicly for the live counter widget.

CREATE OR REPLACE VIEW public.campaign_counters
WITH (security_invoker = true)
AS
SELECT
  c.id                                                                        AS campaign_id,
  ccs.country_code                                                            AS country_code,
  count(*) FILTER (WHERE ca.status = 'approved')::int                         AS approved_count,
  count(*) FILTER (WHERE ca.status = 'pending')::int                          AS pending_count,
  count(*) FILTER (WHERE ca.status = 'waiting_list')::int                     AS waiting_list_count,
  count(ca.id)::int                                                           AS total_count,
  ccs.max_applicants                                                          AS max_applicants,
  CASE
    WHEN ccs.max_applicants IS NULL THEN NULL
    ELSE GREATEST(ccs.max_applicants
      - count(*) FILTER (WHERE ca.status IN ('approved','pending')), 0)::int
  END                                                                         AS remaining,
  CASE
    WHEN ccs.max_applicants IS NULL THEN false
    ELSE count(*) FILTER (WHERE ca.status IN ('approved','pending')) >= ccs.max_applicants
  END                                                                         AS is_full
FROM public.campaigns c
JOIN public.campaign_country_settings ccs ON ccs.campaign_id = c.id
LEFT JOIN public.campaign_applications ca
  ON ca.campaign_id = ccs.campaign_id
 AND ca.country_code = ccs.country_code
GROUP BY c.id, ccs.country_code, ccs.max_applicants;

GRANT SELECT ON public.campaign_counters TO anon, authenticated;

-- ---------- Feature flag (disabled) ----------------------------------

INSERT INTO public.feature_flags (flag_key, scope, enabled, reason)
SELECT 'campaigns.enabled', 'global', false, 'Master switch for the Campaign Engine (landing + admin). Disabled until Milestone 4.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags WHERE flag_key = 'campaigns.enabled' AND scope = 'global'
);
