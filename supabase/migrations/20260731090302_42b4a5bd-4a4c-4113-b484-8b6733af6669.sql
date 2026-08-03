DO $$
DECLARE T CONSTANT timestamptz := '2026-08-01T06:00:00.000Z';
BEGIN
  UPDATE public.legal_documents
  SET effective_at = T, updated_at = now()
  WHERE id IN ('2e22a4f5-efb8-4048-9397-e2302f87f9a0','a9bc6ac3-0693-4f5b-9482-776d25aa6d8f')
    AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'drafts_not_found_or_not_draft'; END IF;

  INSERT INTO public.legal_audit_log (document_id, action, reason, metadata)
  VALUES
    ('2e22a4f5-efb8-4048-9397-e2302f87f9a0','updated','Activation instant moved to 2026-08-01T06:00:00Z', jsonb_build_object('effective_at', T, 'previous_effective_at','2026-08-03T06:00:00Z')),
    ('a9bc6ac3-0693-4f5b-9482-776d25aa6d8f','updated','Activation instant moved to 2026-08-01T06:00:00Z', jsonb_build_object('effective_at', T, 'previous_effective_at','2026-08-03T06:00:00Z'));
END $$;