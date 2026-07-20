
-- =========================================================
-- Provider onboarding & dashboard — Step 1: schema foundation
-- =========================================================

-- 1. ENUMS -------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.provider_status AS ENUM (
    'draft','pending_identity','pending_stripe','pending_review',
    'active','paused','suspended','rejected','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_tier AS ENUM (
    'new','verified','experienced','top_rated','elite','partner'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_visibility AS ENUM ('hidden','public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. provider_profiles ------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_profiles (
  user_id                   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Editable-by-provider profile data
  display_name              text,
  headline                  text,
  bio                       text,
  photo_path                text,                          -- storage object path (private bucket)
  languages                 text[]      NOT NULL DEFAULT '{}',
  years_experience          smallint,
  hourly_rate               integer,                       -- minor units, country currency
  service_categories        text[]      NOT NULL DEFAULT '{}',
  service_area_radius_km    smallint,
  emergency_contact         jsonb,                         -- private, never exposed publicly

  -- Base address (only writable through validation trigger)
  base_address_place_id     text,
  base_address_formatted    text,
  base_country_code         text,
  base_lat                  double precision,
  base_lng                  double precision,
  base_validation_source    text,                          -- 'dawa' | 'google'

  -- Date of birth (single source of truth for age)
  date_of_birth             date,

  -- Insurance (private storage path)
  insurance_doc_path        text,
  insurance_policy_number   text,
  insurance_expires_on      date,

  -- Lifecycle (server-controlled)
  status                    public.provider_status NOT NULL DEFAULT 'draft',
  visibility                public.provider_visibility NOT NULL DEFAULT 'hidden',
  terms_accepted_at         timestamptz,
  submitted_at              timestamptz,
  approved_at               timestamptz,
  approved_by               uuid,
  activated_at              timestamptz,
  suspended_at              timestamptz,
  suspended_by              uuid,
  rejected_at               timestamptz,
  rejected_reason           text,
  archived_at               timestamptz,
  archived_by               uuid,

  -- Derived from external systems (server-controlled)
  identity_status           text        NOT NULL DEFAULT 'not_started',
  stripe_charges_enabled    boolean     NOT NULL DEFAULT false,
  stripe_payouts_enabled    boolean     NOT NULL DEFAULT false,
  stripe_details_submitted  boolean     NOT NULL DEFAULT false,
  stripe_requirements_due   text[]      NOT NULL DEFAULT '{}',
  stripe_disabled_reason    text,
  payout_frozen             boolean     NOT NULL DEFAULT false,
  payout_frozen_reason      text,

  -- Score & tier (server-controlled)
  provider_score            smallint    NOT NULL DEFAULT 0,
  provider_tier             public.provider_tier NOT NULL DEFAULT 'new',
  tier_is_manual            boolean     NOT NULL DEFAULT false,
  tier_calculated_at        timestamptz,
  scoring_config_version    integer,

  -- Internal trust & safety (never exposed publicly)
  trust_score               smallint    NOT NULL DEFAULT 100,
  trust_flags               jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Performance cache (server-controlled)
  performance_snapshot      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  completion_pct            smallint    NOT NULL DEFAULT 0,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Grants: authenticated may INSERT/SELECT/UPDATE own row (RLS + column privs restrict UPDATE further).
GRANT SELECT, INSERT, UPDATE ON public.provider_profiles TO authenticated;
GRANT ALL ON public.provider_profiles TO service_role;

-- Column-level UPDATE: revoke everything, then re-grant only editable columns.
REVOKE UPDATE ON public.provider_profiles FROM authenticated;
GRANT UPDATE (
  display_name, headline, bio, photo_path, languages, years_experience,
  hourly_rate, service_categories, service_area_radius_km, emergency_contact,
  base_address_place_id, base_address_formatted, base_country_code,
  base_lat, base_lng, base_validation_source,
  date_of_birth, insurance_doc_path, insurance_policy_number, insurance_expires_on,
  terms_accepted_at
) ON public.provider_profiles TO authenticated;

ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;

-- Owner select
CREATE POLICY "provider_profiles_owner_select"
  ON public.provider_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admin select (reuse existing is_admin_only)
CREATE POLICY "provider_profiles_admin_select"
  ON public.provider_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin_only(auth.uid()));

-- Owner update: cannot change forbidden columns (WITH CHECK pins them to OLD via column privs above;
-- extra defense: reject any change to lifecycle columns even if privileges are widened by mistake).
CREATE POLICY "provider_profiles_owner_update"
  ON public.provider_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status <> 'archived')
  WITH CHECK (user_id = auth.uid());

-- No direct INSERT / DELETE for users: routed through SECURITY DEFINER functions (added in step 2).
-- service_role always bypasses RLS.

CREATE INDEX IF NOT EXISTS idx_provider_profiles_status ON public.provider_profiles(status);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_tier   ON public.provider_profiles(provider_tier);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_visibility ON public.provider_profiles(visibility)
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_provider_profiles_country ON public.provider_profiles(base_country_code);

CREATE TRIGGER trg_provider_profiles_updated_at
  BEFORE UPDATE ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Guard: block forbidden column changes even if column privileges are ever widened.
CREATE OR REPLACE FUNCTION public.provider_profiles_block_privileged_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_only(auth.uid()) THEN
    RETURN NEW;  -- admin writes still go via edge functions, but this trigger doesn't fight them
  END IF;

  IF NEW.status              IS DISTINCT FROM OLD.status
   OR NEW.visibility         IS DISTINCT FROM OLD.visibility
   OR NEW.approved_at        IS DISTINCT FROM OLD.approved_at
   OR NEW.approved_by        IS DISTINCT FROM OLD.approved_by
   OR NEW.activated_at       IS DISTINCT FROM OLD.activated_at
   OR NEW.suspended_at       IS DISTINCT FROM OLD.suspended_at
   OR NEW.suspended_by       IS DISTINCT FROM OLD.suspended_by
   OR NEW.rejected_at        IS DISTINCT FROM OLD.rejected_at
   OR NEW.rejected_reason    IS DISTINCT FROM OLD.rejected_reason
   OR NEW.archived_at        IS DISTINCT FROM OLD.archived_at
   OR NEW.archived_by        IS DISTINCT FROM OLD.archived_by
   OR NEW.submitted_at       IS DISTINCT FROM OLD.submitted_at
   OR NEW.identity_status    IS DISTINCT FROM OLD.identity_status
   OR NEW.stripe_charges_enabled   IS DISTINCT FROM OLD.stripe_charges_enabled
   OR NEW.stripe_payouts_enabled   IS DISTINCT FROM OLD.stripe_payouts_enabled
   OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted
   OR NEW.stripe_requirements_due  IS DISTINCT FROM OLD.stripe_requirements_due
   OR NEW.stripe_disabled_reason   IS DISTINCT FROM OLD.stripe_disabled_reason
   OR NEW.payout_frozen      IS DISTINCT FROM OLD.payout_frozen
   OR NEW.payout_frozen_reason IS DISTINCT FROM OLD.payout_frozen_reason
   OR NEW.provider_score     IS DISTINCT FROM OLD.provider_score
   OR NEW.provider_tier      IS DISTINCT FROM OLD.provider_tier
   OR NEW.tier_is_manual     IS DISTINCT FROM OLD.tier_is_manual
   OR NEW.tier_calculated_at IS DISTINCT FROM OLD.tier_calculated_at
   OR NEW.scoring_config_version IS DISTINCT FROM OLD.scoring_config_version
   OR NEW.trust_score        IS DISTINCT FROM OLD.trust_score
   OR NEW.trust_flags        IS DISTINCT FROM OLD.trust_flags
   OR NEW.performance_snapshot IS DISTINCT FROM OLD.performance_snapshot
   OR NEW.completion_pct     IS DISTINCT FROM OLD.completion_pct THEN
    RAISE EXCEPTION 'provider_profiles_privileged_column_write_forbidden';
  END IF;

  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_provider_profiles_block_privileged
  BEFORE UPDATE ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.provider_profiles_block_privileged_update();

-- Address validation trigger (mirrors enforce_address_country pattern)
CREATE OR REPLACE FUNCTION public.provider_profiles_enforce_base_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_country text;
  v_val record;
  v_changed boolean;
BEGIN
  SELECT country_code INTO v_country FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.base_address_place_id IS NULL THEN
    NEW.base_address_formatted := NULL;
    NEW.base_country_code := NULL;
    NEW.base_lat := NULL;
    NEW.base_lng := NULL;
    NEW.base_validation_source := NULL;
    RETURN NEW;
  END IF;

  v_changed := (TG_OP = 'INSERT')
    OR (OLD.base_address_place_id IS DISTINCT FROM NEW.base_address_place_id);

  IF v_changed THEN
    IF v_country IS NULL THEN
      RAISE EXCEPTION 'profile_country_missing: set your country before saving a base address';
    END IF;

    SELECT * INTO v_val
      FROM public.place_validations
     WHERE user_id = NEW.user_id
       AND place_id = NEW.base_address_place_id
       AND validated_at > now() - interval '30 minutes'
     ORDER BY validated_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'address_not_validated: base address was not validated server-side; pick a suggestion again';
    END IF;

    IF upper(v_val.country_code) <> upper(v_country) THEN
      RAISE EXCEPTION 'address_country_mismatch: address is in % but your profile country is %',
        v_val.country_code, v_country;
    END IF;

    NEW.base_address_formatted := v_val.formatted_address;
    NEW.base_lat := v_val.lat;
    NEW.base_lng := v_val.lng;
    NEW.base_country_code := upper(v_val.country_code);
    NEW.base_validation_source := COALESCE(NEW.base_validation_source, 'dawa');
  END IF;

  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_provider_profiles_enforce_base_address
  BEFORE INSERT OR UPDATE OF base_address_place_id ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.provider_profiles_enforce_base_address();

-- Minimum age (18) enforced server-side.
CREATE OR REPLACE FUNCTION public.provider_profiles_enforce_min_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.date_of_birth IS NOT NULL
     AND NEW.date_of_birth > (current_date - interval '18 years')::date THEN
    RAISE EXCEPTION 'provider_min_age_18';
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_provider_profiles_min_age
  BEFORE INSERT OR UPDATE OF date_of_birth ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.provider_profiles_enforce_min_age();


-- 3. provider_score_history --------------------------------

CREATE TABLE IF NOT EXISTS public.provider_score_history (
  id                    bigserial PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_score        smallint NOT NULL,
  provider_tier         public.provider_tier NOT NULL,
  trust_score           smallint,
  scoring_config_version integer NOT NULL,
  metrics_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  breakdown             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- per-metric contribution (for explainer)
  reason                text NOT NULL,                        -- 'booking_completed' | 'review_added' | 'stripe_webhook' | 'admin_recalc' | 'nightly' | 'config_change' | ...
  calculated_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_score_history TO authenticated;
GRANT ALL ON public.provider_score_history TO service_role;

ALTER TABLE public.provider_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_score_history_owner_select"
  ON public.provider_score_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "provider_score_history_admin_select"
  ON public.provider_score_history FOR SELECT
  TO authenticated
  USING (public.is_admin_only(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_provider_score_history_user_time
  ON public.provider_score_history(user_id, calculated_at DESC);

-- Append-only
CREATE OR REPLACE FUNCTION public.provider_score_history_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN RAISE EXCEPTION 'provider_score_history is append-only'; END $fn$;

CREATE TRIGGER trg_provider_score_history_no_update
  BEFORE UPDATE OR DELETE ON public.provider_score_history
  FOR EACH ROW EXECUTE FUNCTION public.provider_score_history_append_only();


-- 4. provider_scoring_config (versioned) -------------------

CREATE TABLE IF NOT EXISTS public.provider_scoring_config (
  config_version   integer PRIMARY KEY,
  is_active        boolean NOT NULL DEFAULT false,
  weights          jsonb   NOT NULL,
  normalizers      jsonb   NOT NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_scoring_config_active
  ON public.provider_scoring_config(is_active) WHERE is_active = true;

GRANT SELECT ON public.provider_scoring_config TO authenticated;
GRANT ALL ON public.provider_scoring_config TO service_role;

ALTER TABLE public.provider_scoring_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_scoring_config_all_read"
  ON public.provider_scoring_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "provider_scoring_config_admin_write"
  ON public.provider_scoring_config FOR ALL
  TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

INSERT INTO public.provider_scoring_config (config_version, is_active, weights, normalizers, notes)
VALUES (
  1, true,
  jsonb_build_object(
    'rating',                25,
    'completed_bookings',    15,
    'response_time',         10,
    'acceptance_rate',       10,
    'completion_rate',       10,
    'cancellation_rate',     10,
    'repeat_customer_rate',  10,
    'complaints',             5,
    'account_age',            2,
    'identity',               2,
    'stripe',                 1
  ),
  jsonb_build_object(
    'rating',               jsonb_build_object('min', 3.0,  'max', 5.0),
    'completed_bookings',   jsonb_build_object('min', 0,    'target', 500),
    'response_time',        jsonb_build_object('best_minutes', 5, 'worst_minutes', 240),
    'acceptance_rate',      jsonb_build_object('min', 0.5,  'max', 1.0),
    'completion_rate',      jsonb_build_object('min', 0.7,  'max', 1.0),
    'cancellation_rate',    jsonb_build_object('best', 0.0, 'worst', 0.20),
    'repeat_customer_rate', jsonb_build_object('min', 0.0,  'target', 0.50),
    'complaints',           jsonb_build_object('best', 0,   'worst', 10),
    'account_age',          jsonb_build_object('min_days', 0, 'target_days', 730),
    'identity',             jsonb_build_object('required', true),
    'stripe',               jsonb_build_object('required', true)
  ),
  'Initial scoring configuration (Architecture v3).'
);


-- 5. provider_trust_config (separate from public score) ----

CREATE TABLE IF NOT EXISTS public.provider_trust_config (
  config_version   integer PRIMARY KEY,
  is_active        boolean NOT NULL DEFAULT false,
  weights          jsonb   NOT NULL,
  thresholds       jsonb   NOT NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_trust_config_active
  ON public.provider_trust_config(is_active) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_trust_config TO authenticated;
GRANT ALL ON public.provider_trust_config TO service_role;

ALTER TABLE public.provider_trust_config ENABLE ROW LEVEL SECURITY;

-- Trust config is admin-only, including read.
CREATE POLICY "provider_trust_config_admin_all"
  ON public.provider_trust_config FOR ALL
  TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

INSERT INTO public.provider_trust_config (config_version, is_active, weights, thresholds, notes)
VALUES (
  1, true,
  jsonb_build_object(
    'chargebacks',            30,
    'disputes',               20,
    'refund_requests',        10,
    'complaints',             15,
    'identity_reverifications', 5,
    'account_age',             5,
    'device_reuse',           10,
    'address_changes',         5
  ),
  jsonb_build_object(
    'auto_flag_below', 60,
    'auto_freeze_below', 30
  ),
  'Initial trust & safety configuration (internal, never public).'
);


-- 6. provider_tier_rules -----------------------------------

CREATE TABLE IF NOT EXISTS public.provider_tier_rules (
  tier                        public.provider_tier PRIMARY KEY,
  priority                    smallint NOT NULL,               -- higher wins
  min_completed               integer  NOT NULL DEFAULT 0,
  min_rating                  numeric(3,2),
  max_cancellation_rate       numeric(4,3),
  min_completion_rate         numeric(4,3),
  min_repeat_customer_rate    numeric(4,3),
  require_identity            boolean  NOT NULL DEFAULT false,
  require_stripe              boolean  NOT NULL DEFAULT false,
  require_email               boolean  NOT NULL DEFAULT false,
  require_phone               boolean  NOT NULL DEFAULT false,
  require_no_trust_flags      boolean  NOT NULL DEFAULT false,
  manual_only                 boolean  NOT NULL DEFAULT false,
  notes                       text,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_tier_rules TO authenticated;
GRANT ALL ON public.provider_tier_rules TO service_role;

ALTER TABLE public.provider_tier_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_tier_rules_all_read"
  ON public.provider_tier_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "provider_tier_rules_admin_write"
  ON public.provider_tier_rules FOR ALL
  TO authenticated
  USING (public.is_admin_only(auth.uid()))
  WITH CHECK (public.is_admin_only(auth.uid()));

INSERT INTO public.provider_tier_rules
  (tier, priority, min_completed, min_rating, max_cancellation_rate, min_completion_rate,
   min_repeat_customer_rate, require_identity, require_stripe, require_email, require_phone,
   require_no_trust_flags, manual_only, notes)
VALUES
  ('new',        10,   0, NULL,  NULL,  NULL,  NULL,  false, false, false, false, false, false, 'Default for new providers'),
  ('verified',   20,  10, 4.50,  NULL,  NULL,  NULL,  true,  true,  true,  true,  false, false, 'Identity+Stripe+email+phone verified with initial track record'),
  ('experienced',30,  50, 4.70, 0.050, 0.950, NULL,  true,  true,  true,  true,  false, false, '50+ jobs, <5% cancellation, >95% completion'),
  ('top_rated',  40, 150, 4.80, 0.030, NULL,  0.250, true,  true,  true,  true,  true,  false, '150+ jobs, 4.8+, <3% cancellation, >25% repeat customers'),
  ('elite',      50, 500, 4.90, 0.020, NULL,  0.400, true,  true,  true,  true,  true,  false, '500+ jobs, 4.9+, <2% cancellation, >40% repeat, no trust flags'),
  ('partner',    99,   0, NULL,  NULL,  NULL,  NULL,  false, false, false, false, false, true,  'Manually assigned by MyCleaner')
ON CONFLICT (tier) DO UPDATE SET
  priority = EXCLUDED.priority,
  min_completed = EXCLUDED.min_completed,
  min_rating = EXCLUDED.min_rating,
  max_cancellation_rate = EXCLUDED.max_cancellation_rate,
  min_completion_rate = EXCLUDED.min_completion_rate,
  min_repeat_customer_rate = EXCLUDED.min_repeat_customer_rate,
  require_identity = EXCLUDED.require_identity,
  require_stripe = EXCLUDED.require_stripe,
  require_email = EXCLUDED.require_email,
  require_phone = EXCLUDED.require_phone,
  require_no_trust_flags = EXCLUDED.require_no_trust_flags,
  manual_only = EXCLUDED.manual_only,
  notes = EXCLUDED.notes,
  updated_at = now();


-- 7. provider_admin_actions (audit for lifecycle transitions) ----

CREATE TABLE IF NOT EXISTS public.provider_admin_actions (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id      uuid,
  action        text NOT NULL,           -- 'approve'|'reject'|'suspend'|'reinstate'|'archive'|'restore'|'assign_partner'|'revoke_partner'|'recalc_score'|'freeze_payout'|'unfreeze_payout'
  from_status   public.provider_status,
  to_status     public.provider_status,
  reason        text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_admin_actions TO authenticated;
GRANT ALL ON public.provider_admin_actions TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_admin_actions_idem
  ON public.provider_admin_actions(user_id, action, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_admin_actions_user_time
  ON public.provider_admin_actions(user_id, created_at DESC);

ALTER TABLE public.provider_admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_admin_actions_admin_read"
  ON public.provider_admin_actions FOR SELECT
  TO authenticated
  USING (public.is_admin_only(auth.uid()));

CREATE POLICY "provider_admin_actions_owner_read"
  ON public.provider_admin_actions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Append-only for non-service_role
CREATE OR REPLACE FUNCTION public.provider_admin_actions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'provider_admin_actions is append-only';
END $fn$;

CREATE TRIGGER trg_provider_admin_actions_no_mutate
  BEFORE UPDATE OR DELETE ON public.provider_admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.provider_admin_actions_append_only();

