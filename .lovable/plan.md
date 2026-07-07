
Stort stykke arbejde. Jeg foreslår at dele det i 4 leverancer, hver kan bygges og reviewes for sig. Sig til hvis du vil ændre rækkefølge, skære noget væk eller starte med bare én del.

## Leverance 1 — Rolle-tilpasset menu
- `Header.tsx` viser forskellige links afhængigt af auth + rolle:
  - Ikke logget ind: Services, Sådan virker det, Bliv provider, Log ind, Kom i gang
  - Kunde: Mine bookinger, Ny opgave, Min profil, Servicefradrag, FAQ, Log ud
  - Provider: Provider dashboard, Kalender, Kvitteringer, Regnskab, Min profil, FAQ, Log ud
  - Admin/Employee: eksisterende dashboards (uændret; Header skjules allerede der)
- Mobilmenu spejler samme opdeling.

## Leverance 2 — FAQ / Regler / Support
- Nye sider + ruter:
  - `/faq` — FAQ chat (bruger eksisterende `support-chat` edge function) + accordion med ofte stillede spørgsmål
  - `/regler` — Platformregler, adfærdskodeks, betalingsregler
- Link i footer + i den nye rolle-menu.

## Leverance 3 — Min profil (udvidet)
Udvid `/profil` med tabs:
1. **Mine oplysninger** — navn, adresse, telefon (findes delvist)
2. **Notifikationer** — toggles for email / push / SMS (gemmes i `profiles` — ny kolonne `notification_prefs jsonb`)
3. **Skatteoplysninger** — CPR/CVR (krypteret felt), skattekommune, forskudsopgørelse-link
4. **Servicefradrag** (kun kunder) — årligt forbrug på fradragsberettigede ydelser, vejledning til indberetning på skat.dk, "Hent årsopgørelse" (PDF)
5. **Deaktivér konto** — soft-delete flow med bekræftelse

Migration: `profiles` får `notification_prefs`, `tax_id_encrypted`, `tax_municipality`, `deactivated_at`.

## Leverance 4 — Provider bogholderi
Den største del.

**a) Kvitterings-upload med AI-scan**
- Ny side `/provider-dashboard/receipts`
- Upload billede/PDF → Storage bucket `receipts` (private, RLS pr. provider)
- Edge function `receipt-scan` bruger Lovable AI Gateway (google/gemini-2.5-flash med vision) til at udtrække: beløb, moms, dato, leverandør, kategori
- UI beder brugeren tilknytte til: **specifik booking** (dropdown over egne bookings) eller **generel udgift** (kategori: transport, materialer, udstyr, andet)
- Gemmes i tabel `provider_expenses` med `quarter` (1-4) + `year` beregnet fra dato
- Bilagsmappe-visning: filtrér efter år → kvartal, download som ZIP

**b) Regnskab (samme side, øverst)**
Vis for valgt år:
```
Indkomst før skat: 245.000 kr / 2026    [fold ud ▼]
  ├─ Omsætning:              310.000 kr
  ├─ Platform + gebyrer:     -43.400 kr  (14% + Stripe)
  └─ Udgifter:                -21.600 kr  [fold ud ▼]
        ├─ Transport:          8.200 kr
        ├─ Materialer:         9.100 kr
        └─ Andet:              4.300 kr
```
Data: omsætning fra `bookings` (status=completed, provider_id, år), gebyrer beregnet, udgifter fra `provider_expenses`.

**c) Fradrags- og indberetningsvejledning**
- Provider: sektion "Sådan indberetter du din indtjening" — privat udbyder (bagatelgrænse, personlig indkomst, rubrik 20) vs. business (moms, B-skat)
- Refunderings-vejledning: hvordan du refunderer en kunde (link til Stripe refund flow i provider-dashboard)
- Følger dansk lovgivning omkring honorar (kilder: skat.dk); vises som statisk indhold med link ud.

**Migrations (leverance 4):**
```sql
CREATE TABLE public.provider_expenses (
  id uuid PK, provider_id text, booking_id uuid null,
  amount_ore int, vat_ore int, currency text,
  vendor text, category text, expense_date date,
  quarter smallint, year int,
  receipt_url text, ai_extracted jsonb,
  created_at timestamptz
);
-- + GRANT + RLS: provider ser kun egne
CREATE storage bucket 'receipts' (private)
```

**Nye edge functions:**
- `receipt-scan` — AI vision
- `provider-accounting-summary` — aggregerer regnskab pr. år

---

### Anbefalet rækkefølge
1. Leverance 1 (hurtig, ryd op i navigation)
2. Leverance 2 (FAQ/regler)
3. Leverance 3 (profil-udvidelser)
4. Leverance 4 (bogholderi — kræver flest ressourcer + AI-omkostning pr. scan)

Sig til om jeg skal starte med **alle 4 i rækkefølge**, eller kun én bestemt del først.
