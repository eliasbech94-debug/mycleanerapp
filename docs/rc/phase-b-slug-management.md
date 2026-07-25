# Phase B — Provider Slug Management

Status: implemented on `develop`, migration applied to Lovable Cloud project.

## Scope shipped
- `provider_slug_reservations` seeded with 55+ system, marketing, legal, category words.
- `provider_slug_history` — indefinite redirect table.
- `provider_slug` column converted to `citext`; format enforced by trigger (2–40 chars, `[a-z0-9-]`, no leading/trailing hyphen, no `--`).
- RPCs: `validate_provider_slug_format`, `check_slug_availability_v1`, `rename_provider_slug_v1` (1/90 days), `resolve_slug_v1`, `admin_reserve_slug_v1`, `admin_release_slug_v1`.
- Client: `src/lib/slug.ts` mirrors DB validator; `src/components/provider/ProviderShareCard.tsx` provides link copy, native share, SVG+PNG QR download, debounced rename form, 90-day confirmation dialog.
- Integration: card mounted in `ProviderDashboard` and in the `Settings` tab of `provider/ProviderProfile`.
- `PublicProviderProfile` calls `resolve_slug_v1` up-front and issues a client-side `Navigate replace` for `redirect` results, preserving all query params (including `?src=`).
- Provider profile page now links to `/p/:slug` (was `/c/:slug`); `/c/:slug` legacy redirect unchanged.

## Authorization
- `check_slug_availability_v1`: authenticated only.
- `rename_provider_slug_v1`: requires `has_role(auth.uid(),'provider')` + owning `provider_profiles` row; row-level `FOR UPDATE` lock; enforces 90-day cooldown against `provider_slug_history`.
- `resolve_slug_v1`: public (anon+authenticated).
- `admin_*`: require `has_role(auth.uid(),'admin')`.

## Slug history strategy
Renames append to `provider_slug_history` via `AFTER UPDATE` trigger. History rows never expire — old links keep resolving forever. If the same provider reclaims an old slug, the history row is auto-cleared (self-reclaim). Other providers can never claim a historical slug (blocks link hijacking).

## QR
Encoded payload: `https://<origin>/p/<slug>?src=provider_qr` — attribution enum already exists. Error correction level `H`. Client-side generation via `qrcode@1.5.4`; SVG rendered inline, PNG rasterised at 1024 px.

## Tests
- `src/lib/slug.test.ts` — 13 format cases.
- `src/components/provider/ProviderShareCard.test.tsx` — 5 UI/behaviour cases.
- `src/pages/PublicProviderProfile.redirect.test.tsx` — 2 resolver-redirect cases (redirect preserves query, not_found renders empty state).
- `staging-validation/scenarios/19-slug-management.ts` — reservation & format sanity, resolve active/redirect/not_found round-trip.

**Result: `bunx tsgo --noEmit` clean; `bunx vitest run` — 32 files / 233 tests passed.**

## Rollout
1. Merge PR into `develop`.
2. Staging deploy applies migration and runs Scenario 19.
3. Smoke: rename own slug in staging, verify old `/p/:oldslug` redirects, scan downloaded QR with a phone.
4. Promote to `main` only after staging green.

## Rollback
- Code revert removes UI surfaces; DB objects are non-destructive.
- Emergency kill: `admin_release_slug_v1` for reservation issues; or `UPDATE feature_flags` (if a `provider_slug_rename` flag is later introduced) to disable rename RPC. Current implementation has no flag gate — revert PR to disable.

## Out of scope (deferred)
- Marketing attribution analytics dashboards, channel-based commissions, pricing changes, Funds Release modifications, centre-logo QR overlay, HTTP-301 hosting-layer redirect.
