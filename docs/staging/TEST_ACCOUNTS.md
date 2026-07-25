# Staging test accounts & seed data

Companion to `staging-validation/seed/test-providers.sql`. Applies to the
**staging** Supabase project only — never against production.

## 1. Seed 17 provider profiles (DK/SE/DE/ES/GB)

```bash
psql "$STAGING_PG_CONN" -f staging-validation/seed/test-providers.sql
```

Verification query at the bottom of the script prints the per-country count.
Expected output:

| country_code | providers |
|--------------|-----------|
| DE           | 3 |
| DK           | 5 |
| ES           | 3 |
| GB           | 3 |
| SE           | 3 |

## 2. Create test auth users

Supabase auth users must be created through the Admin API (they can't be
seeded through raw SQL because of hashed password handling). Run this once
against staging using the service-role key:

```bash
STAGING_SUPABASE_URL="https://<staging-ref>.supabase.co" \
STAGING_SUPABASE_SERVICE_ROLE_KEY="<staging-service-role>" \
bun run staging-validation/seed/create-test-users.ts
```

Accounts created:

| Role      | Email                          | Password        | Notes |
|-----------|--------------------------------|-----------------|-------|
| Customer  | `test.customer@mycleaner.dev`  | `TestPass!2026` | Country DK, address auto-completed on first login. |
| Provider  | `test.provider@mycleaner.dev`  | `TestPass!2026` | Linked to `mette-copenhagen` provider profile. |
| Support   | `test.support@mycleaner.dev`   | `TestPass!2026` | `support` role via `user_roles` insert. |
| Admin     | `test.admin@mycleaner.dev`     | `TestPass!2026` | `admin` role via `user_roles` insert. |

The script is **idempotent**: it upserts users and role assignments and can be
re-run safely.

## 3. Full end-to-end coverage

Once (1) and (2) are green, the following flows are exercisable against
staging with real data (no demo fallback):

- Login / logout (email + magic link)
- Favoriting / unfavoriting a cleaner
- Booking a slot on `mette-copenhagen`
- Sending a message in the conversation inbox
- Editing profile fields (address, notification prefs)
- Country switch via the market menu (DK → SE → DE → ES → GB)

## 4. Reset

```bash
psql "$STAGING_PG_CONN" -c "DELETE FROM public.provider_profiles WHERE provider_slug LIKE ANY (ARRAY['mette-%','anders-%','sofia-%','jonas-%','camilla-%','linnea-%','erik-%','astrid-%','lena-%','markus-%','sabine-%','carmen-%','pablo-%','lucia-%','emma-%','daniel-%','olivia-%']);"
```
