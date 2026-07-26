
-- Funds Release v7 - Step 1 (retry: feature_flags column names corrected)

CREATE TYPE public.booking_payment_flow_version AS ENUM ('destination_charge_v1','separate_charges_v1');
CREATE TYPE public.booking_payout_status AS ENUM (
  'pending','eligible','attempting','retry_pending','transferred',
  'partially_reversed','fully_reversed','settled_no_transfer',
  'needs_review','frozen','disputed'
);
CREATE TYPE public.transfer_funding_mode AS ENUM ('source_linked','platform_unlinked');
CREATE TYPE public.provider_balance_movement_type AS ENUM (
  'debt_increase','debt_decrease','credit_increase','credit_decrease','credit_to_debt_offset'
);
CREATE TYPE public.ledger_entry_direction AS ENUM ('debit','credit');
CREATE TYPE public.finance_account_class AS ENUM (
  'asset','liability','revenue','expense','clearing','contra_revenue','contra_liability','suspense'
);

CREATE TABLE public.finance_accounts (
  code text PRIMARY KEY,
  account_class public.finance_account_class NOT NULL,
  scope_keys text[] NOT NULL DEFAULT '{}',
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  reserved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_event_catalogue (
  event_type text PRIMARY KEY,
  idempotency_shape text NOT NULL,
  multi_leg_accounts text[] NOT NULL DEFAULT '{}',
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  reserved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL REFERENCES public.finance_event_catalogue(event_type),
  event_id text NOT NULL,
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  memo text, posted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'internal', raw jsonb,
  UNIQUE (event_type, event_id)
);
CREATE INDEX ledger_transactions_booking_idx ON public.ledger_transactions(booking_id);
CREATE INDEX ledger_transactions_provider_idx ON public.ledger_transactions(provider_user_id);
CREATE INDEX ledger_transactions_posted_at_idx ON public.ledger_transactions(posted_at);

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT,
  account text NOT NULL REFERENCES public.finance_accounts(code),
  direction public.ledger_entry_direction NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  booking_id uuid, provider_user_id uuid,
  leg_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_tx_idx ON public.ledger_entries(transaction_id);
CREATE INDEX ledger_entries_account_idx ON public.ledger_entries(account);
CREATE INDEX ledger_entries_booking_idx ON public.ledger_entries(booking_id);
CREATE INDEX ledger_entries_provider_idx ON public.ledger_entries(provider_user_id);

CREATE OR REPLACE FUNCTION public.reject_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Append-only table (attempted % on %.%)',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER ledger_transactions_no_update BEFORE UPDATE ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER ledger_transactions_no_delete BEFORE DELETE ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TABLE public.provider_balance_accounts (
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  outstanding_debt_minor bigint NOT NULL DEFAULT 0 CHECK (outstanding_debt_minor >= 0),
  available_credit_minor bigint NOT NULL DEFAULT 0 CHECK (available_credit_minor >= 0),
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_user_id, currency)
);

CREATE TABLE public.provider_debt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  original_amount_minor bigint NOT NULL CHECK (original_amount_minor > 0),
  source_booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  source_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_debt_items_provider_ccy_idx ON public.provider_debt_items(provider_user_id, currency, created_at, id);

CREATE TABLE public.provider_credit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  original_amount_minor bigint NOT NULL CHECK (original_amount_minor > 0),
  source_booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  source_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_credit_items_provider_ccy_idx ON public.provider_credit_items(provider_user_id, currency, created_at, id);

CREATE TABLE public.provider_balance_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  movement_type public.provider_balance_movement_type NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  ledger_transaction_id uuid NOT NULL REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT,
  debt_item_id uuid REFERENCES public.provider_debt_items(id) ON DELETE RESTRICT,
  credit_item_id uuid REFERENCES public.provider_credit_items(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movement_refs_ok CHECK (
    (movement_type IN ('debt_increase','debt_decrease')   AND debt_item_id   IS NOT NULL AND credit_item_id IS NULL) OR
    (movement_type IN ('credit_increase','credit_decrease') AND credit_item_id IS NOT NULL AND debt_item_id  IS NULL) OR
    (movement_type = 'credit_to_debt_offset' AND debt_item_id IS NOT NULL AND credit_item_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX provider_balance_movements_dedup_idx ON public.provider_balance_movements (
  ledger_transaction_id, movement_type,
  COALESCE(debt_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(credit_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX provider_balance_movements_provider_idx ON public.provider_balance_movements(provider_user_id, currency, created_at);

ALTER TABLE public.provider_debt_items ADD CONSTRAINT provider_debt_items_source_movement_fkey
  FOREIGN KEY (source_movement_id) REFERENCES public.provider_balance_movements(id) ON DELETE RESTRICT;
ALTER TABLE public.provider_credit_items ADD CONSTRAINT provider_credit_items_source_movement_fkey
  FOREIGN KEY (source_movement_id) REFERENCES public.provider_balance_movements(id) ON DELETE RESTRICT;

CREATE TABLE public.provider_debt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_item_id uuid NOT NULL REFERENCES public.provider_debt_items(id) ON DELETE RESTRICT,
  ledger_transaction_id uuid NOT NULL REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  source text NOT NULL,
  source_credit_item_id uuid REFERENCES public.provider_credit_items(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX provider_debt_allocations_dedup_idx ON public.provider_debt_allocations (
  debt_item_id, ledger_transaction_id,
  COALESCE(booking_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX provider_debt_allocations_debt_item_idx ON public.provider_debt_allocations(debt_item_id);

CREATE TABLE public.provider_credit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_item_id uuid NOT NULL REFERENCES public.provider_credit_items(id) ON DELETE RESTRICT,
  ledger_transaction_id uuid NOT NULL REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT,
  target text NOT NULL,
  target_debt_item_id uuid REFERENCES public.provider_debt_items(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_alloc_target_ok CHECK (
    (target = 'debt_item' AND target_debt_item_id IS NOT NULL AND booking_id IS NULL) OR
    (target = 'booking'   AND booking_id IS NOT NULL AND target_debt_item_id IS NULL)
  )
);
CREATE INDEX provider_credit_allocations_credit_item_idx ON public.provider_credit_allocations(credit_item_id);

CREATE TRIGGER provider_debt_items_no_update BEFORE UPDATE ON public.provider_debt_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_debt_items_no_delete BEFORE DELETE ON public.provider_debt_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_items_no_update BEFORE UPDATE ON public.provider_credit_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_items_no_delete BEFORE DELETE ON public.provider_credit_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_balance_movements_no_update BEFORE UPDATE ON public.provider_balance_movements FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_balance_movements_no_delete BEFORE DELETE ON public.provider_balance_movements FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_debt_allocations_no_update BEFORE UPDATE ON public.provider_debt_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_debt_allocations_no_delete BEFORE DELETE ON public.provider_debt_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_allocations_no_update BEFORE UPDATE ON public.provider_credit_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_allocations_no_delete BEFORE DELETE ON public.provider_credit_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TABLE public.stripe_source_transfer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  source_charge_id text NOT NULL,
  stripe_transfer_id text NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  gross_amount_minor bigint NOT NULL CHECK (gross_amount_minor > 0),
  event_kind text NOT NULL CHECK (event_kind IN ('transfer_created','transfer_reversed')),
  stripe_created_at timestamptz NOT NULL,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_source_transfer_events_charge_idx ON public.stripe_source_transfer_events(source_charge_id, event_kind);
CREATE TRIGGER stripe_source_transfer_events_no_update BEFORE UPDATE ON public.stripe_source_transfer_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER stripe_source_transfer_events_no_delete BEFORE DELETE ON public.stripe_source_transfer_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE VIEW public.v_source_transfer_capacity AS
SELECT source_charge_id, currency,
  COALESCE(SUM(gross_amount_minor) FILTER (WHERE event_kind = 'transfer_created'), 0)::bigint AS source_linked_gross_transfers_minor
FROM public.stripe_source_transfer_events
GROUP BY source_charge_id, currency;

CREATE TABLE public.stripe_refund_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  stripe_refund_id text NOT NULL,
  status text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  stripe_created_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'webhook',
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_refund_events_refund_idx ON public.stripe_refund_events(stripe_refund_id);
CREATE TRIGGER stripe_refund_events_no_update BEFORE UPDATE ON public.stripe_refund_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER stripe_refund_events_no_delete BEFORE DELETE ON public.stripe_refund_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TABLE public.stripe_refunds (
  stripe_refund_id text PRIMARY KEY,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  status text NOT NULL,
  last_stripe_event_created_at timestamptz NOT NULL,
  last_stripe_event_id text NOT NULL,
  last_received_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.unclassified_balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_balance_transaction_id text NOT NULL UNIQUE,
  reporting_category text,
  currency char(3) CHECK (currency IS NULL OR currency = lower(currency)),
  amount_minor bigint,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'needs_review',
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);

CREATE TABLE public.payout_transfer_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attempt_scope text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  funding_mode public.transfer_funding_mode NOT NULL,
  funding_source_ref text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  transfer_group text NOT NULL,
  stripe_idempotency_key text NOT NULL,
  stripe_transfer_id text,
  state text NOT NULL DEFAULT 'planned',
  retry_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message text,
  eligibility_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_idempotency_key),
  UNIQUE (booking_id, attempt_scope, attempt_number)
);
CREATE INDEX payout_transfer_attempts_booking_idx ON public.payout_transfer_attempts(booking_id);
CREATE INDEX payout_transfer_attempts_state_idx ON public.payout_transfer_attempts(state);

CREATE TABLE public.payout_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','consumed','failed','expired')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

CREATE TABLE public.payout_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor text NOT NULL,
  action text NOT NULL,
  from_state text, to_state text, reason text,
  authorization_id uuid REFERENCES public.payout_authorizations(id) ON DELETE RESTRICT,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payout_audit_log_booking_idx ON public.payout_audit_log(booking_id);
CREATE TRIGGER payout_audit_log_no_update BEFORE UPDATE ON public.payout_audit_log FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER payout_audit_log_no_delete BEFORE DELETE ON public.payout_audit_log FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TABLE public.provider_bank_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  stripe_account_id text NOT NULL,
  stripe_payout_id text NOT NULL UNIQUE,
  currency char(3) NOT NULL CHECK (currency = lower(currency)),
  amount_minor bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','in_transit','paid','failed','canceled','unknown')),
  arrival_date date, method text, source_type text,
  failure_code text, failure_message text,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.booking_bank_payout_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_bank_payout_id uuid NOT NULL REFERENCES public.provider_bank_payouts(id) ON DELETE RESTRICT,
  stripe_transfer_id text NOT NULL,
  attribution_source text NOT NULL,
  attribution_method text NOT NULL,
  confidence text NOT NULL DEFAULT 'exact' CHECK (confidence IN ('exact','probable','manual')),
  reconciliation_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, provider_bank_payout_id, stripe_transfer_id)
);
CREATE TRIGGER booking_bank_payout_attributions_no_update BEFORE UPDATE ON public.booking_bank_payout_attributions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER booking_bank_payout_attributions_no_delete BEFORE DELETE ON public.booking_bank_payout_attributions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

ALTER TABLE public.bookings
  ADD COLUMN payment_flow_version public.booking_payment_flow_version,
  ADD COLUMN payout_status public.booking_payout_status,
  ADD COLUMN funds_release_at timestamptz,
  ADD COLUMN settled_reason text,
  ADD COLUMN fee_reconciliation_overdue boolean NOT NULL DEFAULT false,
  ADD COLUMN legacy_classification text;

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
CREATE TRIGGER bookings_payment_flow_version_immutable_trg
  BEFORE UPDATE OF payment_flow_version ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_payment_flow_version_immutable();

ALTER TABLE public.country_configs
  ADD COLUMN IF NOT EXISTS funds_release_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_bank_payout_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_liability_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.finance_accounts (code, account_class, scope_keys, description, enabled, reserved) VALUES
  ('stripe.platform_balance','asset',ARRAY['currency'],'Platform Stripe balance',true,false),
  ('stripe.fee_estimate_liability','liability',ARRAY['currency'],'Stripe fee estimate held until actual bt',true,false),
  ('stripe.unclassified_captured_funds','suspense',ARRAY['currency'],'Captured funds pending classification',true,false),
  ('customer.refund_payable','liability',ARRAY['booking'],'Refund liability to customer',true,false),
  ('platform.fee_revenue','revenue',ARRAY['booking'],'Platform commission revenue',true,false),
  ('platform.fee_refunded_contra','contra_revenue',ARRAY['booking'],'Platform commission refunded (contra)',true,false),
  ('platform.stripe_cost_absorbed','expense',ARRAY['booking','null'],'Stripe fees absorbed by platform',true,false),
  ('platform.dispute_cost_absorbed','expense',ARRAY['booking','null'],'Dispute costs absorbed by platform',true,false),
  ('platform.duplicate_customer_recovery_loss','expense',ARRAY['booking','null'],'Loss from customer over-recovery',true,false),
  ('provider.payable','liability',ARRAY['booking','provider'],'Provider payable (booking-scoped)',true,false),
  ('provider.receivable_debt','asset',ARRAY['provider'],'Crystallised provider debt',true,false),
  ('provider.stripe_cost_contra','contra_liability',ARRAY['booking','provider'],'Provider Stripe-cost contra',true,false),
  ('provider.dispute_cost_contra','contra_liability',ARRAY['booking','provider'],'Provider dispute-cost contra',true,false),
  ('provider.adjustment','contra_liability',ARRAY['booking','provider'],'Provider adjustment',true,false),
  ('provider.credit_liability','liability',ARRAY['provider','currency'],'Provider available credit',true,false),
  ('stripe.fx_receivable','clearing',ARRAY['currency'],'RESERVED - FX clearing receivable',false,true),
  ('stripe.fx_payable','clearing',ARRAY['currency'],'RESERVED - FX clearing payable',false,true),
  ('platform.fx_gain','revenue',ARRAY['currency'],'RESERVED - FX gain',false,true),
  ('platform.fx_loss','expense',ARRAY['currency'],'RESERVED - FX loss',false,true);

INSERT INTO public.finance_event_catalogue (event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES
  ('payment.captured','pi_<id>','{}','Classified capture',true,false),
  ('payment.captured.suspense','pi_<id>:suspense','{}','Unclassified capture into suspense',true,false),
  ('payment.captured.reclassify','pi_<id>:reclassify:<version>',ARRAY['provider.payable'],'Reclassification of suspense',true,false),
  ('stripe.fee.estimate','pi_<id>:fee_estimate','{}','Fee estimate posted at capture',true,false),
  ('stripe.fee.actual','bt_<id>',ARRAY['provider.stripe_cost_contra'],'Actual Stripe fee balance transaction',true,false),
  ('stripe.fee.reconcile.zero','pi_<id>:fee_zero:<evidence_id>','{}','Authoritative zero-fee confirmation',true,false),
  ('refund.recorded','re_<id>:<status>',ARRAY['provider.payable'],'Terminal refund event',true,false),
  ('debt.crystallise','booking:<id>:crystallise:<seq>','{}','Crystallise negative booking payable to debt',true,false),
  ('transfer.succeeded','tr_<id>','{}','Successful Stripe transfer',true,false),
  ('transfer.reversed','trr_<id>',ARRAY['provider.payable'],'Stripe transfer reversal',true,false),
  ('dispute.funds_withdrawn','bt_<id>',ARRAY['platform.dispute_cost_absorbed'],'Dispute funds withdrawn by Stripe',true,false),
  ('dispute.fee','bt_<id>','{}','Dispute fee',true,false),
  ('dispute.won','bt_<id>',ARRAY['platform.dispute_cost_absorbed'],'Dispute won recovery',true,false),
  ('dispute.fee.returned','bt_<id>','{}','Dispute fee returned',true,false),
  ('dispute.reallocate.platform','dispute:<id>:reallocate:<policy_version>','{}','Policy-driven dispute reallocation',true,false),
  ('provider.credit.generated','source_tx:<uuid>:credit','{}','Provider credit generated from surplus',true,false),
  ('provider.credit.applied_debt','source_tx:<uuid>:apply_debt:<debt_item_id>','{}','Provider credit applied to FIFO debt',true,false),
  ('provider.credit.allocated_booking','source_tx:<uuid>:alloc_booking:<booking_id>','{}','Provider credit allocated to booking',true,false),
  ('provider.debt.allocated_booking','debt_item:<id>:alloc:<booking_id>','{}','FIFO debt allocated against booking',true,false),
  ('superadmin.correction','payout_authorization:<request_id>','{}','Authorised super-admin correction',true,false),
  ('fx.conversion.charge_side','RESERVED','{}','RESERVED - FX conversion (charge side)',false,true),
  ('fx.conversion.settlement_side','RESERVED','{}','RESERVED - FX conversion (settlement side)',false,true),
  ('stripe.settlement.converted','RESERVED','{}','RESERVED - cross-currency settlement',false,true);

GRANT SELECT ON public.finance_accounts TO anon, authenticated, service_role;
GRANT SELECT ON public.finance_event_catalogue TO anon, authenticated, service_role;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_event_catalogue ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_accounts_read ON public.finance_accounts FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY finance_event_catalogue_read ON public.finance_event_catalogue FOR SELECT TO anon, authenticated, service_role USING (true);

DO $step1$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ledger_transactions','ledger_entries',
    'provider_balance_accounts','provider_balance_movements',
    'provider_debt_items','provider_credit_items',
    'provider_debt_allocations','provider_credit_allocations',
    'stripe_source_transfer_events','stripe_refund_events','stripe_refunds',
    'unclassified_balance_transactions',
    'payout_transfer_attempts',
    'payout_authorizations','payout_audit_log',
    'provider_bank_payouts','booking_bank_payout_attributions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated, service_role USING (false) WITH CHECK (false)',
                   t || '_deny_all', t);
  END LOOP;
END
$step1$;

INSERT INTO public.feature_flags (flag_key, scope, target_id, enabled, reason)
VALUES ('funds_release.enabled', 'global', 'global', false,
        'v7 funds-release policy master switch. STAGING-ONLY, currently DISABLED.')
ON CONFLICT (flag_key, scope, target_id) DO UPDATE
  SET enabled = false,
      reason = 'v7 funds-release policy master switch. STAGING-ONLY, currently DISABLED.';

COMMENT ON TABLE public.ledger_transactions IS
  'Funds Release v7 Step 1 - schema present, INGESTION DISABLED until Step 2 installs balance-validation triggers.';
COMMENT ON TABLE public.ledger_entries IS
  'Funds Release v7 Step 1 - schema present, INGESTION DISABLED until Step 2 installs balance-validation triggers.';

DO $verify$
DECLARE
  ff_enabled boolean;
  acct_count integer;
  evt_count integer;
  legacy_bookings integer;
BEGIN
  SELECT enabled INTO ff_enabled FROM public.feature_flags
    WHERE flag_key = 'funds_release.enabled' AND scope = 'global' AND target_id = 'global';
  SELECT count(*) INTO acct_count FROM public.finance_accounts;
  SELECT count(*) INTO evt_count FROM public.finance_event_catalogue;
  SELECT count(*) INTO legacy_bookings FROM public.bookings WHERE payment_flow_version IS NULL;
  RAISE NOTICE 'v7 Step 1: ff=% accounts=% events=% bookings_null_pfv=%',
    ff_enabled, acct_count, evt_count, legacy_bookings;
  IF ff_enabled THEN
    RAISE EXCEPTION 'Post-condition failed: funds_release.enabled must be FALSE after Step 1';
  END IF;
END
$verify$;
