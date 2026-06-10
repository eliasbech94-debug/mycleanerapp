-- Seed test users (kunde + provider) for end-to-end testing
DO $$
DECLARE
  customer_id uuid := '11111111-1111-1111-1111-111111111111';
  provider_id_uuid uuid := '22222222-2222-2222-2222-222222222222';
  hashed_pw text := crypt('Test1234!', gen_salt('bf'));
BEGIN
  -- Customer
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test.kunde@mycleaner.test') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', customer_id, 'authenticated', 'authenticated',
      'test.kunde@mycleaner.test', hashed_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Test Kunde"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), customer_id, customer_id::text,
      jsonb_build_object('sub', customer_id::text, 'email', 'test.kunde@mycleaner.test', 'email_verified', true),
      'email', now(), now(), now());
  END IF;

  -- Provider
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test.provider@mycleaner.test') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', provider_id_uuid, 'authenticated', 'authenticated',
      'test.provider@mycleaner.test', hashed_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Test Provider"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), provider_id_uuid, provider_id_uuid::text,
      jsonb_build_object('sub', provider_id_uuid::text, 'email', 'test.provider@mycleaner.test', 'email_verified', true),
      'email', now(), now(), now());
  END IF;

  -- Profiles (handle_new_user trigger should have created rows; upsert just in case)
  INSERT INTO public.profiles (id, full_name, phone, address, lat, lng, country_code)
  VALUES (customer_id, 'Test Kunde', '+4512345678', 'Nørrebrogade 1, 2200 København N', 55.6918, 12.5527, 'DK')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, address = EXCLUDED.address,
    lat = EXCLUDED.lat, lng = EXCLUDED.lng, country_code = EXCLUDED.country_code;

  INSERT INTO public.profiles (id, full_name, phone, address, lat, lng, country_code,
    provider_id, stripe_account_id, stripe_onboarded, stripe_charges_enabled, stripe_payouts_enabled)
  VALUES (provider_id_uuid, 'Test Provider', '+4587654321', 'Vesterbrogade 10, 1620 København V', 55.6710, 12.5503, 'DK',
    'p_001', 'acct_test_placeholder', true, true, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, address = EXCLUDED.address,
    lat = EXCLUDED.lat, lng = EXCLUDED.lng, country_code = EXCLUDED.country_code,
    provider_id = EXCLUDED.provider_id,
    stripe_account_id = EXCLUDED.stripe_account_id,
    stripe_onboarded = EXCLUDED.stripe_onboarded,
    stripe_charges_enabled = EXCLUDED.stripe_charges_enabled,
    stripe_payouts_enabled = EXCLUDED.stripe_payouts_enabled;
END $$;