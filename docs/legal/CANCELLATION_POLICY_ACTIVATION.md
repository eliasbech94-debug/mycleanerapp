# Koordineret aktivering — 18/8 cancellation policy

**Activation instant (T):** `2026-08-01T06:00:00.000Z` (Europe/Copenhagen 2026-08-01 kl. 08.00)
_Rettet 2026-07-31: tidligere planlagt T var 2026-08-03T06:00:00.000Z._
**Kill switch:** edge-secret `CANCELLATION_POLICY_V2_ENABLED` (aktuelt `true`)
**Fail-safe:** alt andet end nøjagtigt `"true"` → v1.0.0 (48/24)

## 1. Kanonisk policyvalg

`policyAt(instant, v2Enabled?)` i `src/lib/cancellationPolicy.ts` og den byte-identiske
edge-kopi `supabase/functions/_shared/cancellationPolicy.ts`:

| Betingelse | Valgt policy | Stige |
|---|---|---|
| `instant < T` | v1.0.0 | >48t 100 %, 24–48t 50 %, <24t 0 % |
| `instant >= T` og switch aktiv | v2.0.0 | >18t 100 %, 8–18t 50 %, <8t 0 % |
| switch inaktiv/uset | v1.0.0 | fail-safe |

Paritet håndhæves af `src/lib/cancellationPolicy.parity.test.ts` (byte-diff af
alt fra `export type CancellationTierKey` og frem).

## 2. Backend

* `payment-create-intent` fryser `cancellation_policy_snapshot =
  cancellationPolicySnapshot(policyAt(new Date()))` ved oprettelse og returnerer
  `cancellation_policy_version` til klienten (også på idempotent replay).
* `booking-cancel` bruger udelukkende bookingens frosne snapshot
  (`policyForSnapshot`) — aldrig den aktuelle globale stige.
* Begge funktioner er deployet.

## 3. Frontend

* Regler, FAQ, bookingflow og cancellation notice bruger `policyAt(now)` før en
  booking findes, og bookingens frosne version bagefter.
* Bookingbekræftelsen (`Step4`) modtager `policyVersion` fra serverens svar.

## 4. Juridiske dokumenter

| Dokument | Version | Status | effective_at |
|---|---|---|---|
| MC-CANCELLATION-POLICY-001 | 1.2.0 | **draft** | 2026-08-01T06:00:00Z |
| MC-REFUND-POLICY-001 | 1.2.0 | **draft** | 2026-08-01T06:00:00Z |
| MC-CANCELLATION-POLICY-001 | 1.0.0 | published | (nuværende) |
| MC-REFUND-POLICY-001 | 1.0.0 | published | (nuværende) |

Publicering sker med den forberedte atomiske transaktion
`scripts/legal/PREPARED_publish_cancellation_refund_v1_2_0.sql`:
tidsgate, hash- og sektionsverifikation, supersede + publish i én transaktion,
idempotent, med efterkontrol af "præcis én published version pr. slug" og
audit-log. Enhver afvigelse ruller hele transaktionen tilbage — delvis
publicering af kun det ene dokument er umulig.

## 5. Rollback

1. Sæt `CANCELLATION_POLICY_V2_ENABLED = false` → alle **nye** bookinger fryser
   v1.0.0 igen med det samme, uden deploy.
2. Kør `scripts/legal/PREPARED_rollback_cancellation_refund_v1_2_0.sql` for at
   sætte dokumenterne tilbage til v1.0.0.

Eksisterende bookinger røres aldrig: deres snapshot afgør refusionen, så
rollback er hverken retroaktiv for v2- eller v1-bookinger.

## 6. Tests

51 grønne: ladder (20), aktivering omkring T−1 ms / T / T+1 ms og
switch-tilstande (18), paritet + integrationsflader (13).
