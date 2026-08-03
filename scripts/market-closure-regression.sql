-- Market closure & pricing-draft regression.
--
-- Read-only. Verifies the server-side invariants that keep SE/GB/DE/ES
-- launch-ready but technically closed, and that draft pricing research can
-- never leak into live pricing.
--
-- Run:  psql -f scripts/market-closure-regression.sql
-- Every row must report PASS.

\set ON_ERROR_STOP on
\pset pager off

WITH checks AS (

  -- 1. Exactly one bookable market: DK.
  SELECT '01 only DK is bookable' AS check_name,
         (SELECT array_agg(iso ORDER BY iso) FROM public.market_launch_status WHERE is_bookable)
           = ARRAY['DK'] AS ok

  -- 2. All five launch markets are configured.
  UNION ALL
  SELECT '02 all five markets configured',
         (SELECT array_agg(iso ORDER BY iso) FROM public.country_configs)
           = ARRAY['DE','DK','ES','GB','SE']

  -- 3. Closed markets are never published (edge functions read published only).
  UNION ALL
  SELECT '03 closed markets are not published',
         NOT EXISTS (
           SELECT 1 FROM public.country_configs
            WHERE iso <> 'DK' AND status = 'published'
         )

  -- 4. The edge-function gate rejects every closed market.
  UNION ALL
  SELECT '04 country config gate blocks SE/GB/DE/ES',
         (SELECT bool_and(g.iso IS NULL)
            FROM public.country_configs c
            LEFT JOIN LATERAL public.get_published_country_config(c.iso) g ON true
           WHERE c.iso <> 'DK')

  -- 5. DK pricing is untouched and still resolves.
  UNION ALL
  SELECT '05 DK pricing still resolves',
         (public.resolve_market_minimum('DK') ->> 'currency') = 'DKK'
         AND (public.resolve_market_minimum('DK') ->> 'min_minor')::int > 0

  -- 6. Closed markets resolve to NO price at all (drafts are invisible).
  UNION ALL
  SELECT '06 closed markets have no resolvable price',
         (SELECT bool_and(public.resolve_market_minimum(iso) ->> 'error' = 'no_active_rule')
            FROM (VALUES ('SE'),('GB'),('DE'),('ES')) v(iso))

  -- 7. Every closed market has a documented pricing DRAFT.
  UNION ALL
  SELECT '07 SE/GB/DE/ES each have a documented draft',
         (SELECT count(*) FROM public.market_pricing_rules
           WHERE status = 'draft'
             AND country_code IN ('SE','GB','DE','ES')
             AND scope = 'country'
             AND source_name IS NOT NULL
             AND researched_at IS NOT NULL
             AND research_assumptions IS NOT NULL
             AND vat_status IS NOT NULL
             AND rounding_rule IS NOT NULL) = 4

  -- 8. Draft currency always matches the market's own currency.
  UNION ALL
  SELECT '08 draft currency matches market currency',
         NOT EXISTS (
           SELECT 1
             FROM public.market_pricing_rules r
             JOIN public.country_configs c ON c.iso = r.country_code
            WHERE r.currency <> c.currency
         )

  -- 9. Only DK has published pricing rules.
  UNION ALL
  SELECT '09 only DK has published pricing',
         (SELECT array_agg(DISTINCT country_code)
            FROM public.market_pricing_rules WHERE status = 'published') = ARRAY['DK']

  -- 10. No unverified company identifiers are stored as country contact data.
  UNION ALL
  SELECT '10 no invented CVR/VAT in country configs',
         NOT EXISTS (
           SELECT 1 FROM public.country_configs
            WHERE config::text ~* '(cvr|vat)[^a-z0-9]{0,3}[0-9]{6,}'
         )
)
SELECT check_name,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
  FROM checks
 ORDER BY check_name;
