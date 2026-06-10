ALTER TABLE public.market_rate_thresholds REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_rate_thresholds;