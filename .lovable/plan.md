For at hente brugerens "registrerede adresse" skal vi have et sted at gemme den. Resten af appen kører i dag på mock-data, så vi har to realistiske veje. Begge giver dig samme UX i booking-flowet — forskellen er, om data lever rigtigt eller bare simuleres.

## Vej A — Rigtig backend (anbefales hvis du snart vil have login alligevel)

1. Aktivér Lovable Cloud (database + auth).
2. Opret `profiles`-tabel med `id (FK auth.users)`, `full_name`, `phone`, `address`, `address_place_id`, `lat`, `lng`, `country_code`, RLS så hver bruger kun kan læse/skrive sin egen.
3. Trigger der auto-opretter en tom profil ved signup.
4. Tilføj minimal auth: `/login`, `/signup` (email + password + Google), og en lille `/profil`-side hvor man kan gemme sin adresse via samme `AddressAutocomplete`-komponent (med samme validering vi lige byggede).
5. I `BookingFlow` step 3:
   - Hent den loggede ind brugers profil. Hvis adresse findes → vis et "Brug min registrerede adresse"-kort øverst (fed adresse + grønt checkmark) og brug den som default valid adresse.
   - Knap **"Brug anden adresse"** skjuler kortet og viser den eksisterende `AddressAutocomplete`.
   - Knap **"Brug min registrerede adresse igen"** for at vende tilbage.
   - Hvis brugeren ikke er logget ind eller mangler adresse → vis autocomplete som i dag (uændret flow).

## Vej B — Mock med localStorage (ingen backend, hurtigt)

1. Tilføj en lille `useUserProfile` hook der læser/gemmer `{ fullName, address, lat, lng, placeId }` i `localStorage` under nøglen `mycleaner.profile`.
2. Tilføj en `/profil`-side hvor man kan skrive/redigere sin adresse (genbruger `AddressAutocomplete` med validering).
3. Samme UI som i Vej A i `BookingFlow` step 3 — kort med registreret adresse + "Brug anden adresse"-toggle.
4. Ingen rigtig login/auth — perfekt til demo, men data forsvinder hvis browser cache ryddes.

## Anbefaling

Du svarede "Ja, fuld profil med adresse", så **Vej A** er det rigtige match — men det betyder vi også skal bygge login/signup nu, ikke kun adresse-feltet. Hvis du helst vil have UX'en op at køre først og bygge auth bagefter, kan jeg lave **Vej B** nu og migrere til Cloud senere (samme komponenter, bare anden datakilde).

Hvilken vej skal jeg gå?