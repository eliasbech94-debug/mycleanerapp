-- The 2-arg wrapper collides with the 3-arg function (whose _reason/_event_id
-- both have defaults), making {_uid,_reason} unresolvable for PostgREST
-- (PGRST203). Every caller uses {_uid,_reason}; dropping the wrapper makes the
-- 3-arg version the unique match.
DROP FUNCTION IF EXISTS public.refresh_provider_score_tier(uuid, text);

-- Destructive retention job: service_role only.
REVOKE ALL ON FUNCTION public.campaign_email_outbox_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_email_outbox_cleanup() TO service_role;

-- Burns a global sequence on every call: not for untrusted callers.
REVOKE ALL ON FUNCTION public.generate_mycleaner_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_mycleaner_id(text) TO service_role;