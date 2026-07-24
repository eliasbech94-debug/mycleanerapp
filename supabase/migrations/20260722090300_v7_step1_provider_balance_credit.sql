-- =============================================================================
-- Funds Release v7 — Step 1 (M-04)
-- Provider balance, credit, debt, and bank payout tables.
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;


CREATE TABLE public.provider_balance_accounts (
    provider_user_id uuid NOT NULL,
    currency character(3) NOT NULL,
    outstanding_debt_minor bigint DEFAULT 0 NOT NULL,
    available_credit_minor bigint DEFAULT 0 NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_balance_accounts_available_credit_minor_check CHECK ((available_credit_minor >= 0)),
    CONSTRAINT provider_balance_accounts_currency_check CHECK (((currency)::text = lower((currency)::text))),
    CONSTRAINT provider_balance_accounts_outstanding_debt_minor_check CHECK ((outstanding_debt_minor >= 0))
);

CREATE TABLE public.provider_balance_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_user_id uuid NOT NULL,
    currency character(3) NOT NULL,
    movement_type public.provider_balance_movement_type NOT NULL,
    amount_minor bigint NOT NULL,
    ledger_transaction_id uuid NOT NULL,
    debt_item_id uuid,
    credit_item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT movement_refs_ok CHECK ((((movement_type = ANY (ARRAY['debt_increase'::public.provider_balance_movement_type, 'debt_decrease'::public.provider_balance_movement_type])) AND (debt_item_id IS NOT NULL) AND (credit_item_id IS NULL)) OR ((movement_type = ANY (ARRAY['credit_increase'::public.provider_balance_movement_type, 'credit_decrease'::public.provider_balance_movement_type])) AND (credit_item_id IS NOT NULL) AND (debt_item_id IS NULL)) OR ((movement_type = 'credit_to_debt_offset'::public.provider_balance_movement_type) AND (debt_item_id IS NOT NULL) AND (credit_item_id IS NOT NULL)))),
    CONSTRAINT provider_balance_movements_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT provider_balance_movements_currency_check CHECK (((currency)::text = lower((currency)::text)))
);

CREATE TABLE public.provider_bank_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_user_id uuid NOT NULL,
    stripe_account_id text NOT NULL,
    stripe_payout_id text NOT NULL,
    currency character(3) NOT NULL,
    amount_minor bigint NOT NULL,
    status text NOT NULL,
    arrival_date date,
    method text,
    source_type text,
    failure_code text,
    failure_message text,
    raw jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_bank_payouts_currency_check CHECK (((currency)::text = lower((currency)::text))),
    CONSTRAINT provider_bank_payouts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_transit'::text, 'paid'::text, 'failed'::text, 'canceled'::text, 'unknown'::text])))
);

CREATE TABLE public.provider_credit_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credit_item_id uuid NOT NULL,
    ledger_transaction_id uuid NOT NULL,
    target text NOT NULL,
    target_debt_item_id uuid,
    booking_id uuid,
    amount_minor bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credit_alloc_target_ok CHECK ((((target = 'debt_item'::text) AND (target_debt_item_id IS NOT NULL) AND (booking_id IS NULL)) OR ((target = 'booking'::text) AND (booking_id IS NOT NULL) AND (target_debt_item_id IS NULL)))),
    CONSTRAINT provider_credit_allocations_amount_minor_check CHECK ((amount_minor > 0))
);

CREATE TABLE public.provider_credit_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_user_id uuid NOT NULL,
    currency character(3) NOT NULL,
    original_amount_minor bigint NOT NULL,
    source_booking_id uuid,
    source_movement_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_credit_items_currency_check CHECK (((currency)::text = lower((currency)::text))),
    CONSTRAINT provider_credit_items_original_amount_minor_check CHECK ((original_amount_minor > 0))
);

CREATE TABLE public.provider_debt_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    debt_item_id uuid NOT NULL,
    ledger_transaction_id uuid NOT NULL,
    booking_id uuid,
    source text NOT NULL,
    source_credit_item_id uuid,
    amount_minor bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_debt_allocations_amount_minor_check CHECK ((amount_minor > 0))
);

CREATE TABLE public.provider_debt_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_user_id uuid NOT NULL,
    currency character(3) NOT NULL,
    original_amount_minor bigint NOT NULL,
    source_booking_id uuid,
    source_movement_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_debt_items_currency_check CHECK (((currency)::text = lower((currency)::text))),
    CONSTRAINT provider_debt_items_original_amount_minor_check CHECK ((original_amount_minor > 0))
);

ALTER TABLE ONLY public.provider_balance_accounts
    ADD CONSTRAINT provider_balance_accounts_pkey PRIMARY KEY (provider_user_id, currency);

ALTER TABLE ONLY public.provider_balance_movements
    ADD CONSTRAINT provider_balance_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.provider_bank_payouts
    ADD CONSTRAINT provider_bank_payouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.provider_bank_payouts
    ADD CONSTRAINT provider_bank_payouts_stripe_payout_id_key UNIQUE (stripe_payout_id);

ALTER TABLE ONLY public.provider_credit_allocations
    ADD CONSTRAINT provider_credit_allocations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.provider_credit_items
    ADD CONSTRAINT provider_credit_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.provider_debt_allocations
    ADD CONSTRAINT provider_debt_allocations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.provider_debt_items
    ADD CONSTRAINT provider_debt_items_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX provider_balance_movements_dedup_idx ON public.provider_balance_movements USING btree (ledger_transaction_id, movement_type, COALESCE(debt_item_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(credit_item_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX provider_balance_movements_provider_idx ON public.provider_balance_movements USING btree (provider_user_id, currency, created_at);

CREATE INDEX provider_credit_allocations_credit_item_idx ON public.provider_credit_allocations USING btree (credit_item_id);

CREATE INDEX provider_credit_items_provider_ccy_idx ON public.provider_credit_items USING btree (provider_user_id, currency, created_at, id);

CREATE INDEX provider_debt_allocations_debt_item_idx ON public.provider_debt_allocations USING btree (debt_item_id);

CREATE UNIQUE INDEX provider_debt_allocations_dedup_idx ON public.provider_debt_allocations USING btree (debt_item_id, ledger_transaction_id, COALESCE(booking_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX provider_debt_items_provider_ccy_idx ON public.provider_debt_items USING btree (provider_user_id, currency, created_at, id);

-- Append-only triggers on provider_balance_movements, provider_credit_items,
-- provider_credit_allocations, provider_debt_items and provider_debt_allocations
-- are installed in M-06 after public.reject_ledger_mutation() is defined.


ALTER TABLE ONLY public.provider_balance_accounts
    ADD CONSTRAINT provider_balance_accounts_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_balance_movements
    ADD CONSTRAINT provider_balance_movements_credit_item_id_fkey FOREIGN KEY (credit_item_id) REFERENCES public.provider_credit_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_balance_movements
    ADD CONSTRAINT provider_balance_movements_debt_item_id_fkey FOREIGN KEY (debt_item_id) REFERENCES public.provider_debt_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_balance_movements
    ADD CONSTRAINT provider_balance_movements_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_balance_movements
    ADD CONSTRAINT provider_balance_movements_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_bank_payouts
    ADD CONSTRAINT provider_bank_payouts_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_credit_allocations
    ADD CONSTRAINT provider_credit_allocations_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_credit_allocations
    ADD CONSTRAINT provider_credit_allocations_credit_item_id_fkey FOREIGN KEY (credit_item_id) REFERENCES public.provider_credit_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_credit_allocations
    ADD CONSTRAINT provider_credit_allocations_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_credit_allocations
    ADD CONSTRAINT provider_credit_allocations_target_debt_item_id_fkey FOREIGN KEY (target_debt_item_id) REFERENCES public.provider_debt_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_credit_items
    ADD CONSTRAINT provider_credit_items_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_credit_items
    ADD CONSTRAINT provider_credit_items_source_booking_id_fkey FOREIGN KEY (source_booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_credit_items
    ADD CONSTRAINT provider_credit_items_source_movement_fkey FOREIGN KEY (source_movement_id) REFERENCES public.provider_balance_movements(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_debt_allocations
    ADD CONSTRAINT provider_debt_allocations_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_debt_allocations
    ADD CONSTRAINT provider_debt_allocations_debt_item_id_fkey FOREIGN KEY (debt_item_id) REFERENCES public.provider_debt_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_debt_allocations
    ADD CONSTRAINT provider_debt_allocations_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_debt_allocations
    ADD CONSTRAINT provider_debt_allocations_source_credit_item_id_fkey FOREIGN KEY (source_credit_item_id) REFERENCES public.provider_credit_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_debt_items
    ADD CONSTRAINT provider_debt_items_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_debt_items
    ADD CONSTRAINT provider_debt_items_source_booking_id_fkey FOREIGN KEY (source_booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.provider_debt_items
    ADD CONSTRAINT provider_debt_items_source_movement_fkey FOREIGN KEY (source_movement_id) REFERENCES public.provider_balance_movements(id) ON DELETE RESTRICT;

ALTER TABLE public.provider_balance_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_balance_accounts_deny_all ON public.provider_balance_accounts TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.provider_balance_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_balance_movements_deny_all ON public.provider_balance_movements TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.provider_bank_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_bank_payouts_deny_all ON public.provider_bank_payouts TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.provider_credit_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_credit_allocations_deny_all ON public.provider_credit_allocations TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.provider_credit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_credit_items_deny_all ON public.provider_credit_items TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.provider_debt_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_debt_allocations_deny_all ON public.provider_debt_allocations TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.provider_debt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_debt_items_deny_all ON public.provider_debt_items TO authenticated, anon, service_role USING (false) WITH CHECK (false);


-- Grants ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.provider_balance_accounts   TO service_role;
GRANT SELECT, INSERT         ON public.provider_balance_movements  TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.provider_credit_items       TO service_role;
GRANT SELECT, INSERT         ON public.provider_credit_allocations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.provider_debt_items         TO service_role;
GRANT SELECT, INSERT         ON public.provider_debt_allocations   TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.provider_bank_payouts       TO service_role;

DO $selftest$ BEGIN
  PERFORM 1 FROM public.provider_balance_accounts LIMIT 0;
  PERFORM 1 FROM public.provider_balance_movements LIMIT 0;
  PERFORM 1 FROM public.provider_credit_items LIMIT 0;
  PERFORM 1 FROM public.provider_credit_allocations LIMIT 0;
  PERFORM 1 FROM public.provider_debt_items LIMIT 0;
  PERFORM 1 FROM public.provider_debt_allocations LIMIT 0;
  PERFORM 1 FROM public.provider_bank_payouts LIMIT 0;
END $selftest$;

COMMIT;
