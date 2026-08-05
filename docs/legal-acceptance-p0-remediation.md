# Legal acceptance P0 remediation

This document records the implementation order for the legal acceptance findings. It does not change runtime behaviour or legal text.

## Confirmed blockers

1. Published GLOBAL English `terms` and `privacy` documents have a `body_hash` that does not match the SHA-256 digest of `body_md`.
2. Providers do not accept a versioned `provider_agreement`; onboarding stores only `provider_profiles.terms_accepted_at`.
3. Customer signup paths can continue when `recordAcceptances` fails.
4. `LegalGate` exists but is not mounted, so new required versions are not enforced.
5. Public legal pages are linked from signup but are not the immutable documents recorded by `user_legal_acceptances`.

## Required implementation order

### P0-A — Evidence audit

Run `scripts/legal-acceptance-p0-audit.sql` read-only against the intended environment. Save the result as release evidence. Do not mutate rows during the audit.

### P0-B — Republish invalid GLOBAL documents

Do not update a published immutable row in place. Create new document versions containing the intended body and a SHA-256 hash calculated from the exact UTF-8 `body_md`. Mark the previous versions superseded only after the new rows pass hash verification.

Acceptance criteria:

- `hash_matches = true` for every newly published row.
- Existing acceptance rows remain linked to the historical document rows.
- No published body, version or hash is overwritten.

### P0-C — Provider agreement

Create and legally approve a `provider_agreement` before publishing it. Provider onboarding must resolve the exact active document, display its version, and write a row to `user_legal_acceptances` with `document_id`, `version` and `document_hash`.

Do not treat `terms_accepted_at` as sufficient evidence. It may remain temporarily for backwards compatibility, but the versioned acceptance row is authoritative.

### P0-D — Fail closed on acceptance persistence

Customer and provider onboarding must not report completion or navigate into the application when required legal acceptance persistence fails.

For email-confirmation signups, pending acceptance data may be stored temporarily, but the authenticated callback must persist it before allowing normal navigation. Failed persistence must keep the pending payload and present a retryable blocking state.

Never use an empty catch around legal acceptance writes.

### P1 — Re-acceptance gate

Mount one `LegalGate` at the authenticated application shell. Before mounting:

- remove the duplicate status request;
- add explicit loading and error states;
- render or link the exact immutable document body, not a generic public page;
- block dismissal while required documents remain pending;
- verify customer/provider document-kind selection;
- test retries and partial multi-document acceptance.

## Safety boundaries

- No direct production mutation without an environment guard and saved preflight evidence.
- No silent modification of published legal rows.
- No merge or deploy until TypeScript, unit tests, build, translation validation and the SQL audit are green.
- Legal text and the provider agreement require legal approval; engineering must not invent substantive terms.
