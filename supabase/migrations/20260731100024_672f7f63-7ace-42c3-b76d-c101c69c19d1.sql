-- 1. Draft/published lifecycle + research provenance on market pricing rules.
ALTER TABLE public.market_pricing_rules
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS researched_at date,
  ADD COLUMN IF NOT EXISTS research_assumptions text,
  ADD COLUMN IF NOT EXISTS vat_status text,
  ADD COLUMN IF NOT EXISTS rounding_rule text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.market_pricing_rules
  DROP CONSTRAINT IF EXISTS market_pricing_rules_status_check;
ALTER TABLE public.market_pricing_rules
  ADD CONSTRAINT market_pricing_rules_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE public.market_pricing_rules
  DROP CONSTRAINT IF EXISTS market_pricing_rules_vat_status_check;
ALTER TABLE public.market_pricing_rules
  ADD CONSTRAINT market_pricing_rules_vat_status_check
  CHECK (vat_status IS NULL OR vat_status IN ('excl_vat', 'incl_vat', 'not_applicable'));

-- A draft must always carry its provenance.
CREATE OR REPLACE FUNCTION public.market_rules_require_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    IF NEW.source_name IS NULL OR NEW.researched_at IS NULL
       OR NEW.research_assumptions IS NULL OR NEW.vat_status IS NULL
       OR NEW.rounding_rule IS NULL THEN
      RAISE EXCEPTION 'draft_pricing_rule_requires_provenance';
    END IF;
  END IF;
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_rules_provenance ON public.market_pricing_rules;
CREATE TRIGGER trg_market_rules_provenance
  BEFORE INSERT OR UPDATE ON public.market_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.market_rules_require_provenance();

-- Existing rows are the live DK configuration; keep them published.
UPDATE public.market_pricing_rules
   SET published_at = COALESCE(published_at, created_at)
 WHERE status = 'published';

-- Only one PUBLISHED rule per scope; multiple drafts may coexist.
DROP INDEX IF EXISTS public.market_pricing_rules_unique_scope;
CREATE UNIQUE INDEX market_pricing_rules_unique_scope
  ON public.market_pricing_rules (
    country_code, scope,
    COALESCE(lower(region), ''::text),
    COALESCE(lower(city), ''::text),
    COALESCE(postcode, ''::text)
  )
  WHERE active AND status = 'published';

CREATE INDEX IF NOT EXISTS market_pricing_rules_status_idx
  ON public.market_pricing_rules (country_code, status, active);

-- 2. Pricing resolution must ignore drafts entirely.
CREATE OR REPLACE FUNCTION public.resolve_market_minimum(
  _country_code text,
  _region text DEFAULT NULL::text,
  _city text DEFAULT NULL::text,
  _postcode text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_country  text := upper(btrim(coalesce(_country_code, '')));
  v_region   text := NULLIF(btrim(coalesce(_region, '')), '');
  v_city     text := NULLIF(btrim(coalesce(_city, '')), '');
  v_postcode text := NULLIF(btrim(coalesce(_postcode, '')), '');
  r          public.market_pricing_rules;
BEGIN
  IF v_country IS NULL OR char_length(v_country) <> 2 THEN
    RAISE EXCEPTION 'invalid_country_code';
  END IF;

  IF v_postcode IS NOT NULL THEN
    SELECT * INTO r FROM public.market_pricing_rules
     WHERE active AND status = 'published' AND country_code = v_country
       AND scope = 'postcode' AND postcode = v_postcode
     LIMIT 1;
    IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'postcode'); END IF;
  END IF;

  IF v_city IS NOT NULL THEN
    SELECT * INTO r FROM public.market_pricing_rules
     WHERE active AND status = 'published' AND country_code = v_country
       AND scope = 'city' AND lower(city) = lower(v_city)
     LIMIT 1;
    IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'city'); END IF;
  END IF;

  IF v_region IS NOT NULL THEN
    SELECT * INTO r FROM public.market_pricing_rules
     WHERE active AND status = 'published' AND country_code = v_country
       AND scope = 'region' AND lower(region) = lower(v_region)
     LIMIT 1;
    IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'region'); END IF;
  END IF;

  SELECT * INTO r FROM public.market_pricing_rules
   WHERE active AND status = 'published' AND country_code = v_country AND scope = 'country'
   LIMIT 1;
  IF FOUND THEN RETURN public._market_rule_to_jsonb(r, 'country'); END IF;

  RETURN jsonb_build_object(
    'matched_scope', NULL,
    'country_code', v_country,
    'currency', NULL,
    'min_minor', NULL,
    'max_minor', NULL,
    'recommended_minor', NULL,
    'error', 'no_active_rule'
  );
END;
$function$;

-- 3. Closed markets: demote existing rows to documented drafts (SE, GB, ES).
UPDATE public.market_pricing_rules
   SET status = 'draft',
       published_at = NULL,
       source_name = 'MyCleaner market pricing research 2026 (national statutory minimum wage floor + observed domestic cleaning market rates)',
       source_url = 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Minimum_wage_statistics',
       researched_at = DATE '2026-07-31',
       research_assumptions = 'Provider gross hourly rate in local currency, excluding VAT and excluding the MyCleaner platform fee. Floor set above the national statutory minimum wage; recommended rate set at observed mid-market level for residential cleaning. Not a statutory minimum wage. Requires local legal/tax verification before publication.',
       vat_status = 'excl_vat',
       rounding_rule = 'Rounded to whole currency units (minor units end in 00); half away from zero.',
       notes = 'DRAFT — closed market. Not used by pricing until status = published.'
 WHERE country_code IN ('SE', 'GB', 'ES');

-- 4. Germany had no pricing configuration at all: create the missing draft.
INSERT INTO public.market_pricing_rules (
  country_code, currency, scope,
  min_hourly_minor, recommended_hourly_minor,
  active, status,
  source_name, source_url, researched_at,
  research_assumptions, vat_status, rounding_rule, notes
)
SELECT
  'DE', 'EUR', 'country',
  1800, 2200,
  true, 'draft',
  'MyCleaner market pricing research 2026 (Mindestlohngesetz floor + observed German residential cleaning market rates)',
  'https://www.gesetze-im-internet.de/milog/',
  DATE '2026-07-31',
  'Provider gross hourly rate in EUR, excluding VAT (MwSt.) and excluding the MyCleaner platform fee. Floor of EUR 18.00/h set well above the statutory Mindestlohn to reflect self-employed cost base; recommended EUR 22.00/h reflects observed mid-market residential cleaning rates. Requires German legal/tax verification (Kleinunternehmerregelung vs. regular MwSt.) before publication.',
  'excl_vat',
  'Rounded to whole EUR (minor units end in 00); half away from zero.',
  'DRAFT — closed market. Germany previously had no pricing configuration.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.market_pricing_rules WHERE country_code = 'DE' AND scope = 'country'
);