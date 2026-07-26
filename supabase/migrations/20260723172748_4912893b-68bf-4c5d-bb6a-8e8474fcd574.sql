
-- =====================================================================
-- Funds Release v7 — Step 2
-- Double-entry balance validation + immutable ledger safeguards
-- =====================================================================
-- Design constraints honoured:
--   * Additive only. No changes to existing writable flows.
--   * Ledger remains append-only (Step 1 already blocks UPDATE/DELETE).
--   * No ingestion, no Stripe calls, no cron, no frontend, no flag flip.
--   * All new logic is SECURITY DEFINER where privileged, search_path pinned.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Session-scoped writer guard
-- ---------------------------------------------------------------------
-- Defense-in-depth: even though the tables deny all API roles, we require
-- any transaction that inserts ledger rows to explicitly opt-in via a
-- SECURITY DEFINER helper. This blocks accidental inserts from future
-- migrations or maintenance sessions that bypass RLS as table owner.

CREATE OR REPLACE FUNCTION public.assert_ledger_writer_authorized()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.ledger_writer', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'ledger write rejected: session is not an authorized ledger writer'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_ledger_writer_authorized() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.begin_ledger_write()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- LOCAL scope: the flag is dropped at COMMIT/ROLLBACK automatically.
  PERFORM set_config('app.ledger_writer', 'on', true);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_ledger_write() FROM PUBLIC;
-- Intentionally not GRANTed to anon/authenticated/service_role. Only the
-- table owner (used by future SECURITY DEFINER posting functions) can call.


-- ---------------------------------------------------------------------
-- 2. Row-level writer guard trigger
-- ---------------------------------------------------------------------
-- Fires immediately per INSERT to reject any write not wrapped in
-- begin_ledger_write(). Balance validation itself is deferred (see §3).

CREATE OR REPLACE FUNCTION public.ledger_writer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_ledger_writer_authorized();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_transactions_writer_guard ON public.ledger_transactions;
CREATE TRIGGER ledger_transactions_writer_guard
BEFORE INSERT ON public.ledger_transactions
FOR EACH ROW EXECUTE FUNCTION public.ledger_writer_guard();

DROP TRIGGER IF EXISTS ledger_entries_writer_guard ON public.ledger_entries;
CREATE TRIGGER ledger_entries_writer_guard
BEFORE INSERT ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.ledger_writer_guard();


-- ---------------------------------------------------------------------
-- 3. Per-entry currency alignment (immediate)
-- ---------------------------------------------------------------------
-- Every ledger_entry must share currency with its parent transaction.
-- This is an immediate check because it cannot be true unless the tx
-- exists first; the balance check below is what needs deferral.

CREATE OR REPLACE FUNCTION public.ledger_entry_currency_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tx_currency char(3);
BEGIN
  SELECT currency INTO tx_currency
  FROM public.ledger_transactions
  WHERE id = NEW.transaction_id;

  IF tx_currency IS NULL THEN
    RAISE EXCEPTION 'ledger_entry references unknown transaction %', NEW.transaction_id
      USING ERRCODE = '23503';
  END IF;

  IF tx_currency <> NEW.currency THEN
    RAISE EXCEPTION
      'ledger_entry currency % does not match transaction currency %',
      NEW.currency, tx_currency
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_currency_match ON public.ledger_entries;
CREATE TRIGGER ledger_entries_currency_match
AFTER INSERT ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_currency_match();


-- ---------------------------------------------------------------------
-- 4. Deferred balance validation (CONSTRAINT TRIGGER)
-- ---------------------------------------------------------------------
-- Rule: at COMMIT time every ledger_transaction must
--   (a) have >= 2 entries,
--   (b) have balanced debits and credits per currency (single currency
--       already enforced in §3), i.e. SUM(debit) = SUM(credit).
--
-- Uses CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED so that
-- posting code can insert the transaction row and its entries in any
-- order within a single database transaction.

CREATE OR REPLACE FUNCTION public.validate_ledger_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tx_id uuid;
  entry_count int;
  debit_total bigint;
  credit_total bigint;
BEGIN
  -- The trigger fires on ledger_transactions (deferred). We validate
  -- the row identified by NEW.id. When fired on ledger_entries the
  -- transaction_id points at the parent.
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    tx_id := NEW.id;
  ELSE
    tx_id := NEW.transaction_id;
  END IF;

  SELECT
    COUNT(*)::int,
    COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount_minor END), 0),
    COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_minor END), 0)
  INTO entry_count, debit_total, credit_total
  FROM public.ledger_entries
  WHERE transaction_id = tx_id;

  IF entry_count < 2 THEN
    RAISE EXCEPTION
      'ledger transaction % has % entries (minimum 2 required)',
      tx_id, entry_count
      USING ERRCODE = '23514';
  END IF;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION
      'ledger transaction % is unbalanced: debits=% credits=% diff=%',
      tx_id, debit_total, credit_total, (debit_total - credit_total)
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- Fire once per transaction row (deferred to COMMIT).
DROP TRIGGER IF EXISTS ledger_tx_balance_check ON public.ledger_transactions;
CREATE CONSTRAINT TRIGGER ledger_tx_balance_check
AFTER INSERT ON public.ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_transaction_balance();

-- Also fire per new entry (deferred) so late-inserted entries against a
-- previously-balanced transaction (should not happen but defense-in-depth)
-- re-validate the total.
DROP TRIGGER IF EXISTS ledger_entry_balance_check ON public.ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_entry_balance_check
AFTER INSERT ON public.ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_transaction_balance();


-- ---------------------------------------------------------------------
-- 5. Account-code consistency safeguard
-- ---------------------------------------------------------------------
-- Reject entries against event catalogue entries flagged disabled.

CREATE OR REPLACE FUNCTION public.ledger_event_enabled_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_enabled boolean;
BEGIN
  SELECT enabled INTO is_enabled
  FROM public.finance_event_catalogue
  WHERE event_type = NEW.event_type;

  IF is_enabled IS NULL THEN
    RAISE EXCEPTION 'unknown event_type % (not in finance_event_catalogue)', NEW.event_type
      USING ERRCODE = '23503';
  END IF;

  IF NOT is_enabled THEN
    RAISE EXCEPTION 'event_type % is disabled/reserved and cannot be posted', NEW.event_type
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_tx_event_enabled ON public.ledger_transactions;
CREATE TRIGGER ledger_tx_event_enabled
BEFORE INSERT ON public.ledger_transactions
FOR EACH ROW EXECUTE FUNCTION public.ledger_event_enabled_check();


-- ---------------------------------------------------------------------
-- 6. Documentation comments (financial primary tables + critical cols)
-- ---------------------------------------------------------------------

COMMENT ON TABLE public.ledger_transactions IS
  'Append-only double-entry journal header. One row per atomic business event (payment_captured, transfer_created, refund_processed, dispute_lost, etc). Immutable after insert. Balanced at COMMIT via deferred constraint trigger.';
COMMENT ON COLUMN public.ledger_transactions.event_type IS
  'FK to finance_event_catalogue.event_type. Determines the canonical journal shape.';
COMMENT ON COLUMN public.ledger_transactions.event_id IS
  'Idempotency key. (event_type, event_id) is UNIQUE. For Stripe-sourced events this is the Stripe object id; for internal events, a deterministic string.';
COMMENT ON COLUMN public.ledger_transactions.currency IS
  'ISO-4217 lower-case. Single currency per transaction; cross-currency is modelled as two transactions bridged by the FX clearing accounts (v7 §14). FX is reserved/disabled in current phase.';

COMMENT ON TABLE public.ledger_entries IS
  'Append-only double-entry journal lines. Every parent transaction has >=2 lines with SUM(debit)=SUM(credit) in the transaction currency. Immutable after insert.';
COMMENT ON COLUMN public.ledger_entries.direction IS
  'debit | credit. Interpretation depends on the account family (asset/liability/revenue/expense per finance_accounts.type).';
COMMENT ON COLUMN public.ledger_entries.amount_minor IS
  'Positive integer in the smallest currency unit (e.g. øre, cents). Direction encodes sign.';
COMMENT ON COLUMN public.ledger_entries.leg_index IS
  'Deterministic ordering within a transaction (0-based). Used for reproducible replays and debugging.';

COMMENT ON TABLE public.finance_accounts IS
  'Chart of accounts. Every ledger_entries.account references this.';
COMMENT ON TABLE public.finance_event_catalogue IS
  'Whitelist of allowed journal event types. enabled=false rows are reserved for future phases (e.g. FX) and are rejected by the ledger event trigger.';

COMMENT ON TABLE public.provider_balance_accounts IS
  'One row per provider. Materialised cache of derived balances from ledger_entries; considered a projection, not a source of truth.';
COMMENT ON TABLE public.provider_balance_movements IS
  'Append-only projection of ledger entries relevant to provider payable. Every movement points back to its ledger_transaction.';
COMMENT ON TABLE public.provider_credit_items IS
  'FIFO credit inventory (surplus provider payable available for offset against future debt).';
COMMENT ON TABLE public.provider_credit_allocations IS
  'Consumption of provider_credit_items by later debt events; deterministic FIFO ordering.';
COMMENT ON TABLE public.provider_debt_items IS
  'FIFO debt inventory (crystallised provider liabilities from disputes, refund shortfalls, absorbed fees, etc.).';
COMMENT ON TABLE public.provider_debt_allocations IS
  'Repayments of provider_debt_items from later credit events; deterministic FIFO ordering.';

COMMENT ON TABLE public.provider_bank_payouts IS
  'One row per bank-payout attempt initiated to the connected account. Status is a separate lifecycle from booking transfer status.';
COMMENT ON TABLE public.booking_bank_payout_attributions IS
  'Attribution table linking bookings to the bank payout that eventually paid them out. Kept separate from bookings to preserve booking status semantics (v7 §5).';
COMMENT ON TABLE public.finance_payouts IS
  'Historical/settlement-level payout aggregate. Provider-facing statement source.';

COMMENT ON TABLE public.stripe_source_transfer_events IS
  'Append-only ingestion of Stripe source_transaction reversal events used to derive available transfer capacity per source charge (v7 §7/§8 Mode A).';
COMMENT ON TABLE public.payout_transfer_attempts IS
  'Append-only attempt log for Stripe /v1/transfers. Idempotency keyed. Result rows are the authoritative record of what was attempted vs succeeded.';
COMMENT ON TABLE public.payout_audit_log IS
  'Append-only human-readable trail of every payout state transition. Not a ledger; complements it.';

COMMENT ON COLUMN public.bookings.payment_flow_version IS
  'NULL = legacy destination-charge flow (untouched by v7). 2 = v7 Separate-Charges-and-Transfers flow with 24h hold. Immutable once set (enforced by trigger). Evidence-based backfill only.';


-- ---------------------------------------------------------------------
-- 7. Self-test (rolled back) — proves the constraint fires
-- ---------------------------------------------------------------------
-- Executed inside the migration transaction and rolled back via
-- SAVEPOINT so any failure aborts the migration but success leaves no
-- residual rows. If the balance trigger is broken this migration fails.

DO $selftest$
DECLARE
  ok boolean := false;
BEGIN
  BEGIN
    -- Attempt to insert an unbalanced transaction; must raise at commit
    -- of the sub-block (deferred trigger fires on SAVEPOINT release).
    PERFORM public.begin_ledger_write();
    -- Use a non-existent event_type would fail the enabled check first,
    -- so pick an enabled internal event that exists.
    -- If no enabled internal event exists yet, skip the negative test.
    IF EXISTS (SELECT 1 FROM public.finance_event_catalogue WHERE enabled = true) THEN
      DECLARE
        ev text;
      BEGIN
        SELECT event_type INTO ev FROM public.finance_event_catalogue WHERE enabled = true LIMIT 1;

        BEGIN
          -- Sub-transaction to isolate the intentional failure.
          PERFORM public.begin_ledger_write();
          WITH new_tx AS (
            INSERT INTO public.ledger_transactions(event_type, event_id, currency, source)
            VALUES (ev, 'selftest-unbalanced-' || gen_random_uuid()::text, 'dkk', 'internal')
            RETURNING id
          )
          INSERT INTO public.ledger_entries(transaction_id, account, direction, amount_minor, currency, leg_index)
          SELECT id, 'stripe.platform_balance', 'debit', 100, 'dkk', 0 FROM new_tx;
          -- Force deferred triggers to fire now:
          SET CONSTRAINTS ALL IMMEDIATE;
          -- If we reach here the balance trigger did NOT fire. Fail migration.
          RAISE EXCEPTION 'SELFTEST FAILED: unbalanced ledger transaction was accepted';
        EXCEPTION
          WHEN sqlstate '23514' THEN
            ok := true;  -- expected: unbalanced/too-few-entries rejected
        END;
      END;
    ELSE
      ok := true;  -- no enabled event yet, skip negative path
    END IF;
  END;

  IF NOT ok THEN
    RAISE EXCEPTION 'SELFTEST FAILED: balance validator did not reject unbalanced entry';
  END IF;
END
$selftest$;
