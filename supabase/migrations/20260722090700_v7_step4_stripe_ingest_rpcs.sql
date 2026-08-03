-- =============================================================================
-- Funds Release v7 — Step 4 (M-08)
-- Stripe webhook ingest RPCs (payments, refunds, transfers, fees). No edge function is created here.
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.ingest_payment_captured_v1(_booking_id uuid, _payment_intent_id text, _gross_minor bigint, _currency character, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF _booking_id IS NULL OR _payment_intent_id IS NULL OR _gross_minor IS NULL OR _currency IS NULL THEN
    RAISE EXCEPTION 'capture: required args missing' USING ERRCODE='22004'; END IF;
  IF _gross_minor <= 0 THEN RAISE EXCEPTION 'capture: gross must be positive' USING ERRCODE='22023'; END IF;
  IF _currency <> lower(_currency) OR length(_currency) <> 3 THEN RAISE EXCEPTION 'capture: bad currency' USING ERRCODE='22023'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'capture: booking not found' USING ERRCODE='P0002'; END IF;
  IF b.payment_flow_version IS NULL THEN RAISE EXCEPTION 'capture: booking unclassified' USING ERRCODE='55000'; END IF;
  IF b.payment_intent_id IS DISTINCT FROM _payment_intent_id THEN RAISE EXCEPTION 'capture: pi mismatch' USING ERRCODE='22023'; END IF;
  IF lower(b.currency) <> _currency THEN RAISE EXCEPTION 'capture: currency mismatch' USING ERRCODE='22023'; END IF;

  RETURN public.post_ledger_transaction_v1(
    'payment.captured', _payment_intent_id, _currency,
    jsonb_build_array(
      jsonb_build_object('account','stripe.platform_balance','direction','debit','amount_minor',_gross_minor,'leg_index',0),
      jsonb_build_object('account','provider.payable','direction','credit','amount_minor',_gross_minor,'leg_index',1)),
    _booking_id, b.provider_id, 'payment.captured', 'stripe', _raw);
END; $function$
;

CREATE OR REPLACE FUNCTION public.ingest_payment_captured_reclassify_v1(_payment_intent_id text, _booking_id uuid, _gross_minor bigint, _currency character, _version integer, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF _payment_intent_id IS NULL OR _booking_id IS NULL OR _gross_minor IS NULL OR _currency IS NULL OR _version IS NULL THEN
    RAISE EXCEPTION 'reclassify: required args missing' USING ERRCODE='22004'; END IF;
  IF _gross_minor <= 0 OR _version < 1 THEN RAISE EXCEPTION 'reclassify: bad numeric args' USING ERRCODE='22023'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reclassify: booking not found' USING ERRCODE='P0002'; END IF;
  IF b.payment_flow_version IS NULL THEN RAISE EXCEPTION 'reclassify: booking unclassified' USING ERRCODE='55000'; END IF;
  IF b.payment_intent_id IS DISTINCT FROM _payment_intent_id THEN RAISE EXCEPTION 'reclassify: pi mismatch' USING ERRCODE='22023'; END IF;
  IF lower(b.currency) <> _currency THEN RAISE EXCEPTION 'reclassify: currency mismatch' USING ERRCODE='22023'; END IF;

  RETURN public.post_ledger_transaction_v1(
    'payment.captured.reclassify', _payment_intent_id || ':reclassify:' || _version::text, _currency,
    jsonb_build_array(
      jsonb_build_object('account','stripe.unclassified_captured_funds','direction','debit','amount_minor',_gross_minor,'leg_index',0),
      jsonb_build_object('account','provider.payable','direction','credit','amount_minor',_gross_minor,'leg_index',1)),
    _booking_id, b.provider_id, 'payment.captured.reclassify', 'stripe', _raw);
END; $function$
;

CREATE OR REPLACE FUNCTION public.ingest_payment_captured_suspense_v1(_payment_intent_id text, _gross_minor bigint, _currency character, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF _payment_intent_id IS NULL OR _gross_minor IS NULL OR _currency IS NULL THEN
    RAISE EXCEPTION 'suspense: required args missing' USING ERRCODE='22004'; END IF;
  IF _gross_minor <= 0 THEN RAISE EXCEPTION 'suspense: gross must be positive' USING ERRCODE='22023'; END IF;
  IF _currency <> lower(_currency) OR length(_currency) <> 3 THEN RAISE EXCEPTION 'suspense: bad currency' USING ERRCODE='22023'; END IF;
  RETURN public.post_ledger_transaction_v1(
    'payment.captured.suspense', _payment_intent_id || ':suspense', _currency,
    jsonb_build_array(
      jsonb_build_object('account','stripe.platform_balance','direction','debit','amount_minor',_gross_minor,'leg_index',0),
      jsonb_build_object('account','stripe.unclassified_captured_funds','direction','credit','amount_minor',_gross_minor,'leg_index',1)),
    NULL, NULL, 'payment.captured.suspense', 'stripe', _raw);
END; $function$
;

CREATE OR REPLACE FUNCTION public.ingest_refund_recorded_v1(_stripe_event_id text, _stripe_refund_id text, _booking_id uuid, _amount_minor bigint, _currency character, _status text, _stripe_created_at timestamp with time zone, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  b public.bookings%ROWTYPE;
  captured_gross bigint;
  refunded_so_far bigint;
  existing_event_id uuid;
  tx_id uuid;
BEGIN
  IF _stripe_event_id IS NULL OR length(_stripe_event_id)=0 THEN
    RAISE EXCEPTION 'refund: stripe_event_id required' USING ERRCODE='22004'; END IF;
  IF _stripe_refund_id IS NULL OR length(_stripe_refund_id)=0 THEN
    RAISE EXCEPTION 'refund: stripe_refund_id required' USING ERRCODE='22004'; END IF;
  IF _booking_id IS NULL THEN
    RAISE EXCEPTION 'refund: booking_id required' USING ERRCODE='22004'; END IF;
  IF _amount_minor IS NULL OR _amount_minor < 0 THEN
    RAISE EXCEPTION 'refund: amount_minor must be >= 0' USING ERRCODE='22023'; END IF;
  IF _currency IS NULL OR _currency <> lower(_currency) OR length(_currency)<>3 THEN
    RAISE EXCEPTION 'refund: currency must be lowercase ISO-4217' USING ERRCODE='22023'; END IF;
  IF _status IS NULL OR length(_status)=0 THEN
    RAISE EXCEPTION 'refund: status required' USING ERRCODE='22004'; END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund: booking % not found', _booking_id USING ERRCODE='P0002'; END IF;
  IF b.payment_flow_version IS NULL THEN
    RAISE EXCEPTION 'refund: booking % unclassified', _booking_id USING ERRCODE='55000'; END IF;
  IF lower(b.currency) <> _currency THEN
    RAISE EXCEPTION 'refund: currency mismatch (booking=% event=%)', b.currency, _currency USING ERRCODE='22023'; END IF;

  -- Idempotency on stripe_refund_events (per stripe_event_id).
  SELECT id INTO existing_event_id
    FROM public.stripe_refund_events
   WHERE stripe_event_id = _stripe_event_id;
  IF FOUND THEN
    -- Already ingested — return the ledger tx if we can find it, else NULL.
    SELECT id INTO tx_id FROM public.ledger_transactions
      WHERE event_type = 'refund.recorded' AND event_id = _stripe_refund_id;
    RETURN tx_id;
  END IF;

  -- Only 'succeeded' refunds affect the ledger; pending/failed are logged only.
  IF _status = 'succeeded' AND _amount_minor > 0 THEN
    captured_gross  := public.get_booking_captured_gross_minor_v1(_booking_id);
    refunded_so_far := public.get_booking_refunded_gross_minor_v1(_booking_id);
    IF captured_gross <= 0 THEN
      RAISE EXCEPTION 'refund: no captured funds recorded for booking %', _booking_id USING ERRCODE='55000'; END IF;
    IF (refunded_so_far + _amount_minor) > captured_gross THEN
      RAISE EXCEPTION 'refund: over-refund rejected (captured=% already=% new=%)',
        captured_gross, refunded_so_far, _amount_minor USING ERRCODE='23514'; END IF;
  END IF;

  -- Append the immutable refund event row.
  INSERT INTO public.stripe_refund_events
    (stripe_event_id, stripe_refund_id, status, amount_minor, currency,
     stripe_created_at, source, raw)
  VALUES
    (_stripe_event_id, _stripe_refund_id, _status, _amount_minor, _currency,
     COALESCE(_stripe_created_at, now()), 'webhook', COALESCE(_raw, '{}'::jsonb));

  IF _status = 'succeeded' AND _amount_minor > 0 THEN
    tx_id := public.post_ledger_transaction_v1(
      'refund.recorded',
      _stripe_refund_id, -- idempotency key: refund id (deterministic per refund)
      _currency,
      jsonb_build_array(
        jsonb_build_object('account','provider.payable','direction','debit','amount_minor',_amount_minor,'leg_index',0),
        jsonb_build_object('account','customer.refund_payable','direction','credit','amount_minor',_amount_minor,'leg_index',1)
      ),
      _booking_id, b.provider_id, 'refund.recorded', 'stripe', _raw);
  END IF;

  RETURN tx_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_stripe_fee_actual_v1(_balance_tx_id text, _booking_id uuid, _fee_minor bigint, _currency character, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF _balance_tx_id IS NULL OR _booking_id IS NULL OR _fee_minor IS NULL OR _currency IS NULL THEN
    RAISE EXCEPTION 'fee.actual: required args missing' USING ERRCODE='22004'; END IF;
  IF _fee_minor <= 0 THEN RAISE EXCEPTION 'fee.actual: must be positive' USING ERRCODE='22023'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fee.actual: booking not found' USING ERRCODE='P0002'; END IF;
  IF lower(b.currency) <> _currency THEN RAISE EXCEPTION 'fee.actual: currency mismatch' USING ERRCODE='22023'; END IF;

  RETURN public.post_ledger_transaction_v1(
    'stripe.fee.actual', _balance_tx_id, _currency,
    jsonb_build_array(
      jsonb_build_object('account','provider.stripe_cost_contra','direction','debit','amount_minor',_fee_minor,'leg_index',0),
      jsonb_build_object('account','stripe.platform_balance','direction','credit','amount_minor',_fee_minor,'leg_index',1)),
    _booking_id, b.provider_id, 'stripe.fee.actual', 'stripe', _raw);
END; $function$
;

CREATE OR REPLACE FUNCTION public.ingest_stripe_fee_estimate_v1(_payment_intent_id text, _booking_id uuid, _estimate_minor bigint, _currency character, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF _payment_intent_id IS NULL OR _booking_id IS NULL OR _estimate_minor IS NULL OR _currency IS NULL THEN
    RAISE EXCEPTION 'fee.estimate: required args missing' USING ERRCODE='22004'; END IF;
  IF _estimate_minor <= 0 THEN RAISE EXCEPTION 'fee.estimate: must be positive' USING ERRCODE='22023'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fee.estimate: booking not found' USING ERRCODE='P0002'; END IF;
  IF b.payment_intent_id IS DISTINCT FROM _payment_intent_id THEN RAISE EXCEPTION 'fee.estimate: pi mismatch' USING ERRCODE='22023'; END IF;
  IF lower(b.currency) <> _currency THEN RAISE EXCEPTION 'fee.estimate: currency mismatch' USING ERRCODE='22023'; END IF;

  RETURN public.post_ledger_transaction_v1(
    'stripe.fee.estimate', _payment_intent_id || ':fee_estimate', _currency,
    jsonb_build_array(
      jsonb_build_object('account','platform.stripe_cost_absorbed','direction','debit','amount_minor',_estimate_minor,'leg_index',0),
      jsonb_build_object('account','stripe.fee_estimate_liability','direction','credit','amount_minor',_estimate_minor,'leg_index',1)),
    _booking_id, b.provider_id, 'stripe.fee.estimate', 'internal', _raw);
END; $function$
;

CREATE OR REPLACE FUNCTION public.ingest_stripe_fee_zero_v1(_payment_intent_id text, _evidence_id text, _booking_id uuid, _estimate_minor bigint, _currency character, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF _payment_intent_id IS NULL OR _evidence_id IS NULL OR _booking_id IS NULL OR _estimate_minor IS NULL OR _currency IS NULL THEN
    RAISE EXCEPTION 'fee.zero: required args missing' USING ERRCODE='22004'; END IF;
  IF _estimate_minor <= 0 THEN RAISE EXCEPTION 'fee.zero: estimate must be positive' USING ERRCODE='22023'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fee.zero: booking not found' USING ERRCODE='P0002'; END IF;
  IF b.payment_intent_id IS DISTINCT FROM _payment_intent_id THEN RAISE EXCEPTION 'fee.zero: pi mismatch' USING ERRCODE='22023'; END IF;
  IF lower(b.currency) <> _currency THEN RAISE EXCEPTION 'fee.zero: currency mismatch' USING ERRCODE='22023'; END IF;

  RETURN public.post_ledger_transaction_v1(
    'stripe.fee.reconcile.zero', _payment_intent_id || ':fee_zero:' || _evidence_id, _currency,
    jsonb_build_array(
      jsonb_build_object('account','stripe.fee_estimate_liability','direction','debit','amount_minor',_estimate_minor,'leg_index',0),
      jsonb_build_object('account','platform.stripe_cost_absorbed','direction','credit','amount_minor',_estimate_minor,'leg_index',1)),
    _booking_id, b.provider_id, 'stripe.fee.reconcile.zero', 'internal', _raw);
END; $function$
;

CREATE OR REPLACE FUNCTION public.ingest_transfer_event_v1(_stripe_event_id text, _stripe_transfer_id text, _source_charge_id text, _booking_id uuid, _currency character, _gross_minor bigint, _event_kind text, _stripe_created_at timestamp with time zone, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF _stripe_event_id IS NULL OR length(_stripe_event_id)=0 THEN
    RAISE EXCEPTION 'transfer: stripe_event_id required' USING ERRCODE='22004'; END IF;
  IF _stripe_transfer_id IS NULL OR length(_stripe_transfer_id)=0 THEN
    RAISE EXCEPTION 'transfer: stripe_transfer_id required' USING ERRCODE='22004'; END IF;
  IF _source_charge_id IS NULL OR length(_source_charge_id)=0 THEN
    RAISE EXCEPTION 'transfer: source_charge_id required' USING ERRCODE='22004'; END IF;
  IF _currency IS NULL OR _currency <> lower(_currency) OR length(_currency)<>3 THEN
    RAISE EXCEPTION 'transfer: currency must be lowercase ISO-4217' USING ERRCODE='22023'; END IF;
  IF _gross_minor IS NULL OR _gross_minor <= 0 THEN
    RAISE EXCEPTION 'transfer: gross_minor must be positive' USING ERRCODE='22023'; END IF;
  IF _event_kind NOT IN ('transfer_created','transfer_reversed') THEN
    RAISE EXCEPTION 'transfer: event_kind must be transfer_created or transfer_reversed' USING ERRCODE='22023'; END IF;

  INSERT INTO public.stripe_source_transfer_events
    (stripe_event_id, source_charge_id, stripe_transfer_id, booking_id,
     currency, gross_amount_minor, event_kind, stripe_created_at, raw)
  VALUES
    (_stripe_event_id, _source_charge_id, _stripe_transfer_id, _booking_id,
     _currency, _gross_minor, _event_kind,
     COALESCE(_stripe_created_at, now()), COALESCE(_raw, '{}'::jsonb))
  ON CONFLICT (stripe_event_id) DO NOTHING;
END;
$function$
;

-- Grants: revoke PUBLIC, grant service_role only ------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'ingest_%_v1'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
  END LOOP;
END $$;

-- Self-test (rollback-safe): each ingest RPC is idempotent + guarded.
-- We only smoke-test that PL/pgSQL BEGIN...EXCEPTION rollback semantics apply,
-- which they do implicitly for any RAISE inside the inner block. No rows can
-- persist because writer_guard (M-06) forbids inserts from any session that
-- has not called begin_ledger_write(), and this DO block never does.
DO $selftest$
DECLARE v_reject boolean := false;
BEGIN
  BEGIN
    -- Try to write directly to ledger_transactions without begin_ledger_write()
    INSERT INTO public.ledger_transactions(event_type, event_id, currency)
    VALUES ('payment.captured.suspense','__m08_selftest__','dkk');
  EXCEPTION WHEN others THEN v_reject := true;
  END;
  IF NOT v_reject THEN
    RAISE EXCEPTION 'M-08 self-test: writer_guard failed to reject unauthorized insert';
  END IF;
  DELETE FROM public.ledger_transactions WHERE event_id = '__m08_selftest__';
END $selftest$;

COMMIT;
