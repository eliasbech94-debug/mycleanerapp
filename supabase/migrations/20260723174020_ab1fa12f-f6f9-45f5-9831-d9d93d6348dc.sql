
-- =====================================================================
-- Funds Release v7 — Step 3
-- =====================================================================

ALTER TABLE public.ledger_transactions
  ADD COLUMN IF NOT EXISTS payload_fingerprint text;

COMMENT ON COLUMN public.ledger_transactions.payload_fingerprint IS
  'SHA-256 hex of the normalized economic payload (event_type,event_id,currency,booking_id,provider_user_id,sorted-entries). Used by post_ledger_transaction_v1 for idempotency-payload conflict detection. Never updated after insert.';

-- ---------------------------------------------------------------------
-- 1. Internal helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ledger_normalize_entries(_entries jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'account',      (e->>'account'),
        'direction',    (e->>'direction'),
        'amount_minor', (e->>'amount_minor')::bigint,
        'leg_index',    COALESCE((e->>'leg_index')::int, 0)
      )
      ORDER BY
        (e->>'account'),
        (e->>'direction'),
        COALESCE((e->>'leg_index')::int, 0),
        (e->>'amount_minor')::bigint
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(_entries, '[]'::jsonb)) e;
$$;
REVOKE ALL ON FUNCTION public._ledger_normalize_entries(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._ledger_payload_fingerprint(
  _event_type text, _event_id text, _currency char(3),
  _booking_id uuid, _provider_user_id uuid, _entries jsonb
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(
    extensions.digest(
      jsonb_build_object(
        'event_type', _event_type,
        'event_id', _event_id,
        'currency', _currency,
        'booking_id', _booking_id,
        'provider_user_id', _provider_user_id,
        'entries', public._ledger_normalize_entries(_entries)
      )::text, 'sha256'), 'hex');
$$;
REVOKE ALL ON FUNCTION public._ledger_payload_fingerprint(text,text,char,uuid,uuid,jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 2. Classification RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classify_booking_payment_flow_v1(
  _booking_id uuid, _flow booking_payment_flow_version, _reason text DEFAULT NULL
) RETURNS booking_payment_flow_version
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF _booking_id IS NULL THEN RAISE EXCEPTION 'classify: booking_id required' USING ERRCODE='22004'; END IF;
  IF _flow IS NULL THEN RAISE EXCEPTION 'classify: flow required' USING ERRCODE='22004'; END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'classify: booking % not found', _booking_id USING ERRCODE='P0002'; END IF;

  IF b.payment_intent_id IS NULL OR length(b.payment_intent_id) = 0 THEN
    RAISE EXCEPTION 'classify: booking % has no payment_intent_id; ambiguous', _booking_id USING ERRCODE='22023';
  END IF;
  IF b.currency IS NULL OR length(b.currency) <> 3 THEN
    RAISE EXCEPTION 'classify: booking % invalid currency', _booking_id USING ERRCODE='22023';
  END IF;
  IF _flow = 'destination_charge_v1' AND (b.provider_stripe_account_id IS NULL OR length(b.provider_stripe_account_id) = 0) THEN
    RAISE EXCEPTION 'classify: destination_charge_v1 requires provider_stripe_account_id on booking %', _booking_id USING ERRCODE='22023';
  END IF;

  IF b.payment_flow_version IS NOT NULL THEN
    IF b.payment_flow_version = _flow THEN RETURN b.payment_flow_version; END IF;
    RAISE EXCEPTION 'classify: booking % already classified as % (requested %)',
      _booking_id, b.payment_flow_version, _flow USING ERRCODE='55000';
  END IF;

  UPDATE public.bookings
     SET payment_flow_version = _flow, updated_at = now()
   WHERE id = _booking_id AND payment_flow_version IS NULL;

  IF NOT FOUND THEN
    SELECT payment_flow_version INTO b.payment_flow_version FROM public.bookings WHERE id = _booking_id;
    IF b.payment_flow_version = _flow THEN RETURN _flow; END IF;
    RAISE EXCEPTION 'classify: concurrent conflict on booking %', _booking_id USING ERRCODE='40001';
  END IF;

  BEGIN
    INSERT INTO public.admin_audit_log(actor_role, action, target_type, target_id, booking_id, new_state, metadata)
    VALUES ('system','classify_booking_payment_flow','booking', _booking_id::text, _booking_id,
            jsonb_build_object('payment_flow_version', _flow::text),
            jsonb_build_object('reason', COALESCE(_reason,'unspecified')));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN _flow;
END;
$$;
REVOKE ALL ON FUNCTION public.classify_booking_payment_flow_v1(uuid,booking_payment_flow_version,text) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Ledger writing primitive
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_ledger_transaction_v1(
  _event_type text, _event_id text, _currency char(3), _entries jsonb,
  _booking_id uuid DEFAULT NULL, _provider_user_id uuid DEFAULT NULL,
  _memo text DEFAULT NULL, _source text DEFAULT 'internal', _raw jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  cat public.finance_event_catalogue%ROWTYPE;
  fp text; existing public.ledger_transactions%ROWTYPE;
  new_tx_id uuid; norm jsonb; entry jsonb; entry_count int;
  total_dr bigint := 0; total_cr bigint := 0;
  acc public.finance_accounts%ROWTYPE;
BEGIN
  IF _event_type IS NULL OR _event_id IS NULL THEN
    RAISE EXCEPTION 'ledger: event_type and event_id required' USING ERRCODE='22004';
  END IF;
  IF _currency IS NULL OR _currency <> lower(_currency) OR length(_currency) <> 3 THEN
    RAISE EXCEPTION 'ledger: currency must be lowercase ISO-4217 (3 chars)' USING ERRCODE='22023';
  END IF;

  SELECT * INTO cat FROM public.finance_event_catalogue WHERE event_type = _event_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger: unknown event_type %', _event_type USING ERRCODE='22023'; END IF;
  IF cat.reserved OR NOT cat.enabled THEN
    RAISE EXCEPTION 'ledger: event_type % disabled/reserved', _event_type USING ERRCODE='22023';
  END IF;
  IF cat.idempotency_shape = 'RESERVED' THEN
    RAISE EXCEPTION 'ledger: event_type % reserved idempotency shape', _event_type USING ERRCODE='22023';
  END IF;
  IF length(coalesce(_event_id,'')) = 0 THEN
    RAISE EXCEPTION 'ledger: event_id empty for %', _event_type USING ERRCODE='22023';
  END IF;

  norm := public._ledger_normalize_entries(_entries);
  entry_count := jsonb_array_length(norm);
  IF entry_count < 2 THEN
    RAISE EXCEPTION 'ledger: at least two entries required (got %)', entry_count USING ERRCODE='23514';
  END IF;

  fp := public._ledger_payload_fingerprint(_event_type,_event_id,_currency,_booking_id,_provider_user_id,norm);

  SELECT * INTO existing FROM public.ledger_transactions
    WHERE event_type = _event_type AND event_id = _event_id;
  IF FOUND THEN
    IF existing.payload_fingerprint IS NULL OR existing.payload_fingerprint = fp THEN RETURN existing.id; END IF;
    RAISE EXCEPTION 'ledger: idempotency-key conflict for %/% (payload differs)', _event_type, _event_id USING ERRCODE='23505';
  END IF;

  FOR entry IN SELECT * FROM jsonb_array_elements(norm) LOOP
    IF (entry->>'account') IS NULL OR (entry->>'direction') IS NULL OR (entry->>'amount_minor') IS NULL THEN
      RAISE EXCEPTION 'ledger: entry missing fields: %', entry USING ERRCODE='22004';
    END IF;
    IF (entry->>'direction') NOT IN ('debit','credit') THEN
      RAISE EXCEPTION 'ledger: invalid direction %', entry->>'direction' USING ERRCODE='22023';
    END IF;
    IF ((entry->>'amount_minor')::bigint) <= 0 THEN
      RAISE EXCEPTION 'ledger: amount_minor must be positive' USING ERRCODE='22023';
    END IF;
    SELECT * INTO acc FROM public.finance_accounts WHERE code = (entry->>'account');
    IF NOT FOUND THEN RAISE EXCEPTION 'ledger: unknown account %', entry->>'account' USING ERRCODE='22023'; END IF;
    IF acc.reserved OR NOT acc.enabled THEN
      RAISE EXCEPTION 'ledger: account % disabled/reserved', acc.code USING ERRCODE='22023';
    END IF;
    IF (entry->>'direction') = 'debit'  THEN total_dr := total_dr + (entry->>'amount_minor')::bigint; END IF;
    IF (entry->>'direction') = 'credit' THEN total_cr := total_cr + (entry->>'amount_minor')::bigint; END IF;
  END LOOP;

  IF total_dr <> total_cr THEN
    RAISE EXCEPTION 'ledger: unbalanced (debit=% credit=%)', total_dr, total_cr USING ERRCODE='23514';
  END IF;

  PERFORM public.begin_ledger_write();

  INSERT INTO public.ledger_transactions
    (event_type, event_id, currency, booking_id, provider_user_id, memo, source, raw, payload_fingerprint)
  VALUES
    (_event_type, _event_id, _currency, _booking_id, _provider_user_id, _memo,
     COALESCE(_source,'internal'), _raw, fp)
  RETURNING id INTO new_tx_id;

  INSERT INTO public.ledger_entries
    (transaction_id, account, direction, amount_minor, currency, booking_id, provider_user_id, leg_index)
  SELECT new_tx_id, (e->>'account'), (e->>'direction')::ledger_entry_direction,
         (e->>'amount_minor')::bigint, _currency, _booking_id, _provider_user_id,
         COALESCE((e->>'leg_index')::int, ord - 1)
  FROM jsonb_array_elements(norm) WITH ORDINALITY AS t(e, ord);

  RETURN new_tx_id;

EXCEPTION WHEN unique_violation THEN
  SELECT * INTO existing FROM public.ledger_transactions
    WHERE event_type = _event_type AND event_id = _event_id;
  IF FOUND AND (existing.payload_fingerprint IS NULL OR existing.payload_fingerprint = fp) THEN
    RETURN existing.id;
  END IF;
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.post_ledger_transaction_v1(text,text,char,jsonb,uuid,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Ingestion primitives
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_payment_captured_v1(
  _booking_id uuid, _payment_intent_id text, _gross_minor bigint, _currency char(3), _raw jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.ingest_payment_captured_v1(uuid,text,bigint,char,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ingest_payment_captured_suspense_v1(
  _payment_intent_id text, _gross_minor bigint, _currency char(3), _raw jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.ingest_payment_captured_suspense_v1(text,bigint,char,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ingest_payment_captured_reclassify_v1(
  _payment_intent_id text, _booking_id uuid, _gross_minor bigint, _currency char(3), _version int, _raw jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.ingest_payment_captured_reclassify_v1(text,uuid,bigint,char,int,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ingest_stripe_fee_estimate_v1(
  _payment_intent_id text, _booking_id uuid, _estimate_minor bigint, _currency char(3), _raw jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.ingest_stripe_fee_estimate_v1(text,uuid,bigint,char,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ingest_stripe_fee_actual_v1(
  _balance_tx_id text, _booking_id uuid, _fee_minor bigint, _currency char(3), _raw jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.ingest_stripe_fee_actual_v1(text,uuid,bigint,char,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ingest_stripe_fee_zero_v1(
  _payment_intent_id text, _evidence_id text, _booking_id uuid, _estimate_minor bigint, _currency char(3), _raw jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.ingest_stripe_fee_zero_v1(text,text,uuid,bigint,char,jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Source-linked transfer capacity
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_source_transfer_capacity_v1(
  _source_charge_id text, _currency char(3), _expected_charge_gross_minor bigint
) RETURNS TABLE (
  source_charge_id text, currency char(3), charge_gross_minor bigint,
  consumed_minor bigint, remaining_minor bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_consumed bigint := 0;
  v_seen_currency char(3);
BEGIN
  IF _source_charge_id IS NULL OR _currency IS NULL OR _expected_charge_gross_minor IS NULL THEN
    RAISE EXCEPTION 'capacity: required args missing' USING ERRCODE='22004'; END IF;
  IF _currency <> lower(_currency) OR length(_currency) <> 3 THEN
    RAISE EXCEPTION 'capacity: bad currency' USING ERRCODE='22023'; END IF;
  IF _expected_charge_gross_minor <= 0 THEN
    RAISE EXCEPTION 'capacity: expected_charge_gross_minor must be positive' USING ERRCODE='22023'; END IF;

  SELECT COALESCE(SUM(e.gross_amount_minor), 0), min(e.currency)
    INTO v_consumed, v_seen_currency
    FROM public.stripe_source_transfer_events e
   WHERE e.source_charge_id = _source_charge_id
     AND e.event_kind = 'transfer_created';

  IF v_consumed > 0 AND v_seen_currency IS NOT NULL AND v_seen_currency <> _currency THEN
    RAISE EXCEPTION 'capacity: currency mismatch for charge % (events=% arg=%)',
      _source_charge_id, v_seen_currency, _currency USING ERRCODE='22023';
  END IF;
  IF v_consumed > _expected_charge_gross_minor THEN
    RAISE EXCEPTION 'capacity: over-capacity for charge % (consumed=% > gross=%)',
      _source_charge_id, v_consumed, _expected_charge_gross_minor USING ERRCODE='23514';
  END IF;

  RETURN QUERY SELECT
    _source_charge_id, _currency, _expected_charge_gross_minor, v_consumed,
    (_expected_charge_gross_minor - v_consumed);
END; $$;
REVOKE ALL ON FUNCTION public.get_source_transfer_capacity_v1(text,char,bigint) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON public.v_source_transfer_capacity FROM anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Self-tests
-- ---------------------------------------------------------------------
DO $selftest$
DECLARE
  fp1 text; fp2 text; fp3 text;
  tx_a uuid; tx_b uuid;
  cap_row record;
  did_raise boolean;
BEGIN
  fp1 := public._ledger_payload_fingerprint('payment.captured','pi_test','dkk',NULL,NULL,
    jsonb_build_array(
      jsonb_build_object('account','stripe.platform_balance','direction','debit','amount_minor',1000,'leg_index',0),
      jsonb_build_object('account','provider.payable','direction','credit','amount_minor',1000,'leg_index',1)));
  fp2 := public._ledger_payload_fingerprint('payment.captured','pi_test','dkk',NULL,NULL,
    jsonb_build_array(
      jsonb_build_object('account','provider.payable','direction','credit','amount_minor',1000,'leg_index',1),
      jsonb_build_object('account','stripe.platform_balance','direction','debit','amount_minor',1000,'leg_index',0)));
  IF fp1 <> fp2 THEN RAISE EXCEPTION 'selftest: fingerprint unstable under reorder'; END IF;

  fp3 := public._ledger_payload_fingerprint('payment.captured','pi_test','dkk',NULL,NULL,
    jsonb_build_array(
      jsonb_build_object('account','stripe.platform_balance','direction','debit','amount_minor',9999,'leg_index',0),
      jsonb_build_object('account','provider.payable','direction','credit','amount_minor',9999,'leg_index',1)));
  IF fp3 = fp1 THEN RAISE EXCEPTION 'selftest: fingerprint collision on differing amount'; END IF;

  did_raise := false;
  BEGIN
    PERFORM public.post_ledger_transaction_v1(
      'payment.captured','pi_test_bad','dkk',
      jsonb_build_array(
        jsonb_build_object('account','stripe.platform_balance','direction','debit','amount_minor',1000),
        jsonb_build_object('account','provider.payable','direction','credit','amount_minor',900)));
  EXCEPTION WHEN OTHERS THEN did_raise := true; END;
  IF NOT did_raise THEN RAISE EXCEPTION 'selftest: unbalanced accepted'; END IF;

  did_raise := false;
  BEGIN
    PERFORM public.post_ledger_transaction_v1('fx.conversion.charge_side','x','dkk',
      jsonb_build_array(
        jsonb_build_object('account','stripe.platform_balance','direction','debit','amount_minor',1),
        jsonb_build_object('account','provider.payable','direction','credit','amount_minor',1)));
  EXCEPTION WHEN OTHERS THEN did_raise := true; END;
  IF NOT did_raise THEN RAISE EXCEPTION 'selftest: reserved event accepted'; END IF;

  tx_a := public.ingest_payment_captured_suspense_v1('pi_selftest_suspense', 12345, 'dkk');
  tx_b := public.ingest_payment_captured_suspense_v1('pi_selftest_suspense', 12345, 'dkk');
  IF tx_a IS NULL OR tx_a <> tx_b THEN RAISE EXCEPTION 'selftest: suspense replay mismatch (a=% b=%)', tx_a, tx_b; END IF;

  did_raise := false;
  BEGIN
    PERFORM public.ingest_payment_captured_suspense_v1('pi_selftest_suspense', 99999, 'dkk');
  EXCEPTION WHEN OTHERS THEN did_raise := true; END;
  IF NOT did_raise THEN RAISE EXCEPTION 'selftest: idempotency payload-conflict not detected'; END IF;

  SELECT * INTO cap_row FROM public.get_source_transfer_capacity_v1('ch_none_selftest','dkk',10000);
  IF cap_row.remaining_minor <> 10000 THEN
    RAISE EXCEPTION 'selftest: capacity wrong for empty charge (%)', cap_row.remaining_minor;
  END IF;

  RAISE NOTICE 'funds_release v7 step 3: self-tests OK';
END $selftest$;

-- ---------------------------------------------------------------------
-- 7. Flag must remain disabled
-- ---------------------------------------------------------------------
DO $$
DECLARE en boolean;
BEGIN
  SELECT enabled INTO en FROM public.feature_flags
   WHERE flag_key = 'funds_release.enabled' AND scope = 'global';
  IF COALESCE(en, false) THEN
    RAISE EXCEPTION 'funds_release.enabled must remain false at end of Step 3';
  END IF;
END $$;
