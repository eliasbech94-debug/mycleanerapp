-- =============================================================================
-- MyCleaner — Staging test data seed
--
-- Creates 17 realistic cleaner profiles across DK/SE/DE/ES/GB.
-- Idempotent: safe to re-run — rows are upserted by provider_slug.
--
-- STAGING ONLY — NEVER RUN AGAINST PRODUCTION.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.avatar(seed text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'https://i.pravatar.cc/240?u=' || seed;
$$;

WITH seed (
  provider_slug,
  country_code,
  display_name,
  public_bio,
  price_hour,
  average_rating,
  total_reviews,
  identity_verified,
  service_radius_km,
  avg_response_minutes,
  completed_bookings
) AS (
  VALUES
    -- Denmark
    (
      'mette-copenhagen',
      'DK',
      'Mette Sørensen',
      'Grundig rengøring i København og omegn. Miljøvenlige produkter.',
      290,
      4.92,
      128,
      TRUE,
      12,
      22,
      240
    ),
    (
      'anders-aarhus',
      'DK',
      'Anders Kristensen',
      'Erfaren cleaner med fokus på hjemmerengøring og flytterengøring.',
      260,
      4.71,
      54,
      TRUE,
      20,
      45,
      92
    ),
    (
      'sofia-odense',
      'DK',
      'Sofia Lund',
      'Detaljeorienteret ugentlig rengøring, husdyrvenlig.',
      240,
      4.60,
      31,
      TRUE,
      15,
      60,
      48
    ),
    (
      'jonas-aalborg',
      'DK',
      'Jonas Berg',
      'Vinduespudsning og dyb rengøring — hurtig respons.',
      275,
      4.83,
      73,
      FALSE,
      25,
      35,
      110
    ),
    (
      'camilla-esbjerg',
      'DK',
      'Camilla Holm',
      'Nyt medlem — familievenlig og pålidelig rengøring.',
      220,
      4.40,
      8,
      FALSE,
      18,
      90,
      12
    ),

    -- Sweden
    (
      'linnea-stockholm',
      'SE',
      'Linnéa Andersson',
      'Professionell städning i Stockholm. Miljömärkta produkter.',
      310,
      4.88,
      96,
      TRUE,
      15,
      25,
      180
    ),
    (
      'erik-goteborg',
      'SE',
      'Erik Nilsson',
      'Flyttstädning och veckostädning — noggrann och punktlig.',
      285,
      4.55,
      22,
      TRUE,
      22,
      55,
      40
    ),
    (
      'astrid-malmo',
      'SE',
      'Astrid Lindgren',
      'Grundlig hemstädning med lång erfarenhet.',
      265,
      4.75,
      60,
      FALSE,
      18,
      70,
      85
    ),

    -- Germany
    (
      'lena-berlin',
      'DE',
      'Lena Wagner',
      'Zuverlässige Haushaltsreinigung in Berlin. Nachhaltig & gründlich.',
      28,
      4.90,
      145,
      TRUE,
      14,
      20,
      260
    ),
    (
      'markus-munich',
      'DE',
      'Markus Hoffmann',
      'Endreinigung und Fensterputzen — schnelle Terminplanung.',
      32,
      4.62,
      38,
      TRUE,
      25,
      50,
      56
    ),
    (
      'sabine-hamburg',
      'DE',
      'Sabine Krüger',
      'Wöchentliche Reinigung mit Liebe zum Detail.',
      26,
      4.48,
      18,
      FALSE,
      20,
      75,
      30
    ),

    -- Spain
    (
      'carmen-madrid',
      'ES',
      'Carmen García',
      'Limpieza profesional en Madrid. Productos ecológicos disponibles.',
      18,
      4.85,
      102,
      TRUE,
      16,
      28,
      200
    ),
    (
      'pablo-barcelona',
      'ES',
      'Pablo Martínez',
      'Limpieza de mudanzas y mantenimiento — trato cercano.',
      22,
      4.58,
      27,
      TRUE,
      20,
      60,
      44
    ),
    (
      'lucia-valencia',
      'ES',
      'Lucía Fernández',
      'Nueva en la plataforma, con experiencia en hogares familiares.',
      16,
      4.30,
      6,
      FALSE,
      18,
      85,
      10
    ),

    -- United Kingdom
    (
      'emma-london',
      'GB',
      'Emma Whitfield',
      'Trusted London cleaner — eco products and pet-friendly.',
      26,
      4.94,
      210,
      TRUE,
      10,
      18,
      320
    ),
    (
      'daniel-manchester',
      'GB',
      'Daniel O''Connor',
      'End-of-tenancy and deep cleans across Greater Manchester.',
      24,
      4.66,
      41,
      TRUE,
      22,
      55,
      70
    ),
    (
      'olivia-edinburgh',
      'GB',
      'Olivia Grant',
      'Weekly home cleaning with a friendly, reliable touch.',
      22,
      4.52,
      17,
      FALSE,
      18,
      80,
      25
    )
)

INSERT INTO public.provider_profiles AS pp (
  id,
  provider_slug,
  display_name,
  public_bio,
  country_code,
  service_categories,
  base_hourly_rate,
  average_rating,
  total_reviews,
  identity_verified,
  identity_verified_badge,
  service_radius_km,
  avg_response_minutes,
  completed_bookings,
  avatar_url,
  status,
  marketplace_score,
  provider_tier,
  is_test_seed,
  created_at,
  updated_at
)

SELECT
  gen_random_uuid(),
  provider_slug,
  display_name,
  public_bio,
  country_code,
  ARRAY['cleaning']::text[],
  (price_hour * 100)::int,
  average_rating,
  total_reviews,
  identity_verified,
  identity_verified,
  service_radius_km,
  avg_response_minutes,
  completed_bookings,
  pg_temp.avatar(provider_slug),
  'active',
  LEAST(
    100,
    (average_rating * 15) + LEAST(total_reviews, 40)
  )::int,
  CASE
    WHEN identity_verified AND average_rating >= 4.7 THEN 'pro'
    ELSE 'standard'
  END,
  TRUE,
  now(),
  now()

FROM seed

ON CONFLICT (provider_slug) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  public_bio = EXCLUDED.public_bio,
  country_code = EXCLUDED.country_code,
  service_categories = EXCLUDED.service_categories,
  base_hourly_rate = EXCLUDED.base_hourly_rate,
  average_rating = EXCLUDED.average_rating,
  total_reviews = EXCLUDED.total_reviews,
  identity_verified = EXCLUDED.identity_verified,
  identity_verified_badge = EXCLUDED.identity_verified_badge,
  service_radius_km = EXCLUDED.service_radius_km,
  avg_response_minutes = EXCLUDED.avg_response_minutes,
  completed_bookings = EXCLUDED.completed_bookings,
  avatar_url = EXCLUDED.avatar_url,
  status = EXCLUDED.status,
  marketplace_score = EXCLUDED.marketplace_score,
  provider_tier = EXCLUDED.provider_tier,
  is_test_seed = TRUE,
  updated_at = now();

COMMIT;

-- =============================================================================
-- Verification
-- =============================================================================

SELECT
  country_code,
  count(*) AS providers
FROM public.provider_profiles
WHERE is_test_seed = TRUE
GROUP BY country_code
ORDER BY country_code;

SELECT
  count(*) AS total_seeded
FROM public.provider_profiles
WHERE is_test_seed = TRUE;

SELECT
  count(*) AS mette_copenhagen_present
FROM public.provider_profiles
WHERE provider_slug = 'mette-copenhagen'
  AND is_test_seed = TRUE;
