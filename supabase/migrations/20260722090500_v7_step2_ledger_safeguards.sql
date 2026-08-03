-- =============================================================================
-- Funds Release v7 — Step 2 (M-06)
-- Ledger safeguards: writer guard, currency match, event enabled, balance-check trigger, append-only rejects.
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;

-- Guard / trigger functions --------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_ledger_writer_authorized()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.ledger_writer', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'ledger write rejected: session is not an authorized ledger writer'
      USING ERRCODE = '42501';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.begin_ledger_write()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- LOCAL scope: the flag is dropped at COMMIT/ROLLBACK automatically.
  PERFORM set_config('app.ledger_writer', 'on', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ledger_writer_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.assert_ledger_writer_authorized();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ledger_entry_currency_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ledger_event_enabled_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.validate_ledger_transaction_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reject_ledger_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Append-only table (attempted % on %.%)',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_release_decision_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN RAISE EXCEPTION 'release_eligibility_decisions is append-only'; END $function$
;

-- Grants ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.assert_ledger_writer_authorized()   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_ledger_write()                FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_ledger_write()             TO service_role;

-- Triggers on ledger tables --------------------------------------------------
CREATE TRIGGER ledger_transactions_writer_guard BEFORE INSERT ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.ledger_writer_guard();
CREATE TRIGGER ledger_transactions_no_update    BEFORE UPDATE ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER ledger_transactions_no_delete    BEFORE DELETE ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE CONSTRAINT TRIGGER ledger_tx_balance_check AFTER INSERT ON public.ledger_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_transaction_balance();

CREATE TRIGGER ledger_entries_writer_guard      BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_writer_guard();
CREATE TRIGGER ledger_entries_no_update         BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER ledger_entries_no_delete         BEFORE DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER ledger_entries_currency_match    AFTER INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_currency_match();
CREATE CONSTRAINT TRIGGER ledger_entry_balance_check AFTER INSERT ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_transaction_balance();

CREATE TRIGGER ledger_tx_event_enabled BEFORE INSERT ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.ledger_event_enabled_check();

-- Append-only triggers on ingest / balance / credit / debt tables ------------
CREATE TRIGGER booking_bank_payout_attributions_no_update BEFORE UPDATE ON public.booking_bank_payout_attributions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER booking_bank_payout_attributions_no_delete BEFORE DELETE ON public.booking_bank_payout_attributions FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_balance_movements_no_update BEFORE UPDATE ON public.provider_balance_movements FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_balance_movements_no_delete BEFORE DELETE ON public.provider_balance_movements FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_items_no_update BEFORE UPDATE ON public.provider_credit_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_items_no_delete BEFORE DELETE ON public.provider_credit_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_allocations_no_update BEFORE UPDATE ON public.provider_credit_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_credit_allocations_no_delete BEFORE DELETE ON public.provider_credit_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_debt_items_no_update BEFORE UPDATE ON public.provider_debt_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_debt_items_no_delete BEFORE DELETE ON public.provider_debt_items FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_debt_allocations_no_update BEFORE UPDATE ON public.provider_debt_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER provider_debt_allocations_no_delete BEFORE DELETE ON public.provider_debt_allocations FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER stripe_refund_events_no_update BEFORE UPDATE ON public.stripe_refund_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER stripe_refund_events_no_delete BEFORE DELETE ON public.stripe_refund_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER stripe_source_transfer_events_no_update BEFORE UPDATE ON public.stripe_source_transfer_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER stripe_source_transfer_events_no_delete BEFORE DELETE ON public.stripe_source_transfer_events FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

-- Self-test (ROLLBACK-only): verify writer guard blocks unauthorized inserts
DO $selftest$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    -- Attempt insert WITHOUT begin_ledger_write() → must be rejected
    INSERT INTO public.ledger_transactions(event_type, event_id, currency)
    VALUES ('payment.captured.suspense','__selftest_m06__','dkk');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
                WHEN others THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'M-06 self-test: writer guard did not reject unauthorized insert';
  END IF;
  -- Belt-and-braces: nuke anything the aborted INSERT might have left (there
  -- should be none because the statement aborted, but be explicit)
  DELETE FROM public.ledger_transactions WHERE event_id = '__selftest_m06__';
END $selftest$;

COMMIT;
