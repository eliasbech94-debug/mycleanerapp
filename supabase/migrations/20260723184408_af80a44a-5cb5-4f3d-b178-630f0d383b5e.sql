-- Grant EXECUTE to service_role on the specific ingestion RPCs used by the Step 4 webhook.
GRANT EXECUTE ON FUNCTION public.classify_booking_payment_flow_v1(uuid, booking_payment_flow_version, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_payment_captured_v1(uuid, text, bigint, char, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_payment_captured_suspense_v1(text, bigint, char, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_payment_captured_reclassify_v1(text, uuid, bigint, char, int, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_stripe_fee_actual_v1(text, uuid, bigint, char, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_refund_recorded_v1(text, text, uuid, bigint, char, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_transfer_event_v1(text, text, text, uuid, char, bigint, text, timestamptz, jsonb) TO service_role;

-- Lock down internal writer helpers from all API roles.
REVOKE ALL ON FUNCTION public.begin_ledger_write()               FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_ledger_writer_authorized()  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname LIKE 'ingest\_%\_v1' ESCAPE '\'
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF n <> 6 THEN RAISE EXCEPTION 'step4b: expected 6 ingestion RPCs executable by service_role, got %', n; END IF;

  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('post_ledger_transaction_v1','_ledger_normalize_entries',
                       '_ledger_payload_fingerprint','begin_ledger_write',
                       'assert_ledger_writer_authorized')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF n <> 0 THEN RAISE EXCEPTION 'step4b: leak on internal ledger primitives (% funcs)', n; END IF;
END;
$$;