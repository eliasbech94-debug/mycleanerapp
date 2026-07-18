# SECURITY DEFINER Functions — Access Matrix

Last reviewed: Task 3 (production hardening).

`SECURITY DEFINER` means the function runs with the privileges of its **owner**
(`postgres`), not the caller. It is used deliberately for two reasons:

1. **Bypass RLS** on tables the caller cannot read directly (role lookups,
   encryption, address validation).
2. **Enforce atomic constraints** the caller could otherwise race
   (invoice-number allocation, primary-address uniqueness).

The `EXECUTE` grant on a `SECURITY DEFINER` function decides **who can call it**
— it does not change what the function is allowed to do internally. All
functions below are pinned to `search_path = public` (+ `extensions`, `pg_temp`
where they need pgcrypto) to prevent search-path hijacking.

## Access matrix

| Function | Definer? | Executable by | Why |
|---|---|---|---|
| `handle_new_user()` | ✅ | `service_role` only | Trigger on `auth.users` — creates a `public.profiles` row. Never called directly. |
| `update_updated_at_column()` | ❌ (INVOKER) | `service_role` only | Generic `updated_at` trigger. Runs in trigger context; no client needs `EXECUTE`. |
| `unset_other_primary_addresses()` | ✅ | `service_role` only | Trigger on `customer_addresses`. Definer because it must update sibling rows the caller may not own concurrently (single primary invariant). |
| `enforce_address_country()` | ✅ | `service_role` only | Trigger on `profiles`/`customer_addresses`. Reads `place_validations` and cross-checks country_code — needs to bypass RLS on the validation table. |
| `reject_plaintext_tax_write()` | ❌ (INVOKER) | `service_role` only | Trigger guardrail — raises if a non-service-role caller tries to write plaintext tax columns. Runs in trigger context. |
| `tax_encrypt(text, text)` | ✅ | `service_role` only | Wraps `extensions.pgp_sym_encrypt`. Restricted so client roles cannot use the encryption key material via SQL RPC. All encryption goes through the `provider-tax-profile` / `profile-tax-id` edge functions. |
| `tax_decrypt(bytea, text)` | ✅ | `service_role` only | Same reasoning as `tax_encrypt`. Decryption is only performed inside `invoice-issue` and the tax edge functions. |
| `next_invoice_number(text)` | ✅ | `service_role` only | Atomic per-country sequence for invoice numbering. Called by `invoice-issue` edge function. Direct client access would let attackers burn sequence numbers. |
| `has_role(uuid, app_role)` | ✅ | `authenticated`, `service_role` | **Intentionally callable by signed-in users** — referenced inside RLS `USING` / `WITH CHECK` policies on virtually every table. RLS expressions execute as the querying role, so `authenticated` needs `EXECUTE`. `anon` does not (no RLS policy for anonymous roles uses it). |
| `get_user_roles(uuid)` | ✅ | `authenticated`, `service_role` | **Intentionally callable by signed-in users** — used by the `useUserRoles` hook to render role-scoped UI. RLS on `user_roles` still restricts what a caller can read via the function's `SECURITY DEFINER` grant. |
| `user_owns_provider(text)` | ✅ | `authenticated`, `service_role` | **Intentionally callable by signed-in users** — RLS policies on provider-scoped tables call it to check ownership without leaking cross-user profile rows. |
| `get_providers_in_bounds(...)` | ✅ | `anon`, `authenticated`, `service_role` | **Intentionally public** — powers the public Find Cleaner map. Returns only coarse, non-PII fields (display name, obfuscated area, country code, business flag). No emails, phone numbers, addresses, or tax data. |

## Linter warnings — accepted

Supabase's database linter flags every `SECURITY DEFINER` function callable by
`anon` or `authenticated`. The four rows above marked *intentionally* are
accepted warnings with documented justification. Do not "fix" them by revoking
`EXECUTE` — doing so will break RLS evaluation and the public map.

## Rules for adding a new SECURITY DEFINER function

1. Default to `SECURITY INVOKER`. Only escalate to `DEFINER` when RLS bypass or
   cross-row invariants require it.
2. Always `SET search_path = public` (add `extensions`, `pg_temp` for pgcrypto).
3. Immediately after `CREATE OR REPLACE FUNCTION`:
   ```sql
   REVOKE ALL ON FUNCTION public.<name>(...) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.<name>(...) TO service_role;
   -- Add authenticated only if referenced in an RLS policy expression.
   -- Add anon only if the function returns strictly public, non-PII data.
   ```
4. Update this file in the same migration.
