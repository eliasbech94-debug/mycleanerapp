# Phase B — Staging Verification Report

**Status:** Partial — sandbox-verifiable evidence collected. Staging-execution and operator (mobile/UI) steps require the GitHub Actions dispatch + a human on staging.

**Important scope note:** The Lovable sandbox is wired to the **production** Supabase project. Running scenario 19, migrations, or writes from here would violate the "STAGING only" approval gate. All staging-touching steps below MUST be executed through the GitHub Actions workflows against the staging Supabase project, and UI/mobile steps by an operator on `https://<staging-app>`. This document records the sandbox-verifiable baseline plus the exact runbook and expected evidence for each remaining check.

---

## 1. Sandbox-verifiable evidence (green)

### 1.1 Typecheck
```
$ bunx tsgo --noEmit
(clean — 0 errors)
```

### 1.2 Unit test suite
```
$ bunx vitest run
Test Files  32 passed (32)
     Tests  234 passed (234)
  Duration  9.41s
```
Includes Phase B tests:
- `src/lib/slug.test.ts` — format validation, reserved-word rejection
- `src/components/provider/ProviderShareCard.test.tsx` (6 tests) — QR render, copy link, download handlers, `?src=provider_qr`
- `src/pages/PublicProviderProfile.redirect.test.tsx` — `resolve_slug_v1` active / redirect / not_found paths, query-string preservation
- `src/pages/provider/ProviderProfile.test.ts` — Share Center integration
- `src/context/AppContext.providerLock.test.tsx` — provider lock persistence (Phase A regression guard)
- `src/App.routes.test.tsx` / `App.customer.routes.test.tsx` / `App.phase1.routes.test.tsx` — routing regressions

### 1.3 Scenario 19 static verification
`staging-validation/scenarios/19-slug-management.ts` covers, via `service_role`:
- Reserved-slug enforcement (`admin` in `provider_slug_reservations`)
- Format rejection matrix: `a`, `-abc`, `abc-`, `ab--cd`, `HAS UPPER`, empty
- `resolve_slug_v1` — active, not_found, redirect (synthetic history row, then cleanup)

---

## 2. Runbook — staging execution (operator)

### 2.1 Scenario 19 (automated)
Dispatch the new workflow against the `staging` branch:

```
GitHub → Actions → "Phase B — Slug Management Staging Evidence" → Run workflow → Branch: staging
```

Artifact: `phase-b-scenario-19` → `evidence-scenario-19.log`.

**Pass criteria:** every `logAssertion` line ends with `PASS`; no `FAIL` lines.

### 2.2 Manual UI / mobile checks
Perform on the deployed staging app (`STAGING_APP_URL`) with a provider account that has an active slug.

| # | Area | Steps | Expected | Evidence to capture |
|---|------|-------|----------|---------------------|
| 1 | Slug lifecycle | Provider Dashboard → Share Center → Rename slug → confirm | New slug active, history row written, 90-day cooldown surfaced | Screenshot of Share Center after rename; `SELECT * FROM provider_slug_history WHERE provider_user_id=…` |
| 2 | Redirect | Visit `/p/<old-slug>?src=marketplace_pick&utm_test=1` | 302/replace to `/p/<new-slug>` with **query string preserved** | Screenshot of address bar + network tab |
| 3 | Cooldown override + rename back | Admin: `UPDATE provider_profiles SET slug_renamed_at = NULL WHERE user_id=…` → Rename back | Second rename succeeds, second history row present | Two rows in `provider_slug_history`; screenshot of confirmation toast |
| 4 | Public profile | `/p/<slug>` unauthenticated | Loads, `ProviderShareCard` hidden, "Book" CTA points to `/book?providerHint=…&src=provider_profile` | Screenshot |
| 5 | QR — desktop | Share Center → Copy link, Native share, SVG download, PNG download | All 4 succeed; SVG + PNG open the same URL with `?src=provider_qr` | Downloaded files + screenshot |
| 6 | QR — mobile | Scan printed PNG with iOS/Android camera | Opens `/p/<slug>?src=provider_qr`; booking flow inherits `provider_qr` source | Photo of scan + booking `acquisition_source` row |
| 7 | Homepage ranking | Load homepage in a market with mixed Pro/standard providers | "Top rated cleaners in your area": Pro/Premium first, then distance-sorted, then quality-sorted; fills with standard when Pro < 8 | Screenshot + `explain` of the RPC ordering |

### 2.3 Security matrix (SQL — run via staging psql or `supabase--read_query` against staging)

```sql
-- as anon
select rename_provider_slug_v1('new-slug');                 -- expect 42501 permission denied
-- as authenticated non-provider
select rename_provider_slug_v1('new-slug');                 -- expect error 'not a provider'
-- reserved
select rename_provider_slug_v1('admin');                    -- expect 'slug_reserved'
-- duplicate (other provider's active slug)
select rename_provider_slug_v1('<peer_slug>');              -- expect 'slug_taken'
-- historical slug owned by another provider
select rename_provider_slug_v1('<other_history_slug>');     -- expect 'slug_taken_history'
-- admin RPCs as non-admin
select admin_reserve_slug_v1('foo');                        -- expect 'admin_only'
select admin_release_slug_v1('foo');                        -- expect 'admin_only'
```

### 2.4 Regression pack (operator smoke)
On the same staging deploy:

- [ ] Existing booking detail page loads, no console errors
- [ ] Legacy `/provider/<uuid>` still opens (UuidGuard passes)
- [ ] Marketplace map: pins clickable → route to `/p/<slug>?src=marketplace_pick`
- [ ] Provider search returns results
- [ ] Booking flow completes to Stripe test intent (`payment-create-intent` accepts locked quote)
- [ ] Provider lock persists across a page refresh mid-booking
- [ ] Payment: 4242 4242 4242 4242 succeeds; `bookings.acquisition_source` populated

---

## 3. Known issues / open items

- Sandbox cannot execute against staging Supabase (production credentials only). No production writes were performed.
- Homepage-ranking algorithm (Phase C) — code path still uses the pre-Phase-C ordering. Verification (7) checks the *current* fallback ordering only.
- Mobile QR check (6) is inherently manual; no automated evidence path exists.
- No CI workflow existed for Scenario 19; this change adds `.github/workflows/phase-b-slug-management.yml` and `phaseB:slug` npm script.

---

## 4. Approval gate

Phase B → production is contingent on:
1. Scenario 19 workflow run: all assertions PASS.
2. UI checks 1–5 + 7: screenshots attached, all pass.
3. Mobile QR check 6: photo evidence attached.
4. Security matrix 2.3: every statement returns the expected error.
5. Regression pack 2.4: all boxes ticked.

When operator returns green evidence for 1–5, promote `staging` → `main`.
