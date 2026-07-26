
REVOKE ALL ON FUNCTION public._ledger_normalize_entries(jsonb) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ledger_payload_fingerprint(text,text,char,uuid,uuid,jsonb) FROM anon, authenticated, service_role;
