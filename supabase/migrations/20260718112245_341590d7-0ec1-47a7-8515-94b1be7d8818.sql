
-- Phase 3 foundation

-- 1. Immutable version history for country configs
CREATE TABLE IF NOT EXISTS public.country_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso text NOT NULL,
  config_version integer NOT NULL,
  snapshot jsonb NOT NULL,
  change_summary text,
  validation_result jsonb,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  UNIQUE (iso, config_version)
);
CREATE INDEX IF NOT EXISTS ix_ccv_iso ON public.country_config_versions(iso, published_at DESC);

GRANT SELECT ON public.country_config_versions TO authenticated;
GRANT ALL ON public.country_config_versions TO service_role;
ALTER TABLE public.country_config_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ccv_admin_read ON public.country_config_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Block direct client writes; only trigger / service_role writes
CREATE OR REPLACE FUNCTION public.country_config_versions_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'country_config_versions is append-only via publish trigger';
END; $$;
DROP TRIGGER IF EXISTS trg_ccv_immutable ON public.country_config_versions;
CREATE TRIGGER trg_ccv_immutable
  BEFORE UPDATE OR DELETE ON public.country_config_versions
  FOR EACH ROW EXECUTE FUNCTION public.country_config_versions_immutable();

-- 2. Holiday calendar
CREATE TABLE IF NOT EXISTS public.country_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  holiday_date date NOT NULL,
  name text NOT NULL,
  surcharge_eligible boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'admin',
  year integer GENERATED ALWAYS AS (EXTRACT(YEAR FROM holiday_date)::int) STORED,
  region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, holiday_date, region)
);
CREATE INDEX IF NOT EXISTS ix_holidays_country_year ON public.country_holidays(country_code, year);

GRANT SELECT ON public.country_holidays TO authenticated, anon;
GRANT ALL ON public.country_holidays TO service_role;
ALTER TABLE public.country_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY holidays_public_read ON public.country_holidays
  FOR SELECT USING (active = true);

CREATE POLICY holidays_admin_all ON public.country_holidays
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_holidays_updated_at
  BEFORE UPDATE ON public.country_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Admin edit locks (concurrency)
CREATE TABLE IF NOT EXISTS public.admin_country_locks (
  iso text PRIMARY KEY,
  locked_by uuid NOT NULL,
  locked_by_email text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_country_locks TO authenticated;
GRANT ALL ON public.admin_country_locks TO service_role;
ALTER TABLE public.admin_country_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY locks_admin_all ON public.admin_country_locks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Extend country_configs with booking + pricing rule inputs
ALTER TABLE public.country_configs
  ADD COLUMN IF NOT EXISTS booking_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pricing_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. Extend legal_documents with scheduling + presentation metadata
ALTER TABLE public.legal_documents
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS summary_md text,
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fallback_to_english boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;

-- One effective published version per (kind, country, language) at any time
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_effective_published
  ON public.legal_documents (kind, country_code, language)
  WHERE status = 'published';

-- 6. Publish trigger for country_configs — snapshot on transition to published,
-- and enforce optimistic concurrency via config_version.
CREATE OR REPLACE FUNCTION public.country_configs_publish_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Optimistic concurrency: if the row is being mutated, the incoming
  -- config_version must match the stored one (client must round-trip it).
  IF TG_OP = 'UPDATE' AND NEW.config_version <> OLD.config_version
     AND NOT (OLD.status = 'draft' AND NEW.status = 'published') THEN
    RAISE EXCEPTION 'country_config_conflict: version % expected, got %',
      OLD.config_version, NEW.config_version;
  END IF;

  -- On publish transition, bump version and snapshot.
  IF (TG_OP = 'INSERT' AND NEW.status = 'published')
     OR (TG_OP = 'UPDATE' AND OLD.status <> 'published' AND NEW.status = 'published') THEN
    NEW.config_version := COALESCE(OLD.config_version, 0) + 1;
    NEW.published_at := now();
    NEW.published_by := COALESCE(NEW.published_by, auth.uid());

    INSERT INTO public.country_config_versions (
      iso, config_version, snapshot, published_by, published_at
    ) VALUES (
      NEW.iso, NEW.config_version, to_jsonb(NEW), NEW.published_by, NEW.published_at
    );
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_country_configs_publish ON public.country_configs;
CREATE TRIGGER trg_country_configs_publish
  BEFORE INSERT OR UPDATE ON public.country_configs
  FOR EACH ROW EXECUTE FUNCTION public.country_configs_publish_snapshot();

-- 7. Authoritative status lookup — always fresh, used by payment/booking/invoice
CREATE OR REPLACE FUNCTION public.is_country_launch_ready(_iso text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.country_configs
    WHERE iso = upper(_iso)
      AND active = true
      AND status = 'published'
      AND launch_status IN ('launch_ready','active')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_country_launch_ready(text) TO anon, authenticated, service_role;
