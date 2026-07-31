-- ============================================================================
-- PREPARED ROLLBACK — atomically returns the Legal Center to v1.0.0 (48/24).
-- ============================================================================
-- Pairs with PREPARED_publish_cancellation_refund_v1_2_0.sql.
--
-- Does NOT touch any booking: every booking keeps the
-- `cancellation_policy_snapshot` it was sold under. Rolling the documents back
-- is therefore never retroactive.
--
-- Code-side rollback (do this FIRST, it is what decides money):
--   set the edge-function secret  CANCELLATION_POLICY_V2_ENABLED = false
--   → every NEW booking snapshots v1.0.0 again, immediately, no deploy needed.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f this_file.sql
-- ============================================================================

BEGIN;

DO $$
DECLARE
  OLD_CANCEL_ID CONSTANT uuid := '10dbd28b-9364-4007-ac25-101854d63078';
  NEW_CANCEL_ID CONSTANT uuid := '2e22a4f5-efb8-4048-9397-e2302f87f9a0';
  OLD_REFUND_ID CONSTANT uuid := '623a3f01-4223-47fb-86b7-b6fcdda00d1e';
  NEW_REFUND_ID CONSTANT uuid := 'a9bc6ac3-0693-4f5b-9482-776d25aa6d8f';
  live int;
BEGIN
  SELECT count(*) INTO live FROM public.legal_documents
  WHERE id IN (NEW_CANCEL_ID, NEW_REFUND_ID) AND status = 'published';

  IF live = 0 THEN
    RAISE NOTICE 'nothing_to_roll_back: v1.2.0 is not published.';
    RETURN;
  END IF;

  UPDATE public.legal_documents
  SET status = 'draft', published_at = NULL, superseded_at = NULL, updated_at = now()
  WHERE id IN (NEW_CANCEL_ID, NEW_REFUND_ID);

  UPDATE public.legal_document_sections
  SET status = 'draft', published_at = NULL, updated_at = now()
  WHERE document_id IN (NEW_CANCEL_ID, NEW_REFUND_ID);

  UPDATE public.legal_documents
  SET status = 'published', superseded_at = NULL, updated_at = now()
  WHERE id IN (OLD_CANCEL_ID, OLD_REFUND_ID);

  IF EXISTS (
    SELECT 1 FROM public.legal_documents
    WHERE slug IN ('cancellation-policy', 'refund-policy') AND status = 'published'
    GROUP BY slug, language, country_code HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'postcondition_failed: not exactly one published version per slug';
  END IF;

  INSERT INTO public.legal_audit_log (document_id, action, reason, metadata)
  VALUES
    (NEW_CANCEL_ID, 'rolled_back', 'Coordinated 18/8 activation rolled back', jsonb_build_object('restored', OLD_CANCEL_ID)),
    (NEW_REFUND_ID, 'rolled_back', 'Coordinated 18/8 activation rolled back', jsonb_build_object('restored', OLD_REFUND_ID));

  RAISE NOTICE 'rolled_back to v1.0.0 (48/24). Existing booking snapshots untouched.';
END $$;

COMMIT;
