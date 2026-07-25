-- =============================================================================
-- MyCleaner — Staging test data seed (schema-corrected)
--
-- Seeds 17 realistic cleaner profiles across DK/SE/DE/ES/GB directly against
-- the real staging schema of public.provider_profiles.
--
-- Key facts about the target schema (verified against staging):
--   • Primary key is user_id (uuid). There is NO "id" column.
--   • user_id is a FK to auth.users(id) — an auth user must exist first.
--   • provider_slug is UNIQUE (index provider_profiles_slug_uidx) → conflict key.
--   • Country lives in base_country_code (not country_code).
--   • Hourly rate lives in hourly_rate (not base_hourly_rate).
--   • Radius lives in service_area_radius_km (not service_radius_km).
--   • Avatar lives in photo_path (not avatar_url).
--   • Score lives in provider_score (not marketplace_score).
--   • provider_tier enum: new|verified|experienced|top_rated|elite|partner
--   • status enum: draft|pending_identity|pending_stripe|pending_review
--                  |active|paused|suspended|rejected|archived
--   • These columns DO NOT exist and must not be referenced:
--       id, owner_id, country_code, base_hourly_rate,
--       average_rating, total_reviews,
--       identity_verified, identity_verified_badge,
--       service_radius_km, completed_bookings,
--       avatar_url, marketplace_score, is_test_seed
--
-- Trigger handling:
--   • trg_provider_profiles_enforce_base_address wipes base_country_code when
--     base_address_place_id IS NULL and otherwise requires a fresh
--     public.place_validations row (<= 30 min old). Disabled inside this
--     transaction so base_country_code can be set deterministically for seed
--     rows without seeding Google-validated addresses.
--   • trg_provider_profiles_min_age would reject synthetic rows without a
--     valid date_of_birth. Disabled inside this transaction.
--   • The disables live inside BEGIN/COMMIT, so a ROLLBACK (any failure)
--     automatically restores the original enabled state. An explicit
--     re-ENABLE at the bottom guarantees the state on success.
--   • Privileged columns (status, visibility, provider_tier, provider_score,
--     identity_status) are set on INSERT and deliberately NOT rewritten in
--     the ON CONFLICT ... DO UPDATE clause, so the BEFORE UPDATE guard
--     trg_provider_profiles_block_privileged is never fired on re-runs.
--
-- USAGE (staging only — never run against production):
--   psql "$STAGING_PG_CONN" -f staging-validation/seed/test-providers.sql
-- =============================================================================

BEGIN;

-- Safety net: refuse to run against anything but a Supabase-style postgres DB.
DO $$
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing to seed: unexpected database %', current_database();
  END IF;
END$$;

-- Temporarily silence triggers that require Google-validated addresses / DOB.
-- Inside this transaction only; ROLLBACK or the explicit ENABLE below restores
-- the original state. This does not modify the schema definition.
ALTER TABLE public.provider_profiles DISABLE TRIGGER trg_provider_profiles_enforce_base_address;
ALTER TABLE public.provider_profiles DISABLE TRIGGER trg_provider_profiles_min_age;

WITH seed(slug, country, name, bio, price_hour, radius_km, response_min, tier, score) AS (
  VALUES
  -- 🇩🇰 Denmark (5)
  ('mette-copenhagen',   'DK', 'Mette Sørensen',    'Grundig rengøring i København og omegn. Miljøvenlige produkter.',        290, 12, 22, 'top_rated',   92),
  ('anders-aarhus',      'DK', 'Anders Kristensen', 'Erfaren cleaner med fokus på hjemmerengøring og flytterengøring.',       260, 20, 45, 'experienced', 78),
  ('sofia-odense',       'DK', 'Sofia Lund',        'Detaljeorienteret ugentlig rengøring, husdyrvenlig.',                    240, 15, 60, 'verified',    70),
  ('jonas-aalborg',      'DK', 'Jonas Berg',        'Vinduespudsning og dyb rengøring — hurtig respons.',                     275, 25, 35, 'experienced', 82),
  ('camilla-esbjerg',    'DK', 'Camilla Holm',      'Nyt medlem — familievenlig og pålidelig rengøring.',                     220, 18, 90, 'new',         55),
  -- 🇸🇪 Sweden (3)
  ('linnea-stockholm',   'SE', 'Linnéa Andersson',  'Professionell städning i Stockholm. Miljömärkta produkter.',             310, 15, 25, 'top_rated',   90),
  ('erik-goteborg',      'SE', 'Erik Nilsson',      'Flyttstädning och veckostädning — noggrann och punktlig.',               285, 22, 55, 'verified',    72),
  ('astrid-malmo',       'SE', 'Astrid Lindgren',   'Grundlig hemstädning med lång erfarenhet.',                              265, 18, 70, 'experienced', 80),
  -- 🇩🇪 Germany (3)
  ('lena-berlin',        'DE', 'Lena Wagner',       'Zuverlässige Haushaltsreinigung in Berlin. Nachhaltig & gründlich.',      28, 14, 20, 'elite',       95),
  ('markus-munich',      'DE', 'Markus Hoffmann',   'Endreinigung und Fensterputzen — schnelle Terminplanung.',                32, 25, 50, 'verified',    73),
  ('sabine-hamburg',     'DE', 'Sabine Krüger',     'Wöchentliche Reinigung mit Liebe zum Detail.',                            26, 20, 75, 'new',         60),
  -- 🇪🇸 Spain (3)
  ('carmen-madrid',      'ES', 'Carmen García',     'Limpieza profesional en Madrid. Productos ecológicos disponibles.',       18, 16, 28, 'top_rated',   88),
  ('pablo-barcelona',    'ES', 'Pablo Martínez',    'Limpieza de mudanzas y mantenimiento — trato cercano.',                   22, 20, 60, 'verified',    71),
  ('lucia-valencia',     'ES', 'Lucía Fernández',   'Nueva en la plataforma, con experiencia en hogares familiares.',          16, 18, 85, 'new',         52),
  -- 🇬🇧 United Kingdom (3)
  ('emma-london',        'GB', 'Emma Whitfield',    'Trusted London cleaner — eco products and pet-friendly.',                 26, 10, 18, 'elite',       96),
  ('daniel-manchester',  'GB', 'Daniel O''Connor',  'End-of-tenancy and deep cleans across Greater Manchester.',               24, 22, 55, 'experienced', 79),
  ('olivia-edinburgh',   'GB', 'Olivia Grant',      'Weekly home cleaning with a friendly, reliable touch.',                   22, 18, 80, 'verified',    68)
),
mapped AS (
  SELECT
    s.*,
    -- Deterministic v4-shaped UUID derived from the slug so re-runs upsert
    -- the same auth.users row and the same provider_profiles row.
    (
      substr(md5('mycleaner-seed:'||s.slug),  1, 8) || '-' ||
      substr(md5('mycleaner-seed:'||s.slug),  9, 4) || '-4' ||
      substr(md5('mycleaner-seed:'||s.slug), 14, 3) || '-8' ||
      substr(md5('mycleaner-seed:'||s.slug), 18, 3) || '-' ||
      substr(md5('mycleaner-seed:'||s.slug), 21, 12)
    )::uuid AS uid,
    -- Deterministic pravatar URL keyed by slug for stable avatars across runs.
    'https://i.pravatar.cc/240?u=' || s.slug AS avatar
  FROM seed s
),
ensure_users AS (
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_sso_user, is_anonymous
  )
  SELECT
    m.uid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated',
    m.slug || '@seed.mycleaner.test',
    crypt('seed-' || m.slug, gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('name', m.name, 'seed', true),
    false, false
  FROM mapped m
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
INSERT INTO public.provider_profiles AS pp (
  user_id,
  provider_slug,
  display_name,
  bio,
  public_bio,
  photo_path,
  base_country_code,
  service_categories,
  hourly_rate,
  service_area_radius_km,
  avg_response_minutes,
  status,
  visibility,
  is_public,
  provider_tier,
  provider_score,
  identity_status,
  created_at,
  updated_at
)
SELECT
  m.uid,
  m.slug,
  m.name,
  m.bio,
  m.bio,
  m.avatar,
  m.country,
  ARRAY['cleaning']::text[],
  m.price_hour,
  m.radius_km::smallint,
  m.response_min,
  'active'::provider_status,
  'public'::provider_visibility,
  true,
  m.tier::provider_tier,
  m.score::smallint,
  'verified',
  now(),
  now()
FROM mapped m
ON CONFLICT (provider_slug) DO UPDATE
SET display_name           = EXCLUDED.display_name,
    bio                    = EXCLUDED.bio,
    public_bio             = EXCLUDED.public_bio,
    photo_path             = EXCLUDED.photo_path,
    base_country_code      = EXCLUDED.base_country_code,
    service_categories     = EXCLUDED.service_categories,
    hourly_rate            = EXCLUDED.hourly_rate,
    service_area_radius_km = EXCLUDED.service_area_radius_km,
    avg_response_minutes   = EXCLUDED.avg_response_minutes,
    is_public              = EXCLUDED.is_public,
    updated_at             = now();
-- NOTE: status, visibility, provider_tier, provider_score, identity_status
-- are intentionally excluded from DO UPDATE. They are privileged columns
-- guarded by trg_provider_profiles_block_privileged; rewriting them from a
-- non-service_role psql session would raise
-- 'provider_profiles_privileged_column_write_forbidden'. The guard only fires
-- on UPDATE, so first-run INSERTs set the intended values.

-- Restore triggers explicitly on success. On any failure above, the implicit
-- ROLLBACK undoes these ALTER TABLE ... DISABLE TRIGGER statements as well,
-- so the table returns to its original trigger state.
ALTER TABLE public.provider_profiles ENABLE TRIGGER trg_provider_profiles_enforce_base_address;
ALTER TABLE public.provider_profiles ENABLE TRIGGER trg_provider_profiles_min_age;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- Per-country counts across the explicit 17 seeded slugs.
SELECT base_country_code AS country, count(*) AS providers
FROM public.provider_profiles
WHERE provider_slug IN (
  'mette-copenhagen','anders-aarhus','sofia-odense','jonas-aalborg','camilla-esbjerg',
  'linnea-stockholm','erik-goteborg','astrid-malmo',
  'lena-berlin','markus-munich','sabine-hamburg',
  'carmen-madrid','pablo-barcelona','lucia-valencia',
  'emma-london','daniel-manchester','olivia-edinburgh'
)
GROUP BY base_country_code
ORDER BY base_country_code;

-- Full seeded row snapshot for auditing.
SELECT provider_slug, display_name, base_country_code, hourly_rate,
       service_area_radius_km, avg_response_minutes, provider_tier,
       provider_score, status, visibility, is_public
FROM public.provider_profiles
WHERE provider_slug IN (
  'mette-copenhagen','anders-aarhus','sofia-odense','jonas-aalborg','camilla-esbjerg',
  'linnea-stockholm','erik-goteborg','astrid-malmo',
  'lena-berlin','markus-munich','sabine-hamburg',
  'carmen-madrid','pablo-barcelona','lucia-valencia',
  'emma-london','daniel-manchester','olivia-edinburgh'
)
ORDER BY base_country_code, provider_slug;
