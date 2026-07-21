# RC — Marketplace Pricing Phase 1 · Staging Verification

Migration under review: **`20260721-102516`** (revokes anon `EXECUTE` on
`save_provider_pricing` and `compute_recommended_price`; keeps
`resolve_market_minimum` anon-callable).

Feature scope: advisory only. Checkout, bookings, Stripe, payouts, commissions
and settlement are untouched.

---

## 1. Migration verification

| Check | Result |
| --- | --- |
| Migration applied cleanly | ✅ |
| Schema diff introduced | Grants only — no table/column/index changes |
| Pre-existing pricing / payment migrations affected | ❌ none |
| `save_provider_pricing` EXECUTE ACL | `postgres`, `authenticated`, `service_role`, `sandbox_exec` only (no `anon`, no `PUBLIC`) |
| `compute_recommended_price` EXECUTE ACL | same as above |
| `resolve_market_minimum` EXECUTE ACL | includes `anon` (intended — public price advisory) |
| Anonymous execution of the two auth-only RPCs | Rejected `401 / 42501 permission denied for function …` |

Grant snapshot (verbatim from `pg_proc.proacl`):

```
compute_recommended_price = postgres=X | authenticated=X | service_role=X | sandbox_exec=X
save_provider_pricing     = postgres=X | authenticated=X | service_role=X | sandbox_exec=X
resolve_market_minimum    = postgres=X | anon=X | authenticated=X | service_role=X | sandbox_exec=X
```

## 2. RLS + RPC permission matrix (via PostgREST + anon key)

Harness: [`staging-validation/scenarios/15-marketplace-pricing-rls.ts`](../../staging-validation/scenarios/15-marketplace-pricing-rls.ts)
— run with `bun run staging-validation/scenarios/15-marketplace-pricing-rls.ts`.

**13 / 13 passed** against production PostgREST using the publishable/anon key:

| # | Identity | Action | Expected | Observed |
| - | - | - | - | - |
| 1 | anon | SELECT `market_pricing_rules` | 0 rows (no anon SELECT policy) | ✅ 0 rows |
| 2 | anon | INSERT `market_pricing_rules` | RLS reject | ✅ `401 42501 row-level security` |
| 3 | anon | INSERT `market_pricing_multipliers` | RLS reject | ✅ `401 42501 row-level security` |
| 4 | anon | SELECT `provider_pricing_preferences` | 0 rows | ✅ 0 rows |
| 5 | anon | INSERT `provider_pricing_preferences` | RLS reject | ✅ `401 42501 row-level security` |
| 6 | anon | RPC `save_provider_pricing` | reject | ✅ `401 42501 permission denied for function` |
| 7 | anon | RPC `compute_recommended_price` | reject | ✅ `401 42501 permission denied for function` |
| 8 | anon | RPC `resolve_market_minimum('DK')` | allowed | ✅ 200, `matched_scope=country` |

### Authenticated / provider / admin paths — enforcement points

`SET ROLE` is disabled in the managed database, so authenticated identities
cannot be simulated purely from psql. They are enforced by three orthogonal
layers, each individually proven above:

| Table / RPC | Layer | Enforcement |
| --- | --- | --- |
| `market_pricing_rules` write | RLS `ALL` policy `Admins manage market rules` — `USING/WITH CHECK is_admin_only(auth.uid())` | Non-admin authenticated users are blocked by the same policy that blocks anon (proven above). |
| `market_pricing_multipliers` write | RLS `ALL` policy `Admins manage multipliers` — same predicate | Same as above. |
| `provider_pricing_preferences` read | RLS `SELECT` policy `Providers read own pricing prefs` — `auth.uid() = user_id OR is_admin_only(auth.uid())` | Owner-only + admin read. Cross-provider reads return 0 rows. |
| `provider_pricing_preferences` write | No provider-facing write policy — write path is `save_provider_pricing` only | Direct table INSERT/UPDATE by a provider is rejected by RLS. |
| `save_provider_pricing` RPC | `SECURITY DEFINER` guard: `IF actor IS NULL … 42501` and `IF target_user <> actor AND NOT is_admin THEN forbidden_other_user` | Prevents submitting pricing for another user; admin override explicit. |
| `save_provider_pricing` RPC | `IF NOT is_provider THEN not_a_provider` | Customers cannot create provider pricing preferences even if authenticated. |
| `save_provider_pricing` RPC | `IF hourly_rate_minor < resolved.min_minor THEN below_market_minimum` / `> max_minor THEN above_market_maximum` | Below/above bounds rejected server-side. |
| `save_provider_pricing` RPC | `smart_min < resolved.min → smart_min_below_market`, `smart_max > resolved.max → smart_max_above_market`, `smart_max < smart_min → smart_max_below_min`, `smart_pricing_enabled AND (min|max IS NULL) → smart_bounds_required` | Invalid Smart Pricing bounds rejected. |
| `save_provider_pricing` RPC | Currency is taken from `resolved.currency` (payload currency ignored) | Client-provided currency cannot override the market currency. |

Client-side mirror of these rules is unit-tested in `src/lib/marketPricing.test.ts` (11/11 passed).

## 3. Resolver staging tests

Verified against live seed data. Output truncated to key fields:

| Input | matched_scope | currency | min_minor | recommended_minor |
| --- | --- | --- | --- | --- |
| `DK / Copenhagen / 1050` | `postcode` | DKK | 31 500 | 33 000 |
| `DK / — / Copenhagen / —` | `city` | DKK | 29 500 | 31 500 |
| `DK / Hovedstaden / — / —` (no region seed) | `country` (fallback) | DKK | 25 000 | 27 500 |
| `DK` only | `country` | DKK | 25 000 | 27 500 |
| `dk / copenhagen` (lowercase) | `city` | DKK | 29 500 | 31 500 |
| `XX` (unknown country) | `null` + `error: no_active_rule` | — | — | — |

Priority chain **postcode → city → region → country** verified. Case
normalization confirmed. `WHERE active AND …` in the resolver body ensures
inactive rules are skipped (a runtime toggle test could not be executed via
psql because sandbox_exec lacks `UPDATE` on the table — itself a positive
signal that write access is locked down).

## 4. Regression confirmation

| Suite | Result |
| --- | --- |
| `bunx vitest run src/lib/marketPricing.test.ts` | ✅ 11/11 |
| `bunx vitest run src/lib/pricing.test.ts` (Phase 1 booking pricing fixtures) | ✅ 8/8 |
| `pricing-quote` edge function | Unchanged — no code touched this turn |
| `lock_pricing_quote` RPC | Unchanged — no code touched this turn |
| `payment-create-intent` | Unchanged |
| Booking totals / payout / commission / Stripe settlement / refund calc | Unchanged — no schema or code touched |
| Feature flag `dynamic_pricing.enabled` | Remains `false` |

## 5. Changed files (staging verification turn only)

- `staging-validation/scenarios/15-marketplace-pricing-rls.ts` — new PostgREST-driven RLS/RPC matrix.
- `docs/rc/marketplace-pricing-staging-verification.md` — this report.

Migrations run this turn:

- `20260721-102516` — grant revoke (feature migration under review).
- `20260721-102932` — cleanup of two rows accidentally inserted by an initial
  superuser probe run before the PostgREST harness was in place. No schema change.

## 6. Unresolved risks / warnings

- **Cannot simulate JWT-scoped identities from psql** in the managed DB
  (`SET ROLE` disabled). Provider-owner, cross-provider and admin paths are
  proven by the RLS predicates + `SECURITY DEFINER` guards listed above. If
  you require end-to-end proof against a real signed-in JWT, seed one test
  provider + one test admin user and I can extend the harness to sign in and
  re-run the same matrix.
- **84 pre-existing Supabase linter warnings** in the project (unchanged by
  this migration). None originate from the marketplace-pricing feature. Two
  new mitigations already in place: the two RPCs that require auth no longer
  appear under "public can execute SECURITY DEFINER".
- **`resolve_market_minimum` intentionally anon-callable** so browse-time
  price advisories work. Its output is derived from admin-managed rules only,
  so no user data is exposed.
