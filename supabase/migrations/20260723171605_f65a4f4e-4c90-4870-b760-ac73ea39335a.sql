
ALTER VIEW public.v_source_transfer_capacity SET (security_invoker = true);
REVOKE ALL ON public.v_source_transfer_capacity FROM PUBLIC, anon, authenticated, service_role;
