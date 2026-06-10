# Adressebog med adgangsinformation

Tilføj mulighed for at gemme flere adresser pr. bruger med én primær adresse, samt rige metadata (sted-type, dyr, adgangsinstruktioner mm.) som auto-udfyldes i booking-flowet.

## 1. Database (ny tabel `customer_addresses`)

Felter:
- `id`, `user_id` (auth.users), `created_at`, `updated_at`
- `label` (fx "Hjem", "Sommerhus", "Kontor")
- `address`, `address_place_id`, `lat`, `lng`
- `is_primary` (bool, max én pr. bruger via partial unique index)
- `place_type` enum: `private` | `business` | `vacation` | `other`
- `size_sqm` (int, nullable)
- `rooms` (int, nullable)
- `floor` (text, fx "3. sal th")
- `has_pets` (bool), `pet_details` (text — "2 katte, allergivenlig")
- `has_children` (bool)
- `parking_info` (text — "Gratis ved døren / betalingszone")
- `access_method` enum: `home` | `key_box` | `key_under_mat` | `doorman` | `code` | `other`
- `access_code` (text), `access_instructions` (text)
- `wifi_name`, `wifi_password` (text, nullable)
- `cleaning_supplies_available` (bool)
- `notes` (text — generelle bemærkninger)

RLS: brugere kan kun se/ændre egne adresser. Trigger sikrer at sætning af `is_primary=true` fjerner flag fra andre rækker for samme bruger.

## 2. Profile-side (`src/pages/Profile.tsx`)

Ny tab "Adresser" med:
- Liste over gemte adresser (kort med label, badge for "Primær", chips for type/dyr/børn)
- "Tilføj adresse" knap → dialog med fuld form (AddressAutocomplete + alle metadata-felter)
- Rediger / slet pr. adresse
- "Gør til primær" knap
- Den nuværende `address`-info-tab fortsætter med basis kontaktoplysninger, men adressedelen flyttes hertil

## 3. Booking-flow (`src/pages/BookingFlow.tsx`)

I Step 3:
- Hvis brugeren har flere adresser → vis adressevælger (radio cards) med primær valgt by default
- Når en gemt adresse vælges, auto-udfyldes alle felter (inkl. notes prefyldes med adgangsinstruktioner + dyr + parkering hvis tomt)
- Stadig mulighed for at indtaste ny engangs-adresse
- Booking gemmer fortsat `address`, `address_place_id`, `lat`, `lng` på `bookings` (ingen ændring af bookings-skema)

## 4. Teknisk

- Tilføj zod-schema for adresse-form
- Genbruger `AddressAutocomplete`
- Bruger `useAuth` hook, ingen ændring der
- Types regenereres automatisk efter migration

Efter approval af migration laver jeg UI'et i Profile + booking-integration.
