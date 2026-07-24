-- =============================================================================
-- Funds Release v7 — Step 3 (M-07)
-- Ledger helpers + post_ledger_transaction_v1 + classify_booking_payment_flow_v1 + capacity/readiness read RPCs.
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public._ledger_normalize_entries(_entries jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._ledger_payload_fingerprint(_event_type text, _event_id text, _currency character, _booking_id uuid, _provider_user_id uuid, _entries jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.post_ledger_transaction_v1(_event_type text, _event_id text, _currency character, _entries jsonb, _booking_id uuid DEFAULT NULL::uuid, _provider_user_id uuid DEFAULT NULL::uuid, _memo text DEFAULT NULL::text, _source text DEFAULT 'internal'::text, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.classify_booking_payment_flow_v1(_booking_id uuid, _flow booking_payment_flow_version, _reason text DEFAULT NULL::text)
 RETURNS booking_payment_flow_version
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_source_transfer_capacity_v1(_source_charge_id text, _currency character, _expected_charge_gross_minor bigint)
 RETURNS TABLE(source_charge_id text, currency character, charge_gross_minor bigint, consumed_minor bigint, remaining_minor bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END; $function$
;

CREATE OR REPLACE FUNCTION public.provider_can_receive_payout(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.provider_profiles pp
    WHERE pp.user_id = _uid
      AND pp.status IN ('active','paused','suspended')
      AND pp.stripe_payouts_enabled
      AND NOT pp.payout_frozen
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_booking_captured_gross_minor_v1(_booking_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(e.amount_minor), 0)::bigint
  FROM public.ledger_entries e
  JOIN public.ledger_transactions t ON t.id = e.transaction_id
  WHERE e.booking_id = _booking_id
    AND e.account = 'provider.payable'
    AND e.direction = 'credit'
    AND t.event_type IN ('payment.captured','payment.captured.reclassify');
$function$
;

CREATE OR REPLACE FUNCTION public.get_booking_refunded_gross_minor_v1(_booking_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(e.amount_minor), 0)::bigint
  FROM public.ledger_entries e
  JOIN public.ledger_transactions t ON t.id = e.transaction_id
  WHERE e.booking_id = _booking_id
    AND e.account = 'customer.refund_payable'
    AND e.direction = 'credit'
    AND t.event_type = 'refund.recorded';
$function$
;

-- Grants ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.post_ledger_transaction_v1(text,text,character,jsonb,uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_ledger_transaction_v1(text,text,character,jsonb,uuid,uuid,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.classify_booking_payment_flow_v1(uuid,public.booking_payment_flow_version,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classify_booking_payment_flow_v1(uuid,public.booking_payment_flow_version,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_source_transfer_capacity_v1(text, character, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_source_transfer_capacity_v1(text, character, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.get_booking_captured_gross_minor_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_captured_gross_minor_v1(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_booking_refunded_gross_minor_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_refunded_gross_minor_v1(uuid) TO service_role;

-- Self-test (rollback-safe): classify with a bogus booking must raise --------
DO $selftest$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.classify_booking_payment_flow_v1(
      '00000000-0000-0000-0000-000000000000'::uuid, 'separate_charges_v1', 'selftest');
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'M-07 self-test: classify_booking_payment_flow_v1 did not raise on missing booking';
  END IF;
END $selftest$;

COMMIT;
