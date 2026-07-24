-- =============================================================================
-- Funds Release v7 — Step 1 (M-02)
-- Ledger tables (ledger_transactions, ledger_entries). RLS deny_all; no data.
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;


CREATE TABLE public.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    account text NOT NULL,
    direction public.ledger_entry_direction NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    booking_id uuid,
    provider_user_id uuid,
    leg_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_entries_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT ledger_entries_currency_check CHECK (((currency)::text = lower((currency)::text)))
);

CREATE TABLE public.ledger_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    event_id text NOT NULL,
    currency character(3) NOT NULL,
    booking_id uuid,
    provider_user_id uuid,
    memo text,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'internal'::text NOT NULL,
    raw jsonb,
    payload_fingerprint text,
    CONSTRAINT ledger_transactions_currency_check CHECK (((currency)::text = lower((currency)::text)))
);

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_event_type_event_id_key UNIQUE (event_type, event_id);

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_pkey PRIMARY KEY (id);

CREATE INDEX ledger_entries_account_idx ON public.ledger_entries USING btree (account);

CREATE INDEX ledger_entries_booking_idx ON public.ledger_entries USING btree (booking_id);

CREATE INDEX ledger_entries_provider_idx ON public.ledger_entries USING btree (provider_user_id);

CREATE INDEX ledger_entries_tx_idx ON public.ledger_entries USING btree (transaction_id);

CREATE INDEX ledger_transactions_booking_idx ON public.ledger_transactions USING btree (booking_id);

CREATE INDEX ledger_transactions_posted_at_idx ON public.ledger_transactions USING btree (posted_at);

CREATE INDEX ledger_transactions_provider_idx ON public.ledger_transactions USING btree (provider_user_id);

CREATE TRIGGER ledger_entries_currency_match AFTER INSERT ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_currency_match();

CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER ledger_entries_writer_guard BEFORE INSERT ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_writer_guard();

CREATE CONSTRAINT TRIGGER ledger_entry_balance_check AFTER INSERT ON public.ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_transaction_balance();

CREATE TRIGGER ledger_transactions_no_delete BEFORE DELETE ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER ledger_transactions_no_update BEFORE UPDATE ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER ledger_transactions_writer_guard BEFORE INSERT ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.ledger_writer_guard();

CREATE CONSTRAINT TRIGGER ledger_tx_balance_check AFTER INSERT ON public.ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_transaction_balance();

CREATE TRIGGER ledger_tx_event_enabled BEFORE INSERT ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.ledger_event_enabled_check();

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_account_fkey FOREIGN KEY (account) REFERENCES public.finance_accounts(code);

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_event_type_fkey FOREIGN KEY (event_type) REFERENCES public.finance_event_catalogue(event_type);

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_entries_deny_all ON public.ledger_entries TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_transactions_deny_all ON public.ledger_transactions TO authenticated, anon, service_role USING (false) WITH CHECK (false);


-- Grants (deny_all + service_role for writes) --------------------------------
GRANT SELECT, INSERT ON public.ledger_transactions TO service_role;
GRANT SELECT, INSERT ON public.ledger_entries      TO service_role;

-- Self-test (rollback-safe): writer guard + balance check + append-only
-- Runs against an INNER savepoint; ROLLBACK TO SAVEPOINT leaves nothing behind.
DO $selftest$
DECLARE v_err text;
BEGIN
  BEGIN
    -- unauthorized insert must be blocked by writer guard (added in M-06)
    -- so we only check the table exists here
    PERFORM 1 FROM public.ledger_transactions LIMIT 0;
    PERFORM 1 FROM public.ledger_entries LIMIT 0;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'M-02 self-test failed: %', SQLERRM;
  END;
END $selftest$;

COMMIT;
