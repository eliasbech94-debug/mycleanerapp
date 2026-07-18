
-- Phase 2: Booking country/currency/config snapshots + invoice config_version linkage.
-- Business algorithms unchanged; only configuration sourcing prep and immutable snapshots.

-- 1. Booking snapshots (immutable once set; NULL only for legacy pre-Phase-2 rows).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS country_config_version integer,
  ADD COLUMN IF NOT EXISTS tax_config_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS commission_config_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS booking_rules_snapshot jsonb;

-- Backfill legacy rows so downstream code can rely on non-null values for new bookings.
UPDATE public.bookings
   SET country_code = COALESCE(country_code, 'DK'),
       timezone = COALESCE(timezone, 'Europe/Copenhagen')
 WHERE country_code IS NULL OR timezone IS NULL;

-- Enforce immutability of the snapshot + currency + country once written.
CREATE OR REPLACE FUNCTION public.bookings_freeze_snapshots()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.currency IS NOT NULL AND NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'bookings.currency is immutable';
    END IF;
    IF OLD.country_code IS NOT NULL AND NEW.country_code IS DISTINCT FROM OLD.country_code THEN
      RAISE EXCEPTION 'bookings.country_code is immutable';
    END IF;
    IF OLD.country_config_version IS NOT NULL AND NEW.country_config_version IS DISTINCT FROM OLD.country_config_version THEN
      RAISE EXCEPTION 'bookings.country_config_version is immutable';
    END IF;
    IF OLD.tax_config_snapshot IS NOT NULL AND NEW.tax_config_snapshot IS DISTINCT FROM OLD.tax_config_snapshot THEN
      RAISE EXCEPTION 'bookings.tax_config_snapshot is immutable';
    END IF;
    IF OLD.commission_config_snapshot IS NOT NULL AND NEW.commission_config_snapshot IS DISTINCT FROM OLD.commission_config_snapshot THEN
      RAISE EXCEPTION 'bookings.commission_config_snapshot is immutable';
    END IF;
    IF OLD.booking_rules_snapshot IS NOT NULL AND NEW.booking_rules_snapshot IS DISTINCT FROM OLD.booking_rules_snapshot THEN
      RAISE EXCEPTION 'bookings.booking_rules_snapshot is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS bookings_freeze_snapshots ON public.bookings;
CREATE TRIGGER bookings_freeze_snapshots
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_freeze_snapshots();

-- 2. Invoice / credit-note configuration lineage (which country config produced them).
ALTER TABLE public.platform_fee_invoices
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS country_config_version integer,
  ADD COLUMN IF NOT EXISTS tax_config_version integer;

ALTER TABLE public.platform_credit_notes
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS country_config_version integer,
  ADD COLUMN IF NOT EXISTS tax_config_version integer;

-- 3. Backward-compatible view exposing platform_tax_settings via country_configs.config,
--    keeping the physical table intact for at least one verified release cycle.
--    Reads may migrate to this view; writes still target the physical table until cutover.
CREATE OR REPLACE VIEW public.platform_tax_settings_v
WITH (security_invoker = true) AS
SELECT
  pts.id,
  pts.country_code,
  pts.legal_entity_name,
  pts.legal_entity_address,
  pts.tax_id,
  pts.vat_rate,
  pts.invoice_series_prefix,
  pts.next_invoice_number,
  pts.created_at,
  pts.updated_at,
  cc.config_version AS country_config_version,
  cc.status         AS country_config_status,
  cc.config         AS country_config_json
FROM public.platform_tax_settings pts
LEFT JOIN public.country_configs cc
  ON cc.iso = upper(pts.country_code) AND cc.status = 'published';

GRANT SELECT ON public.platform_tax_settings_v TO authenticated, service_role;

-- 4. Helper for edge functions: fetch published, launch-ready country config with row-level
--    guarantees. SECURITY DEFINER so callers cannot read draft rows they lack access to.
CREATE OR REPLACE FUNCTION public.get_published_country_config(_iso text)
RETURNS TABLE (
  iso text,
  active boolean,
  launch_status text,
  currency text,
  timezone text,
  default_language text,
  commission_bps integer,
  vat_rate_bps integer,
  config jsonb,
  config_version integer,
  published_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT cc.iso, cc.active, cc.launch_status, cc.currency, cc.timezone,
         cc.default_language, cc.commission_bps, cc.vat_rate_bps,
         cc.config, cc.config_version, cc.published_at
    FROM public.country_configs cc
   WHERE cc.iso = upper(_iso)
     AND cc.status = 'published'
   LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_published_country_config(text) TO authenticated, anon, service_role;
