-- Funds Release v7 - Step 1 (retry: feature_flags column names corrected)
--
-- REMEDIATION (Option B'): This migration was originally a 472-line monolithic
-- reconstruction of the v7 Funds Release schema. The modular v7 chain
--   20260722090000_v7_step1_finance_catalogues.sql
--   20260722090100_v7_step1_ledger_tables.sql
--   20260722090200_v7_step1_stripe_ingest_tables.sql
--   20260722090300_v7_step1_provider_balance_credit.sql
--   20260722090400_v7_step1_augment_existing_tables.sql
--   20260722090500_v7_step2_ledger_safeguards.sql
--   20260722090600_v7_step3_classification_ingest_core.sql
--   20260722090700_v7_step4_stripe_ingest_rpcs.sql
--   20260722090800_v7_step5_release_eligibility.sql
--   20260722090900_v7_step6_release_workflow.sql
-- already creates all 19 finance/ledger/stripe/payout tables, the 6 v7
-- enums, the reject_ledger_mutation() safeguard and per-table triggers,
-- the finance_accounts / finance_event_catalogue seed rows, the
-- bookings v7 augmentation, the funds_release.enabled feature flag,
-- and the deny-all RLS baseline on ledger/movement/allocation tables.
--
-- Re-executing that DDL on a fresh cluster fails with duplicate-type /
-- duplicate-relation errors and cascades into the two follow-on files
-- (20260723171605 and 20260723174020) that depend on
-- v_source_transfer_capacity, which in turn trips the Step-4b
-- "expected 6 ingestion RPCs" assertion because the internal-only
-- ingest functions never get their service_role REVOKE.
--
-- On the remote database this migration has already been applied
-- historically and its side effects are present. To make the chain
-- reproducible from scratch while keeping the schema byte-identical to
-- the remote, this file is reduced to the effects that are unique to
-- the monolith and NOT covered by any other migration in this chain:
--
--   1. VIEW  public.v_source_transfer_capacity
--   2. bookings.settled_reason              (text)
--   3. bookings.fee_reconciliation_overdue  (boolean NOT NULL DEFAULT false)
--   4. bookings.legacy_classification       (text)
--   5. FUNCTION public.bookings_payment_flow_version_immutable() + TRIGGER
--   6. country_configs augmentation (funds_release_enabled,
--      require_bank_payout_ready, provider_liability_policy)
--
-- Every statement below is idempotent (CREATE OR REPLACE, ADD COLUMN
-- IF NOT EXISTS, DROP TRIGGER IF EXISTS) so re-runs on the remote are
-- no-ops. GRANT/REVOKE on the view is intentionally NOT set here; it is
-- established by 20260723171605 (security_invoker + REVOKE PUBLIC/anon/
-- authenticated/service_role) and reasserted by 20260723174020.

-- 1. View: source-linked transfer capacity aggregation.
CREATE OR REPLACE VIEW public.v_source_transfer_capacity AS
SELECT source_charge_id, currency,
  COALESCE(SUM(gross_amount_minor) FILTER (WHERE event_kind = 'transfer_created'), 0)::bigint AS source_linked_gross_transfers_minor
FROM public.stripe_source_transfer_events
GROUP BY source_charge_id, currency;

-- 2-4. Extra booking columns not added by the modular 20260722090400 file.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS settled_reason              text,
  ADD COLUMN IF NOT EXISTS fee_reconciliation_overdue  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_classification       text;

-- 5. Immutability guard on bookings.payment_flow_version once assigned.
CREATE OR REPLACE FUNCTION public.bookings_payment_flow_version_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.payment_flow_version IS NOT NULL
     AND NEW.payment_flow_version IS DISTINCT FROM OLD.payment_flow_version THEN
    RAISE EXCEPTION 'bookings.payment_flow_version is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_payment_flow_version_immutable_trg ON public.bookings;
CREATE TRIGGER bookings_payment_flow_version_immutable_trg
  BEFORE UPDATE OF payment_flow_version ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_payment_flow_version_immutable();

-- 6. country_configs augmentation (originally in monolith lines 357-360).
--    Not added by any other migration; retained here to keep fresh schema
--    identical to remote.
ALTER TABLE public.country_configs
  ADD COLUMN IF NOT EXISTS funds_release_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_bank_payout_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_liability_policy jsonb   NOT NULL DEFAULT '{}'::jsonb;
