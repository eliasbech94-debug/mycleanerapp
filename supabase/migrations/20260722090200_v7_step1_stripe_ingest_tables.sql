-- =============================================================================
-- Funds Release v7 — Step 1 (M-03)
-- Stripe ingest tables + booking_bank_payout_attributions + unclassified_balance_transactions.
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;


CREATE TABLE public.booking_bank_payout_attributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    provider_bank_payout_id uuid NOT NULL,
    stripe_transfer_id text NOT NULL,
    attribution_source text NOT NULL,
    attribution_method text NOT NULL,
    confidence text DEFAULT 'exact'::text NOT NULL,
    reconciliation_run_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_bank_payout_attributions_confidence_check CHECK ((confidence = ANY (ARRAY['exact'::text, 'probable'::text, 'manual'::text])))
);

CREATE TABLE public.stripe_refund_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text NOT NULL,
    stripe_refund_id text NOT NULL,
    status text NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    stripe_created_at timestamp with time zone NOT NULL,
    source text DEFAULT 'webhook'::text NOT NULL,
    raw jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stripe_refund_events_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT stripe_refund_events_currency_check CHECK (((currency)::text = lower((currency)::text)))
);

CREATE TABLE public.stripe_refunds (
    stripe_refund_id text NOT NULL,
    booking_id uuid,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    status text NOT NULL,
    last_stripe_event_created_at timestamp with time zone NOT NULL,
    last_stripe_event_id text NOT NULL,
    last_received_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stripe_refunds_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT stripe_refunds_currency_check CHECK (((currency)::text = lower((currency)::text)))
);

CREATE TABLE public.stripe_source_transfer_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text NOT NULL,
    source_charge_id text NOT NULL,
    stripe_transfer_id text NOT NULL,
    booking_id uuid,
    currency character(3) NOT NULL,
    gross_amount_minor bigint NOT NULL,
    event_kind text NOT NULL,
    stripe_created_at timestamp with time zone NOT NULL,
    raw jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stripe_source_transfer_events_currency_check CHECK (((currency)::text = lower((currency)::text))),
    CONSTRAINT stripe_source_transfer_events_event_kind_check CHECK ((event_kind = ANY (ARRAY['transfer_created'::text, 'transfer_reversed'::text]))),
    CONSTRAINT stripe_source_transfer_events_gross_amount_minor_check CHECK ((gross_amount_minor > 0))
);

CREATE TABLE public.unclassified_balance_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_balance_transaction_id text NOT NULL,
    reporting_category text,
    currency character(3),
    amount_minor bigint,
    reason text NOT NULL,
    status text DEFAULT 'needs_review'::text NOT NULL,
    raw jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolution_note text,
    CONSTRAINT unclassified_balance_transactions_currency_check CHECK (((currency IS NULL) OR ((currency)::text = lower((currency)::text))))
);

ALTER TABLE ONLY public.booking_bank_payout_attributions
    ADD CONSTRAINT booking_bank_payout_attributi_booking_id_provider_bank_payo_key UNIQUE (booking_id, provider_bank_payout_id, stripe_transfer_id);

ALTER TABLE ONLY public.booking_bank_payout_attributions
    ADD CONSTRAINT booking_bank_payout_attributions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stripe_refund_events
    ADD CONSTRAINT stripe_refund_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stripe_refund_events
    ADD CONSTRAINT stripe_refund_events_stripe_event_id_key UNIQUE (stripe_event_id);

ALTER TABLE ONLY public.stripe_refunds
    ADD CONSTRAINT stripe_refunds_pkey PRIMARY KEY (stripe_refund_id);

ALTER TABLE ONLY public.stripe_source_transfer_events
    ADD CONSTRAINT stripe_source_transfer_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stripe_source_transfer_events
    ADD CONSTRAINT stripe_source_transfer_events_stripe_event_id_key UNIQUE (stripe_event_id);

ALTER TABLE ONLY public.unclassified_balance_transactions
    ADD CONSTRAINT unclassified_balance_transact_stripe_balance_transaction_id_key UNIQUE (stripe_balance_transaction_id);

ALTER TABLE ONLY public.unclassified_balance_transactions
    ADD CONSTRAINT unclassified_balance_transactions_pkey PRIMARY KEY (id);

CREATE INDEX stripe_refund_events_refund_idx ON public.stripe_refund_events USING btree (stripe_refund_id);

CREATE INDEX stripe_source_transfer_events_charge_idx ON public.stripe_source_transfer_events USING btree (source_charge_id, event_kind);

CREATE TRIGGER booking_bank_payout_attributions_no_delete BEFORE DELETE ON public.booking_bank_payout_attributions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER booking_bank_payout_attributions_no_update BEFORE UPDATE ON public.booking_bank_payout_attributions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER stripe_refund_events_no_delete BEFORE DELETE ON public.stripe_refund_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER stripe_refund_events_no_update BEFORE UPDATE ON public.stripe_refund_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER stripe_source_transfer_events_no_delete BEFORE DELETE ON public.stripe_source_transfer_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER stripe_source_transfer_events_no_update BEFORE UPDATE ON public.stripe_source_transfer_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

ALTER TABLE ONLY public.booking_bank_payout_attributions
    ADD CONSTRAINT booking_bank_payout_attributions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.booking_bank_payout_attributions
    ADD CONSTRAINT booking_bank_payout_attributions_provider_bank_payout_id_fkey FOREIGN KEY (provider_bank_payout_id) REFERENCES public.provider_bank_payouts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stripe_refunds
    ADD CONSTRAINT stripe_refunds_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stripe_source_transfer_events
    ADD CONSTRAINT stripe_source_transfer_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE public.booking_bank_payout_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_bank_payout_attributions_deny_all ON public.booking_bank_payout_attributions TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.stripe_refund_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_refund_events_deny_all ON public.stripe_refund_events TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.stripe_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_refunds_deny_all ON public.stripe_refunds TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.stripe_source_transfer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_source_transfer_events_deny_all ON public.stripe_source_transfer_events TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.unclassified_balance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY unclassified_balance_transactions_deny_all ON public.unclassified_balance_transactions TO authenticated, anon, service_role USING (false) WITH CHECK (false);


-- Grants ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.stripe_refunds                   TO service_role;
GRANT SELECT, INSERT         ON public.stripe_refund_events             TO service_role;
GRANT SELECT, INSERT         ON public.stripe_source_transfer_events    TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.unclassified_balance_transactions TO service_role;
GRANT SELECT, INSERT         ON public.booking_bank_payout_attributions TO service_role;

-- Self-test (no persistent rows) ---------------------------------------------
DO $selftest$ BEGIN
  PERFORM 1 FROM public.stripe_refunds LIMIT 0;
  PERFORM 1 FROM public.stripe_refund_events LIMIT 0;
  PERFORM 1 FROM public.stripe_source_transfer_events LIMIT 0;
  PERFORM 1 FROM public.unclassified_balance_transactions LIMIT 0;
  PERFORM 1 FROM public.booking_bank_payout_attributions LIMIT 0;
END $selftest$;

COMMIT;
