# Soft-Launch Blockers — Status

_Last updated by automated audit._

## Priority 1 — must clear before invite-only soft launch goes live

| # | Blocker | Status | Owner action |
|---|---|---|---|
| 1.1 | Stripe LIVE end-to-end (charge, webhook, booking, payout, full refund, partial refund, failed payment, dispute) | **PENDING** — cannot be verified from build sandbox | Run each flow in live mode with a real card + real bank; capture Stripe Dashboard event IDs; attach to this doc |
| 1.2 | Email deliverability (Gmail / Outlook / iCloud, SPF, DKIM, DMARC, signup, reset, booking confirmation, provider notification) | **BLOCKED** — no email domain configured for the project | Complete email domain setup in Cloud → Emails, then run test sends to one inbox per provider and check "View Original" for SPF/DKIM/DMARC = PASS |
| 1.3 | RLS regression suite covering anon/customer/provider/support/admin/super_admin | **READY** — smoke suite committed at `scripts/rls-regression.sql` | Seed the six fixture user UUIDs in dev, run `psql -f scripts/rls-regression.sql`, expect 0 FAIL |
| 1.4 | Realtime + load verification (conversations, notifications, presence, pagination, reconnect) | **PARTIAL** — script committed at `scripts/realtime-load.mjs` (N clients + reconnect) | Run against staging with N=25; for real load-test coverage wrap with k6/Artillery at 100–1000 VUs |

## Priority 2 — Operations Checklist

Committed at `docs/production/OPERATIONS_CHECKLIST.md`. Covers backups, DR, rollback, monitoring, Stripe/email/storage monitoring, daily health checks, incident response, and pre-launch sign-off list.

---

## What was NOT done (and why)

- **No new features were built.** Per your instruction.
- I did not fabricate PASS results for 1.1 or 1.2. Those two require live infrastructure and real inboxes that the build sandbox cannot access. Marking them PASS from here would be dishonest.

---

## Current production readiness score

**78 / 100** (unchanged from the prior audit).

The +3 for shipping the RLS suite, realtime script, and ops runbook is offset by −3 because 1.1 and 1.2 remain unverified.

The score cannot move above ~85 until you complete 1.1 and 1.2 with evidence.

## Remaining issues before soft launch

1. Live Stripe happy-path + edge cases (1.1)
2. Email domain provisioned + inbox deliverability proof (1.2)
3. RLS suite executed against real seed users, 0 FAIL (1.3)
4. Realtime script executed against staging, 25/25 delivery + reconnect PASS (1.4)

## Go / No-Go recommendation

**🟡 CONDITIONAL GO** for invite-only soft launch, subject to items 1–4 above being executed and green *before* the first invitation goes out. The platform is engineering-ready; the four remaining checks are operational proofs that only you can perform.

Do not run these against real users. Do them against test cards, test inboxes, and staging first. Only then send the first invites.
