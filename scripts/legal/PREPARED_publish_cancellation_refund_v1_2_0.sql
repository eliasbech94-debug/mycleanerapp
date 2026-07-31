-- ============================================================================
-- PREPARED — DO NOT EXECUTE BEFORE T = 2026-08-03T06:00:00.000Z
-- ============================================================================
-- Atomic coordinated publication of:
--   MC-CANCELLATION-POLICY-001 v1.2.0   (id 2e22a4f5-efb8-4048-9397-e2302f87f9a0)
--   MC-REFUND-POLICY-001       v1.2.0   (id a9bc6ac3-0693-4f5b-9482-776d25aa6d8f)
-- superseding their published v1.0.0 rows:
--   MC-CANCELLATION-POLICY-001 v1.0.0   (id 10dbd28b-9364-4007-ac25-101854d63078)
--   MC-REFUND-POLICY-001       v1.0.0   (id 623a3f01-4223-47fb-86b7-b6fcdda00d1e)
--
-- Properties:
--   • Single transaction. Any RAISE aborts EVERYTHING — partial publication
--     of one of the two documents is impossible.
--   • Verifies version, body hash and the section-hash fingerprint of every
--     draft before touching status.
--   • Idempotent: re-running after success is a no-op that reports 'already
--     published' and commits without changes.
--   • Stops safely on any unexpected status or hash mismatch.
--   • Writes a legal audit-log row per document.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f this_file.sql
-- ============================================================================

BEGIN;

DO $$
DECLARE
  T                  CONSTANT timestamptz := '2026-08-03T06:00:00.000Z';

  OLD_CANCEL_ID      CONSTANT uuid := '10dbd28b-9364-4007-ac25-101854d63078';
  NEW_CANCEL_ID      CONSTANT uuid := '2e22a4f5-efb8-4048-9397-e2302f87f9a0';
  OLD_REFUND_ID      CONSTANT uuid := '623a3f01-4223-47fb-86b7-b6fcdda00d1e';
  NEW_REFUND_ID      CONSTANT uuid := 'a9bc6ac3-0693-4f5b-9482-776d25aa6d8f';

  -- Frozen expectations, captured 2026-07-31 during the release preflight.
  NEW_CANCEL_HASH    CONSTANT text := '8fd167cbecebcaa6b1e77b439e7ba761094c53662fdedd03d81b45b1ebbc1204';
  NEW_REFUND_HASH    CONSTANT text := '1d9ff771037ed4bed8f9eb994281caac4532a8938f2dfa45802e12fa9b6f7e55';
  NEW_CANCEL_SECFP   CONSTANT text := '6bc0812f7bcde53e1917806847e099e2';
  NEW_REFUND_SECFP   CONSTANT text := 'fc0d77018cbb969a22b5b9bf3d3e4c0b';
  OLD_CANCEL_HASH    CONSTANT text := 'd4a9df6714a51594f89f8b421d29c1360e3281a562aef7ca6573de0ea7aae1a5';
  OLD_REFUND_HASH    CONSTANT text := '7cdb15518f738e33554156d948ff4c27cb63af5a1d5f25b02788046b2aad1a8c';

  d                  record;
  fp                 text;
  already            int := 0;
BEGIN
  -- ── 0. Time gate ────────────────────────────────────────────────────────
  IF now() < T THEN
    RAISE EXCEPTION 'too_early: activation instant % not reached (now = %)', T, now();
  END IF;

  -- ── 1. Idempotency probe ────────────────────────────────────────────────
  SELECT count(*) INTO already
  FROM public.legal_documents
  WHERE id IN (NEW_CANCEL_ID, NEW_REFUND_ID) AND status = 'published';

  IF already = 2 THEN
    RAISE NOTICE 'already_published: both v1.2.0 documents are live — no-op.';
    RETURN;
  ELSIF already = 1 THEN
    RAISE EXCEPTION 'inconsistent_state: exactly one v1.2.0 document is published — manual review required';
  END IF;

  -- ── 2. Verify the two drafts (version, status, hash, sections) ──────────
  FOR d IN
    SELECT id, doc_uid, version, status, body_hash,
           CASE id WHEN NEW_CANCEL_ID THEN NEW_CANCEL_HASH ELSE NEW_REFUND_HASH END  AS want_hash,
           CASE id WHEN NEW_CANCEL_ID THEN NEW_CANCEL_SECFP ELSE NEW_REFUND_SECFP END AS want_secfp
    FROM public.legal_documents
    WHERE id IN (NEW_CANCEL_ID, NEW_REFUND_ID)
    FOR UPDATE
  LOOP
    IF d.version <> '1.2.0' THEN
      RAISE EXCEPTION 'version_mismatch: % is version %, expected 1.2.0', d.doc_uid, d.version;
    END IF;
    IF d.status <> 'draft' THEN
      RAISE EXCEPTION 'status_mismatch: % is %, expected draft', d.doc_uid, d.status;
    END IF;
    IF d.body_hash IS DISTINCT FROM d.want_hash THEN
      RAISE EXCEPTION 'body_hash_mismatch: % has %, expected %', d.doc_uid, d.body_hash, d.want_hash;
    END IF;

    SELECT md5(string_agg(coalesce(s.hash, '∅'), '|' ORDER BY s.section_order))
      INTO fp
    FROM public.legal_document_sections s
    WHERE s.document_id = d.id;

    IF fp IS DISTINCT FROM d.want_secfp THEN
      RAISE EXCEPTION 'section_hash_mismatch: % has %, expected %', d.doc_uid, coalesce(fp, 'NULL'), d.want_secfp;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.legal_documents WHERE id IN (NEW_CANCEL_ID, NEW_REFUND_ID)) <> 2 THEN
    RAISE EXCEPTION 'missing_draft: expected exactly 2 v1.2.0 drafts';
  END IF;

  -- ── 3. Verify the two live v1.0.0 documents ─────────────────────────────
  FOR d IN
    SELECT id, doc_uid, version, status, body_hash,
           CASE id WHEN OLD_CANCEL_ID THEN OLD_CANCEL_HASH ELSE OLD_REFUND_HASH END AS want_hash
    FROM public.legal_documents
    WHERE id IN (OLD_CANCEL_ID, OLD_REFUND_ID)
    FOR UPDATE
  LOOP
    IF d.version <> '1.0.0' OR d.status <> 'published' THEN
      RAISE EXCEPTION 'live_doc_unexpected: % is % / %', d.doc_uid, d.version, d.status;
    END IF;
    IF d.body_hash IS DISTINCT FROM d.want_hash THEN
      RAISE EXCEPTION 'live_body_hash_mismatch: % has %', d.doc_uid, d.body_hash;
    END IF;
  END LOOP;

  -- ── 4. Supersede v1.0.0 ─────────────────────────────────────────────────
  UPDATE public.legal_documents
  SET status = 'superseded', superseded_at = T, updated_at = now()
  WHERE id IN (OLD_CANCEL_ID, OLD_REFUND_ID);
  IF NOT FOUND THEN RAISE EXCEPTION 'supersede_failed'; END IF;

  -- ── 5. Publish v1.2.0 ───────────────────────────────────────────────────
  UPDATE public.legal_documents
  SET status = 'published', published_at = T, effective_at = T, updated_at = now()
  WHERE id IN (NEW_CANCEL_ID, NEW_REFUND_ID);
  IF NOT FOUND THEN RAISE EXCEPTION 'publish_failed'; END IF;

  UPDATE public.legal_document_sections
  SET status = 'published', published_at = T, effective_date = T::date, updated_at = now()
  WHERE document_id IN (NEW_CANCEL_ID, NEW_REFUND_ID);

  -- ── 6. Post-conditions: exactly one published version per slug ──────────
  IF EXISTS (
    SELECT 1 FROM public.legal_documents
    WHERE slug IN ('cancellation-policy', 'refund-policy') AND status = 'published'
    GROUP BY slug, language, country_code HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'postcondition_failed: not exactly one published version per slug';
  END IF;

  -- ── 7. Audit log ────────────────────────────────────────────────────────
  INSERT INTO public.legal_audit_log (document_id, action, old_hash, new_hash, reason, metadata)
  VALUES
    (NEW_CANCEL_ID, 'published', OLD_CANCEL_HASH, NEW_CANCEL_HASH,
     'Coordinated 18/8 cancellation-policy activation',
     jsonb_build_object('activation_at', T, 'supersedes', OLD_CANCEL_ID,
                        'policy_version', '2.0.0', 'from_version', '1.0.0', 'to_version', '1.2.0')),
    (NEW_REFUND_ID, 'published', OLD_REFUND_HASH, NEW_REFUND_HASH,
     'Coordinated 18/8 refund-policy activation',
     jsonb_build_object('activation_at', T, 'supersedes', OLD_REFUND_ID,
                        'policy_version', '2.0.0', 'from_version', '1.0.0', 'to_version', '1.2.0')),
    (OLD_CANCEL_ID, 'superseded', OLD_CANCEL_HASH, NEW_CANCEL_HASH,
     'Superseded by v1.2.0', jsonb_build_object('activation_at', T, 'superseded_by', NEW_CANCEL_ID)),
    (OLD_REFUND_ID, 'superseded', OLD_REFUND_HASH, NEW_REFUND_HASH,
     'Superseded by v1.2.0', jsonb_build_object('activation_at', T, 'superseded_by', NEW_REFUND_ID));

  RAISE NOTICE 'published: MC-CANCELLATION-POLICY-001 v1.2.0 + MC-REFUND-POLICY-001 v1.2.0 @ %', T;
END $$;

COMMIT;
