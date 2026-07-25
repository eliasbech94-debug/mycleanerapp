-- =============================================================================
-- MyCleaner — Staging test data seed (Phase 2A follow-up)
--
-- Creates 17 realistic cleaner profiles across DK/SE/DE/ES/GB with avatars,
-- bios, hourly rates, ratings, review counts, verification status and varied
-- service radii. Idempotent: safe to re-run — rows are upserted by slug.
--
-- USAGE (staging only — never run against production):
--   psql "$STAGING_PG_CONN" -f staging-validation/seed/test-providers.sql
--
-- Assumes columns already exist on public.provider_profiles per production
-- schema. Adjust column names if your staging is a snapshot behind main.
-- =============================================================================

BEGIN;

-- Reusable helper: pick an avatar from picsum by seed
CREATE OR REPLACE FUNCTION pg_temp.avatar(seed text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'https://i.pravatar.cc/240?u=' || seed;
$$;

WITH seed(slug, country, name, bio, price_hour, rating, reviews, verified, radius_km, response_min, completed) AS (
  VALUES
  -- 🇩🇰 Denmark (5)
  ('mette-copenhagen',   'DK', 'Mette Sørensen',   'Grundig rengøring i København og omegn. Miljøvenlige produkter.',                290, 4.92, 128, TRUE,  12, 22, 240),
  ('anders-aarhus',      'DK', 'Anders Kristensen', 'Erfaren cleaner med fokus på hjemmerengøring og flytterengøring.',              260, 4.71,  54, TRUE,  20, 45,  92),
  ('sofia-odense',       'DK', 'Sofia Lund',        'Detaljeorienteret ugentlig rengøring, husdyrvenlig.',                          240, 4.60,  31, TRUE,  15, 60,  48),
  ('jonas-aalborg',      'DK', 'Jonas Berg',        'Vinduespudsning og dyb rengøring — hurtig respons.',                           275, 4.83,  73, FALSE, 25, 35, 110),
  ('camilla-esbjerg',    'DK', 'Camilla Holm',      'Nyt medlem — familievenlig og pålidelig rengøring.',                           220, 4.40,   8, FALSE, 18, 90,  12),
  -- 🇸🇪 Sweden (3)
  ('linnea-stockholm',   'SE', 'Linnéa Andersson',  'Professionell städning i Stockholm. Miljömärkta produkter.',                   310, 4.88,  96, TRUE,  15, 25, 180),
  ('erik-goteborg',      'SE', 'Erik Nilsson',      'Flyttstädning och veckostädning — noggrann och punktlig.',                     285, 4.55,  22, TRUE,  22, 55,  40),
  ('astrid-malmo',       'SE', 'Astrid Lindgren',   'Grundlig hemstädning med lång erfarenhet.',                                    265, 4.75,  60, FALSE, 18, 70,  85),
  -- 🇩🇪 Germany (3)
  ('lena-berlin',        'DE', 'Lena Wagner',       'Zuverlässige Haushaltsreinigung in Berlin. Nachhaltig & gründlich.',            28, 4.90, 145, TRUE,  14, 20, 260),
  ('markus-munich',      'DE', 'Markus Hoffmann',   'Endreinigung und Fensterputzen — schnelle Terminplanung.',                      32, 4.62,  38, TRUE,  25, 50,  56),
  ('sabine-hamburg',     'DE', 'Sabine Krüger',     'Wöchentliche Reinigung mit Liebe zum Detail.',                                  26, 4.48,  18, FALSE, 20, 75,  30),
  -- 🇪🇸 Spain (3)
  ('carmen-madrid',      'ES', 'Carmen García',     'Limpieza profesional en Madrid. Productos ecológicos disponibles.',             18, 4.85, 102, TRUE,  16, 28, 200),
  ('pablo-barcelona',    'ES', 'Pablo Martínez',    'Limpieza de mudanzas y mantenimiento — trato cercano.',                         22, 4.58,  27, TRUE,  20, 60,  44),
  ('lucia-valencia',     'ES', 'Lucía Fernández',   'Nueva en la plataforma, con experiencia en hogares familiares.',                16, 4.30,   6, FALSE, 18, 85,  10),
  -- 🇬🇧 United Kingdom (3)
  ('emma-london',        'GB', 'Emma Whitfield',    'Trusted London cleaner — eco products and pet-friendly.',                       26, 4.94, 210, TRUE,  10, 18, 320),
  ('daniel-manchester',  'GB', 'Daniel O''Connor',  'End-of-tenancy and deep cleans across Greater Manchester.',                     24, 4.66,  41, TRUE,  22, 55,  70),
  ('olivia-edinburgh',   'GB', 'Olivia Grant',      'Weekly home cleaning with a friendly, reliable touch.',                         22, 4.52,  17, FALSE, 18, 80,  25)
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
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  slug,
  name,
  bio,
  country,
  ARRAY['cleaning']::text[],
  (price_hour * 100)::int,           -- minor units
  rating,
  reviews,
  verified,
  verified,
  radius_km,
  response_min,
  completed,
  pg_temp.avatar(slug),
  'active',
  LEAST(100, (rating * 15) + LEAST(reviews, 40))::int,
  CASE WHEN verified AND rating >= 4.7 THEN 'pro' ELSE 'standard' END,
  now(),
  now()
FROM seed
ON CONFLICT (provider_slug) DO UPDATE
SET display_name = EXCLUDED.display_name,
    public_bio = EXCLUDED.public_bio,
    country_code = EXCLUDED.country_code,
    base_hourly_rate = EXCLUDED.base_hourly_rate,
    average_rating = EXCLUDED.average_rating,
    total_reviews = EXCLUDED.total_reviews,
    identity_verified = EXCLUDED.identity_verified,
    identity_verified_badge = EXCLUDED.identity_verified_badge,
    service_radius_km = EXCLUDED.service_radius_km,
    avg_response_minutes = EXCLUDED.avg_response_minutes,
    completed_bookings = EXCLUDED.completed_bookings,
    avatar_url = EXCLUDED.avatar_url,
    marketplace_score = EXCLUDED.marketplace_score,
    provider_tier = EXCLUDED.provider_tier,
    updated_at = now();

COMMIT;

-- Verification
SELECT country_code, count(*) AS providers
FROM public.provider_profiles
WHERE provider_slug IN (
  'mette-copenhagen','anders-aarhus','sofia-odense','jonas-aalborg','camilla-esbjerg',
  'linnea-stockholm','erik-goteborg','astrid-malmo',
  'lena-berlin','markus-munich','sabine-hamburg',
  'carmen-madrid','pablo-barcelona','lucia-valencia',
  'emma-london','daniel-manchester','olivia-edinburgh'
)
GROUP BY country_code
ORDER BY country_code;
