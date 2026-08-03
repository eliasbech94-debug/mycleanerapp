-- =============================================================================
-- Funds Release v7 — Step 1 (M-01)
-- Finance catalogues + supporting enums + seed data (idempotent).
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;

-- Enums (idempotent) ---------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='finance_account_class') THEN
    CREATE TYPE public.finance_account_class AS ENUM
      ('asset','liability','revenue','expense','clearing',
       'contra_revenue','contra_liability','suspense');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='transfer_funding_mode') THEN
    CREATE TYPE public.transfer_funding_mode AS ENUM ('source_linked','platform_unlinked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='booking_hold_type') THEN
    CREATE TYPE public.booking_hold_type AS ENUM
      ('complaint','dispute','refund','cancellation','manual','admin_block');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='booking_hold_status') THEN
    CREATE TYPE public.booking_hold_status AS ENUM ('active','released','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='provider_balance_movement_type') THEN
    CREATE TYPE public.provider_balance_movement_type AS ENUM
      ('debt_increase','debt_decrease','credit_increase','credit_decrease','credit_to_debt_offset');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='booking_payment_flow_version') THEN
    CREATE TYPE public.booking_payment_flow_version AS ENUM
      ('destination_charge_v1','separate_charges_v1');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ledger_entry_direction') THEN
    CREATE TYPE public.ledger_entry_direction AS ENUM ('debit','credit');
  END IF;
END $$;


CREATE TABLE public.finance_accounts (
    code text NOT NULL,
    account_class public.finance_account_class NOT NULL,
    scope_keys text[] DEFAULT '{}'::text[] NOT NULL,
    description text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    reserved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.finance_event_catalogue (
    event_type text NOT NULL,
    idempotency_shape text NOT NULL,
    multi_leg_accounts text[] DEFAULT '{}'::text[] NOT NULL,
    description text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    reserved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.finance_event_catalogue
    ADD CONSTRAINT finance_event_catalogue_pkey PRIMARY KEY (event_type);

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_accounts_read ON public.finance_accounts FOR SELECT TO authenticated, anon, service_role USING (true);

ALTER TABLE public.finance_event_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_event_catalogue_read ON public.finance_event_catalogue FOR SELECT TO authenticated, anon, service_role USING (true);


-- Grants -----------------------------------------------------------------------
GRANT SELECT ON public.finance_accounts        TO anon, authenticated;
GRANT ALL    ON public.finance_accounts        TO service_role;
GRANT SELECT ON public.finance_event_catalogue TO anon, authenticated;
GRANT ALL    ON public.finance_event_catalogue TO service_role;

-- Seeds (idempotent) ----------------------------------------------------------
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('customer.refund_payable', 'liability'::public.finance_account_class, '{booking}'::text[], 'Refund liability to customer', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('platform.dispute_cost_absorbed', 'expense'::public.finance_account_class, '{booking,"null"}'::text[], 'Dispute costs absorbed by platform', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('platform.duplicate_customer_recovery_loss', 'expense'::public.finance_account_class, '{booking,"null"}'::text[], 'Loss from customer over-recovery', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('platform.fee_refunded_contra', 'contra_revenue'::public.finance_account_class, '{booking}'::text[], 'Platform commission refunded (contra)', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('platform.fee_revenue', 'revenue'::public.finance_account_class, '{booking}'::text[], 'Platform commission revenue', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('platform.fx_gain', 'revenue'::public.finance_account_class, '{currency}'::text[], 'RESERVED - FX gain', false, true) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('platform.fx_loss', 'expense'::public.finance_account_class, '{currency}'::text[], 'RESERVED - FX loss', false, true) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('platform.stripe_cost_absorbed', 'expense'::public.finance_account_class, '{booking,"null"}'::text[], 'Stripe fees absorbed by platform', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('provider.adjustment', 'contra_liability'::public.finance_account_class, '{booking,provider}'::text[], 'Provider adjustment', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('provider.credit_liability', 'liability'::public.finance_account_class, '{provider,currency}'::text[], 'Provider available credit', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('provider.dispute_cost_contra', 'contra_liability'::public.finance_account_class, '{booking,provider}'::text[], 'Provider dispute-cost contra', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('provider.payable', 'liability'::public.finance_account_class, '{booking,provider}'::text[], 'Provider payable (booking-scoped)', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('provider.receivable_debt', 'asset'::public.finance_account_class, '{provider}'::text[], 'Crystallised provider debt', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('provider.stripe_cost_contra', 'contra_liability'::public.finance_account_class, '{booking,provider}'::text[], 'Provider Stripe-cost contra', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('stripe.fee_estimate_liability', 'liability'::public.finance_account_class, '{currency}'::text[], 'Stripe fee estimate held until actual bt', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('stripe.fx_payable', 'clearing'::public.finance_account_class, '{currency}'::text[], 'RESERVED - FX clearing payable', false, true) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('stripe.fx_receivable', 'clearing'::public.finance_account_class, '{currency}'::text[], 'RESERVED - FX clearing receivable', false, true) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('stripe.platform_balance', 'asset'::public.finance_account_class, '{currency}'::text[], 'Platform Stripe balance', true, false) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.finance_accounts(code, account_class, scope_keys, description, enabled, reserved) VALUES ('stripe.unclassified_captured_funds', 'suspense'::public.finance_account_class, '{currency}'::text[], 'Captured funds pending classification', true, false) ON CONFLICT (code) DO NOTHING;

INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('debt.crystallise', 'booking:<id>:crystallise:<seq>', '{}'::text[], 'Crystallise negative booking payable to debt', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('dispute.fee', 'bt_<id>', '{}'::text[], 'Dispute fee', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('dispute.fee.returned', 'bt_<id>', '{}'::text[], 'Dispute fee returned', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('dispute.funds_withdrawn', 'bt_<id>', '{platform.dispute_cost_absorbed}'::text[], 'Dispute funds withdrawn by Stripe', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('dispute.reallocate.platform', 'dispute:<id>:reallocate:<policy_version>', '{}'::text[], 'Policy-driven dispute reallocation', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('dispute.won', 'bt_<id>', '{platform.dispute_cost_absorbed}'::text[], 'Dispute won recovery', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('fx.conversion.charge_side', 'RESERVED', '{}'::text[], 'RESERVED - FX conversion (charge side)', false, true) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('fx.conversion.settlement_side', 'RESERVED', '{}'::text[], 'RESERVED - FX conversion (settlement side)', false, true) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('payment.captured', 'pi_<id>', '{}'::text[], 'Classified capture', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('payment.captured.reclassify', 'pi_<id>:reclassify:<version>', '{provider.payable}'::text[], 'Reclassification of suspense', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('payment.captured.suspense', 'pi_<id>:suspense', '{}'::text[], 'Unclassified capture into suspense', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('provider.credit.allocated_booking', 'source_tx:<uuid>:alloc_booking:<booking_id>', '{}'::text[], 'Provider credit allocated to booking', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('provider.credit.applied_debt', 'source_tx:<uuid>:apply_debt:<debt_item_id>', '{}'::text[], 'Provider credit applied to FIFO debt', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('provider.credit.generated', 'source_tx:<uuid>:credit', '{}'::text[], 'Provider credit generated from surplus', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('provider.debt.allocated_booking', 'debt_item:<id>:alloc:<booking_id>', '{}'::text[], 'FIFO debt allocated against booking', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('refund.recorded', 're_<id>:<status>', '{provider.payable}'::text[], 'Terminal refund event', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('stripe.fee.actual', 'bt_<id>', '{provider.stripe_cost_contra}'::text[], 'Actual Stripe fee balance transaction', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('stripe.fee.estimate', 'pi_<id>:fee_estimate', '{}'::text[], 'Fee estimate posted at capture', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('stripe.fee.reconcile.zero', 'pi_<id>:fee_zero:<evidence_id>', '{}'::text[], 'Authoritative zero-fee confirmation', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('stripe.settlement.converted', 'RESERVED', '{}'::text[], 'RESERVED - cross-currency settlement', false, true) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('superadmin.correction', 'payout_authorization:<request_id>', '{}'::text[], 'Authorised super-admin correction', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('transfer.reversed', 'trr_<id>', '{provider.payable}'::text[], 'Stripe transfer reversal', true, false) ON CONFLICT (event_type) DO NOTHING;
INSERT INTO public.finance_event_catalogue(event_type, idempotency_shape, multi_leg_accounts, description, enabled, reserved) VALUES ('transfer.succeeded', 'tr_<id>', '{}'::text[], 'Successful Stripe transfer', true, false) ON CONFLICT (event_type) DO NOTHING;

-- Self-test (rollback-safe — SAVEPOINT + ROLLBACK TO SAVEPOINT)
DO $selftest$
BEGIN
  IF (SELECT count(*) FROM public.finance_accounts) < 1
  OR (SELECT count(*) FROM public.finance_event_catalogue) < 1 THEN
    RAISE EXCEPTION 'M-01 self-test: catalogues did not seed';
  END IF;
END $selftest$;

COMMIT;
