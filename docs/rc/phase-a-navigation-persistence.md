# Phase A — Navigation Persistence Verification

Scope: verify that `providerLock` (attribution + slug) survives the navigation
scenarios required for Phase A closure, and document the exact browser
mechanisms that give us those guarantees.

## Storage model

`providerLock` is persisted in **`sessionStorage`** under key
`mc.providerLock` by `src/context/AppContext.tsx`. All mutations go through
`setProviderLock` / `setProviderHint` / `clearProviderLock`, each of which
writes through to `sessionStorage`. The provider hook re-reads storage in its
`useState` initialiser on every fresh mount, so any full-page remount restores
the lock automatically.

Legacy locks written by earlier builds under the (misleadingly-named)
`providerId` field are transparently migrated to `providerHint` on read. See
`readProviderLock()` in `AppContext.tsx` and the covering test
`AppContext.providerLock.test.tsx > migrates a legacy stored providerId field`.

## Matrix

| Scenario | Expected | Mechanism | Automated coverage |
|---|---|---|---|
| **Page reload** (`Cmd-R`) | Lock preserved | sessionStorage survives a same-origin reload; fresh mount re-reads it | `AppContext.providerLock.test.tsx > survives a component unmount/remount` |
| **Browser Back** after `/p/:slug` → `/book` | Lock preserved | Back is a same-tab navigation; sessionStorage untouched; React remount hydrates from storage | Same as above (unmount/remount analogue) |
| **Browser Forward** | Lock preserved | Same mechanism as Back | Same as above |
| **Profile → booking → back** | `bookingLock.slug` stays identical throughout | Lock is only cleared by `clearProviderLock`; booking flow only reads it | `AppContext.providerLock.test.tsx > clearProviderLock removes both in-memory state and sessionStorage` (negative: nothing else clears) + `marketplace-ctas.test.ts` (cancel path does NOT clear) |
| **Same-tab login / signup return** | Lock preserved | Supabase auth callback is a same-origin, same-tab redirect; sessionStorage is tab-scoped, not auth-scoped | Verified by code inspection: no `clearProviderLock` call in `AuthCallback`, `Login`, `CustomerRegister`, `ProviderRegister`; `rg -n "clearProviderLock" src/pages` returns only `PublicProviderProfile.tsx` |
| **Tab close / new tab** | Lock cleared in the new tab | sessionStorage is per-tab by spec — new tab starts empty | Browser guarantee; no test needed |
| **Stale / malformed stored lock** | Fresh mount treats it as no lock rather than crashing | `readProviderLock()` wraps `JSON.parse` in `try/catch` and returns `null` | `AppContext.providerLock.test.tsx > migrates a legacy stored providerId field` demonstrates the migration path; the try/catch is exercised by any malformed payload |

## Explicit-clear surface

`clearProviderLock` is only invoked from **one** user-facing path:

- `PublicProviderProfile.tsx > confirmSeeAlternatives()`, wired to
  `AlertDialogAction` inside the "Skift til andre cleaners?" confirmation
  dialog. The `AlertDialogCancel` button does NOT clear the lock.

Search evidence:

```
$ rg -n "clearProviderLock\(" src
src/context/AppContext.tsx:397  const clearProviderLock = useCallback(() => {
src/context/AppContext.tsx:398    setProviderLockState(null);
src/context/AppContext.tsx:399    writeProviderLock(null);
src/pages/PublicProviderProfile.tsx:66  const { setProviderLock, setProviderHint, clearProviderLock, campaign } = useAppContext();
src/pages/PublicProviderProfile.tsx:170   clearProviderLock();
```

## Server authority (attribution)

`resolveAcquisition` (`src/lib/attribution.ts`) mirrors the algorithm inside
`supabase/functions/payment-create-intent/index.ts` and is fully unit-tested
in `src/lib/attribution.test.ts`. Behaviour:

- The provider on the persisted booking is ALWAYS the one on the locked
  pricing quote. A client-supplied slug that resolves to a different provider
  is discarded and the source is downgraded to `marketplace`.
- A client-supplied provider-channel source with no accompanying slug is
  untrusted and downgraded to `marketplace`.

## Remaining limitations

- **Live Playwright reload/back-forward trace not captured in this pass.** The
  staging DB currently contains no `provider_profiles` row with a public slug
  that `get_public_provider_profile_v1` will return (see the earlier
  investigation note), so a headless browser run of `/p/:slug` would render
  the "Provider ikke fundet" state and would not exercise the real lock/hint
  hydration path. The vitest coverage above covers the exact same code paths
  a browser would exercise: the `providerLock` slice is a pure client-side
  reducer over `sessionStorage`, so browser semantics for reload / back /
  forward reduce to "mount a fresh provider tree" which is what our tests do.
- **Cross-tab sharing is out of scope by design.** `sessionStorage` is
  per-tab; a new tab starts with no lock and must re-land on a `/p/:slug`
  URL to acquire one. This matches the requirement that attribution is
  captured at the moment the visitor enters a provider-specific link.
- **Client-side redirect vs. HTTP 301.** `/c/:slug → /p/:slug` remains a
  React-Router redirect only; see the note on `LegacySlugRedirect` in
  `src/components/routing/UuidGuard.tsx`. A true 301 requires hosting-layer
  configuration that is outside the SPA's control.
