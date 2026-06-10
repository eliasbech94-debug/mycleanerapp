## Mål
Opret to test-brugere du kan logge ind med for at teste hele booking + payment flowet end-to-end.

## Test-brugere

**Kunde**
- Email: `test.kunde@mycleaner.test`
- Password: `Test1234!`
- Rolle: almindelig kunde, kan booke

**Provider**
- Email: `test.provider@mycleaner.test`
- Password: `Test1234!`
- `provider_id`: `test-provider-1` (kobles til en eksisterende provider i `src/lib/providers.ts` så booking-siden virker)
- Stripe Connect: markeres som onboardet med en test `acct_xxx` placeholder — så betalingsflowet ikke crasher i UI, men reelle Stripe-kald vil først virke når du onboarder providerens Connect konto rigtigt via `/provider-dashboard`.

## Hvad migrationen/insert gør

1. **Insert i `auth.users`** for begge brugere via `crypt()` + bcrypt med `email_confirmed_at = now()` (så ingen email-verifikation kræves).
2. **Insert i `auth.identities`** så email/password login virker.
3. `handle_new_user`-triggeren opretter automatisk rækker i `public.profiles`.
4. **Update `public.profiles`** for provideren: sæt `provider_id`, `country_code='DK'`, `stripe_account_id='acct_test_placeholder'`, `stripe_onboarded=true`, `stripe_charges_enabled=true`, `stripe_payouts_enabled=true`, og en test-adresse + lat/lng (København).
5. **Update `public.profiles`** for kunden: sæt navn, telefon, adresse, lat/lng.

## Tekniske detaljer

- Bruger `pgcrypto` (allerede aktiveret i Supabase) til at hashe passwords med `crypt(password, gen_salt('bf'))`.
- Hvis brugerne allerede findes (re-run), bruges `ON CONFLICT (email) DO NOTHING` så det er idempotent.
- `provider_id` matcher en provider i `src/lib/providers.ts` (jeg tjekker filen og vælger en eksisterende ID — alternativt tilføjer jeg `test-provider-1` til listen hvis det giver bedre testdata).
- Ingen ændringer til UI eller business logic — kun seed data.

## Sådan tester du efter

1. Gå til `/login`, log ind som kunden, opret en booking med test-kort `4242 4242 4242 4242` på providerens kalender.
2. Log ud, log ind som provideren, gå til `/provider-dashboard`, accept/decline bookingen.
3. Tjek `payment_status` skifter i DB (`pending → authorized → captured` eller `cancelled`).

Bekræft planen, så kører jeg migration + seed.