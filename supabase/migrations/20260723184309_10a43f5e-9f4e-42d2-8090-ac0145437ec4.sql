-- =====================================================================
-- Funds Release v7 — Step 4: refund and transfer ingestion primitives
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: sum of captured gross booked into ledger for a booking
-- (payment.captured + payment.captured.reclassify credits to provider.payable)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_captured_gross_minor_v1(_booking_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(e.amount_minor), 0)::bigint
  FROM public.ledger_entries e
  JOIN public.ledger_transactions t ON t.id = e.transaction_id
  WHERE e.booking_id = _booking_id
    AND e.account = 'provider.payable'
    AND e.direction = 'credit'
    AND t.event_type IN ('payment.captured','payment.captured.reclassify');
$$;
REVOKE ALL ON FUNCTION public.get_booking_captured_gross_minor_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Helper: sum of refunds already recorded for a booking
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_refunded_gross_minor_v1(_booking_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(e.amount_minor), 0)::bigint
  FROM public.ledger_entries e
  JOIN public.ledger_transactions t ON t.id = e.transaction_id
  WHERE e.booking_id = _booking_id
    AND e.account = 'customer.refund_payable'
    AND e.direction = 'credit'
    AND t.event_type = 'refund.recorded';
$$;
REVOKE ALL ON FUNCTION public.get_booking_refunded_gross_minor_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- ingest_refund_recorded_v1
--   * Booking-linked refund event ingestion.
--   * Appends immutable stripe_refund_events row (idempotent by stripe_event_id).
--   * Posts ledger:  provider.payable DR / customer.refund_payable CR
--   * Rejects over-refunds beyond captured gross.
--   * Refunds are source-linked to the booking's PI. No transfer capacity is
--     touched — Step 4 does not execute transfers.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_refund_recorded_v1(
  _stripe_event_id   text,
  _stripe_refund_id  text,
  _booking_id        uuid,
  _amount_minor      bigint,
  _currency          char(3),
  _status            text,
  _stripe_created_at timestamptz,
  _raw               jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.ingest_refund_recorded_v1(text,text,uuid,bigint,char,text,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- ingest_transfer_event_v1
--   * Recording only — no ledger writes, no transfer creation.
--   * Appends to stripe_source_transfer_events.
--   * Idempotent by stripe_event_id (unique constraint).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_transfer_event_v1(
  _stripe_event_id    text,
  _stripe_transfer_id text,
  _source_charge_id   text,
  _booking_id         uuid,
  _currency           char(3),
  _gross_minor        bigint,
  _event_kind         text,
  _stripe_created_at  timestamptz,
  _raw                jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.ingest_transfer_event_v1(text,text,text,uuid,char,bigint,text,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------------------
COMMENT ON FUNCTION public.ingest_refund_recorded_v1(text,text,uuid,bigint,char,text,timestamptz,jsonb) IS
  'v7 Step 4: booking-linked Stripe refund ingestion. Idempotent by stripe_event_id. Rejects over-refunds. Posts provider.payable DR / customer.refund_payable CR for succeeded refunds. No transfers, no payouts.';

COMMENT ON FUNCTION public.ingest_transfer_event_v1(text,text,text,uuid,char,bigint,text,timestamptz,jsonb) IS
  'v7 Step 4: append-only recording of transfer.created/transfer.reversed. Feeds get_source_transfer_capacity_v1. No ledger writes. No transfer creation. No payout execution.';

COMMENT ON FUNCTION public.get_booking_captured_gross_minor_v1(uuid) IS
  'v7 Step 4 helper: sum of provider.payable credits from payment.captured and payment.captured.reclassify for a booking. Used for over-refund protection.';

COMMENT ON FUNCTION public.get_booking_refunded_gross_minor_v1(uuid) IS
  'v7 Step 4 helper: sum of customer.refund_payable credits from refund.recorded for a booking. Used for over-refund protection.';

-- ---------------------------------------------------------------------
-- Self-tests: ensure the new functions exist, are SECURITY DEFINER,
-- and have no execute privileges for API roles.
-- ---------------------------------------------------------------------
DO $selftest$
DECLARE
  n int;
BEGIN
  -- 1) functions exist and are SECURITY DEFINER
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('ingest_refund_recorded_v1','ingest_transfer_event_v1',
                       'get_booking_captured_gross_minor_v1','get_booking_refunded_gross_minor_v1')
     AND p.prosecdef = true;
  IF n <> 4 THEN RAISE EXCEPTION 'step4: expected 4 SECURITY DEFINER functions, got %', n; END IF;

  -- 2) No API-role EXECUTE privileges
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('ingest_refund_recorded_v1','ingest_transfer_event_v1',
                       'get_booking_captured_gross_minor_v1','get_booking_refunded_gross_minor_v1')
     AND (
       has_function_privilege('anon',          p.oid, 'EXECUTE') OR
       has_function_privilege('authenticated', p.oid, 'EXECUTE') OR
       has_function_privilege('service_role',  p.oid, 'EXECUTE')
     );
  IF n <> 0 THEN RAISE EXCEPTION 'step4: API role EXECUTE leak on % functions', n; END IF;

  -- 3) transfer event over-refund guard: rejects bad event_kind
  BEGIN
    PERFORM public.ingest_transfer_event_v1(
      'evt_step4_selftest','tr_x','ch_x',NULL,'dkk',100,'bogus_kind',now(), '{}'::jsonb);
    RAISE EXCEPTION 'step4: bogus event_kind was accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  -- 4) funds_release flag is still false
  SELECT count(*) INTO n FROM public.feature_flags
   WHERE flag_key='funds_release.enabled' AND enabled = true;
  IF n <> 0 THEN RAISE EXCEPTION 'step4: funds_release.enabled is TRUE (must remain false)'; END IF;
END;
$selftest$;