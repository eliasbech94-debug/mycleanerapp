
REVOKE EXECUTE ON FUNCTION public.save_provider_pricing(jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_recommended_price(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_provider_pricing(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_recommended_price(uuid) TO authenticated;
-- resolve_market_minimum stays anon-callable so marketing/browsing surfaces can preview.
