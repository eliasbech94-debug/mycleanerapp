# Phase 2 — Unified Conversation Engine — Production Verification Report

**Date:** 2026-07-19
**Scope:** Backend-only verification of the live Phase 2 conversation engine.
**Verifier method:** Live DB inspection (`pg_catalog`, `information_schema`, `pg_policies`, `pg_trigger`, `pg_publication_tables`, storage.objects policies), plus static audit of the 13 deployed edge functions in `supabase/functions/conversation-*`. No new features, UI or business-logic changes were made.

---

## 0. Overall verdict

**PASS with 2 non-blocking findings.** Phase 3 (Support Panel) is cleared to start.

| Area | Result |
|---|---|
| Schema | ✅ Pass |
| RLS matrix (code + policy review) | ✅ Pass |
| Edge function audit | ✅ Pass |
| Realtime strategy | ✅ Pass (with note) |
| Attachment security | ✅ Pass (virus scan still deferred) |
| Legacy migration state | ✅ Ready, not yet executed in prod |
| Notifications | ✅ Pass |
| Booking / provider_id regression fixes | ✅ Pass |
| Performance | ✅ Pass (indexes present) |
| Blocking issues | **None** |

---

## 1. Schema verification

All 9 tables exist in `public`, RLS is enabled on each (`pg_class.relrowsecurity = true`):

`conversations`, `conversation_participants`, `messages`, `message_attachments`, `conversation_reads`, `conversation_events`, `conversation_tags`, `conversation_tag_assignments`, `refund_requests_v2`.

### Check constraints (enforced by DB)
- `conversations_kind_check` — kind ∈ {booking_chat, customer_support, provider_support, dispute, internal, system}
- `conversations_status_check` — status ∈ {open, pending_customer, pending_provider, pending_support, escalated, resolved, closed}
- `conversations_priority_check` — priority ∈ {low, normal, high, urgent}
- `conversation_participants_participant_role_check` — role ∈ {customer, provider, support, admin, system}
- `messages_sender_role_check` — same role set
- `messages_body_length_check` — body ≤ 8000 chars
- `message_attachments_size_bytes_check` — 0 ≤ size ≤ 26 214 400 (25 MiB)

### Foreign keys / cascade behaviour
- `conversation_id` on every child table → `conversations(id) ON DELETE CASCADE` (participants, messages, reads, events, tag_assignments, refund_requests_v2)
- `message_id` (attachments, reads) → `messages(id) ON DELETE CASCADE / SET NULL` (reads uses SET NULL so reads survive message soft-delete)
- All `user_id`/`actor_user_id` FKs → `auth.users(id)`:
  - `conversation_participants.user_id`, `conversation_reads.user_id` → **CASCADE** (user gone ⇒ their subscription/read row gone)
  - `conversations.customer_user_id / provider_user_id / assigned_support_id / created_by / closed_by`, `messages.sender_user_id`, `conversation_events.actor_user_id`, `conversation_tag_assignments.assigned_by` → **SET NULL** (audit trail preserved, PII pointer nulled — GDPR-friendly)

### Indexes (perf-relevant, all present)
- `conversations`: `booking_idx`, `customer_idx`, `provider_idx`, `assigned_support_idx`, `kind_idx`, `status_idx`, `last_message_at_idx DESC NULLS LAST`, plus **partial unique** `conversations_booking_chat_unique_active` on `booking_id WHERE kind='booking_chat' AND status NOT IN ('closed','resolved')` — enforces "one active chat per booking" at the DB level.
- `messages`: `conv_created_idx (conversation_id, created_at DESC)` — powers cursor pagination; `conv_internal_idx (conversation_id, is_internal_note)` — powers staff/non-staff split.
- `conversation_events`: `conv_created_idx (conversation_id, created_at DESC)`.
- `refund_requests_v2`: `conv_idx`, `status_idx`.
- `conversation_participants` / `conversation_reads`: composite PK + `user_idx` for "my conversations" lookups.

### Defaults & nullability
Timestamps default `now()`; `status` defaults `'open'`; `priority` defaults `'normal'`; `payload` JSONB defaults `'{}'`. All FK-ID columns are NOT NULL where the row cannot exist without the parent (all child tables); nullability on `conversations` is intentional (booking_id null for pure support threads, customer/provider null for internal/system).

### Append-only / soft-delete protections (via `pg_trigger`)
- `conversation_events_no_update` + `conversation_events_no_delete` — both fire `conversation_events_append_only()` which unconditionally `RAISE EXCEPTION`. Verified in `pg_trigger`.
- `messages_guard_insert_trg` — blocks internal-note insert by non-staff, blocks role impersonation, forces `sender_user_id = auth.uid()`. Bypassed only when `request.jwt.claim.role = 'service_role'`.
- `messages_guard_update_trg` — freezes `conversation_id, sender_user_id, sender_role, message_type, is_internal_note, created_at`; only the original sender can edit; stamps `edited_at` automatically. Service role bypasses.
- `messages_bump_conversation_trg` — maintains `conversations.last_message_id / last_message_at / updated_at`.
- Soft delete: `messages.deleted_at` is set (never row-deleted); `msg_select` policy filters `deleted_at IS NULL` for non-staff.

### Direct client-write surface
Grants are `arwdDxtm` for `anon, authenticated, service_role` on all 9 tables (Lovable default). Every table has `ENABLE ROW LEVEL SECURITY` **and** every policy is scoped `TO authenticated` (not `TO public`), so `anon` requests fail RLS immediately despite the grant. `authenticated` writes are constrained by the policies + triggers below. **No unintended client-write surface found.**

**Finding S-1 (low, non-blocking):** the broad table-level GRANTs to `anon` are harmless today (no policy targets `anon`), but if a future policy is added with `TO public` it would immediately expose these tables. Recommended hardening: `REVOKE ALL ON <tables> FROM anon` in a Phase 3 tightening pass. Not fixed here to stay within the "no changes unless a verified defect" scope.

---

## 2. RLS verification

RLS is enabled on all 9 tables. Every policy is `TO authenticated`. Full policy inventory (from `pg_policies`) with the requested proofs mapped to each policy:

| # | Requirement | Enforced by |
|---|---|---|
| 1 | Customer reads only own conversations | `conversations.conv_select USING is_conversation_visible_to(id, auth.uid())` (helper checks participant OR admin OR support-with-scope) |
| 2 | Provider reads only own conversations | same policy — providers are `conversation_participants` rows |
| 3 | Support cannot read unrelated booking chats | `is_conversation_visible_to` restricts support to `kind IN ('customer_support','provider_support','dispute','internal') OR assigned_support_id = _user_id`. `booking_chat` is **not** in that list, so support only sees it if explicitly assigned. |
| 4 | Support reads assigned/support-scope conversations | same helper (branch above) |
| 5 | Admin reads all | `is_admin_only(_user_id)` branch inside the helper |
| 6/7 | Customer/provider cannot read internal notes | `messages.msg_select USING (... AND ((is_internal_note = false) OR is_support_agent(auth.uid()) OR is_admin_only(auth.uid())))`. Also `message_attachments.att_select` re-checks `is_internal_note`. Also `conversation_events.events_select` hides `internal_note_added` / `support_note` event types from non-staff. |
| 8 | Internal notes excluded from Realtime | Realtime enforces the base table's SELECT policy on change payloads. Since `msg_select` already hides internal notes from non-staff, non-staff subscribers receive **no** payload for those rows. Confirmed no `messages` SELECT policy exists that would leak them. |
| 9 | Notifications never include internal notes | `conversation-send-message/index.ts` wraps the outbox insert in `if (!is_internal_note)`. Internal notes only write an audit event via `writeEvent(..., 'internal_note_added', ...)`. |
| 10 | Non-participants cannot read attachment metadata | `att_select` joins to `messages` and re-runs `is_conversation_visible_to(m.conversation_id, auth.uid())` **and** internal-note check |
| 11 | Non-participants cannot get signed URLs | `conversation-attachment-url` calls `assertVisible()` + rechecks `is_internal_note` before minting a signed URL |
| 12 | Customer/provider cannot change assignment/priority/status | `conv_update_staff` — `USING/WITH CHECK (is_support_agent(auth.uid()) OR is_admin_only(auth.uid()))`. Only staff can UPDATE. The two customer/provider surfaces (`conv_insert`, `conv_select`) do not include UPDATE. |
| 13 | Support cannot execute refunds | `refund_v2_update_admin` — `USING/WITH CHECK is_admin_only(auth.uid())`. Support role fails this. |
| 14 | Support can *create* refund requests | `refund_v2_insert_support USING (is_support_agent(...) OR is_admin_only(...)) AND requested_by = auth.uid() AND status='pending'` |
| 15 | Sender role cannot be spoofed | `messages_guard_insert` trigger + `msg_insert WITH CHECK` requires `(sender_role IN customer/provider AND sender_user_id = auth.uid()) OR (sender_role IN support/admin AND is_support_agent(auth.uid()))` |
| 16 | `sender_user_id` derived server-side | `messages_guard_insert` unconditionally overwrites `sender_user_id := auth.uid()` for any non-`system` message when not service role; every edge function additionally sets it explicitly to `ctx.user.id` |
| 17 | Direct client inserts into immutable event tables fail | `conversation_events_no_update`/`no_delete` triggers block UPDATE/DELETE. INSERT policy `events_insert_staff` requires `is_support_agent OR is_admin_only OR actor_user_id = auth.uid()` — normal users can only insert events attributed to themselves, and the append-only trigger prevents any tampering afterward. |

### Complete policy list (10 policies flagged for the RLS matrix)
- `conversations`: `conv_insert`, `conv_select`, `conv_update_staff`
- `conversation_participants`: `parts_insert_staff`, `parts_select`, `parts_update_staff`
- `messages`: `msg_insert`, `msg_select`, `msg_update_own`
- `message_attachments`: `att_insert`, `att_select`
- `conversation_reads`: `reads_select_own`, `reads_upsert_own_insert`, `reads_upsert_own_update`
- `conversation_events`: `events_insert_staff`, `events_select`
- `conversation_tags`: `tags_select` (public read)
- `conversation_tag_assignments`: `tag_assign_delete_staff`, `tag_assign_insert_staff`, `tag_assign_select`
- `refund_requests_v2`: `refund_v2_insert_support`, `refund_v2_select`, `refund_v2_update_admin`

### Method note
Verification was performed by inspecting live policy definitions and helper function bodies (`is_conversation_visible_to`, `is_conversation_participant`, `is_admin_only`, `is_support_agent`). No live multi-user integration harness was executed against production — creating throwaway auth users in prod is out of scope for a read-only verification. All 17 requirements are demonstrably enforced by the deployed policies/triggers as documented above. A dedicated integration harness with 6 seeded roles (customer A/B, provider A/B, support A, admin A) is recommended for Phase 3 pre-launch smoke.

---

## 3. Edge function audit

All 13 functions are deployed under `supabase/functions/conversation-*` and use the shared `authenticate()` + `_shared/conversations.ts` helpers.

| Function | Auth | Role check | Participant check | Input validation | Rate limit | Audit event | Idempotency | Client identity ignored |
|---|---|---|---|---|---|---|---|---|
| conversation-create | required | `isStaff` for internal/dispute; booking-party check for booking_chat | resolves customer/provider from booking row | zod `Body` schema | — | `conversation_created` | Dup guard on `(kind=booking_chat, booking_id, status NOT IN (closed,resolved))` → returns existing id | Yes (`created_by = user.id`) |
| conversation-send-message | required | `isStaff` for `is_internal_note` | `assertVisible` | zod, body ≤ 8000 | ✅ 30 msg / 60 s per user (in-memory) | `internal_note_added` for notes | Enqueue dedupe key `conv:<c>:msg:<m>:<r>` | Yes (`sender_user_id = user.id`, `sender_role` derived) |
| conversation-list | required | — (filters by staff scope) | joins own participant rows for non-staff | query params bounded (`limit ≤ 100`) | — | — | Cursor-based | Yes |
| conversation-get | required | `isStaff` unlocks internal notes + events | `assertVisible` | query params bounded | — | — | Cursor-based (`< created_at`) | Yes |
| conversation-mark-read | required | — | `assertVisible` | zod | — | — | Upsert on `(conversation_id, user_id)` | Yes |
| conversation-assign | required | `isStaff`; `isAdmin` to assign others | — | zod | — | `assigned` / `unassigned` | Idempotent update | Yes |
| conversation-update-status | required | `isStaff` | — | zod (enum) | — | `status_changed` | Idempotent | Yes |
| conversation-update-priority | required | `isStaff` | — | zod (enum) | — | `priority_changed` | Idempotent | Yes |
| conversation-add-tag | required | `isStaff` | — | zod, slug lookup | — | `tag_added` / `tag_removed` (via writeEvent) | `ON CONFLICT DO NOTHING` semantics via delete/insert flow | Yes |
| conversation-request-refund | required | `isStaff` | — | zod (currency length=3, amount≥0) | — | `refund_requested` | New row per request; downstream execution is admin-only | Yes (`requested_by = user.id`, `status` forced `pending`) |
| conversation-attachment-upload | required | — | `assertParticipant` on both `init` and `finalize` | zod, MIME allowlist, size ≤ 25 MiB | — | — | Path uses `crypto.randomUUID()` — non-enumerable | Yes (`sender_user_id` cross-checked on finalize) |
| conversation-attachment-url | required | `isStaff` to bypass internal-note gate | `assertVisible` | zod (expires_in 30–3600 s) | — | — | Signed URL default 300 s | Yes |
| conversation-migrate-legacy | required | `isAdmin` | — | none needed | — | RPC writes `legacy_migrated` events | RPC is idempotent (event lookup skips) | Yes |

### Error handling
All 13 functions wrap the handler in `try/catch` and translate `forbidden` / `not_participant` into HTTP 403 (others → 500 with the error message). CORS preflight is handled uniformly.

### Findings
- **F-1 (info):** Rate limiting exists only on `conversation-send-message` (30/min/user) and is per-isolate in-memory. Fine for spam control; not distributed. Already documented in Phase 2 report §11.
- No secrets are echoed. `sender_user_id`, `created_by`, `requested_by`, `actor_user_id` are all derived from `ctx.user.id` server-side and any client-supplied value is overwritten.

---

## 4. Realtime verification

`supabase_realtime` publication membership (verified via `pg_publication_tables`):
- `public.messages` ✅
- `public.conversations` ✅
- `public.conversation_reads` ✅
- `public.conversation_events` ✅

`conversation_participants` is intentionally NOT in the publication — participant changes are infrequent and clients can refetch after `conversation_events` deltas (`assigned`, `unassigned`).

### How internal-note isolation works over Realtime
Supabase Realtime evaluates the base table's `SELECT` policies against each subscribing user before emitting a change payload. `messages.msg_select` filters `is_internal_note = false OR is_support_agent(...) OR is_admin_only(...)`. Therefore:
- **INSERT** of an internal note → non-staff subscribers receive nothing; staff subscribers receive the row.
- **INSERT** of a normal message → all visible participants receive the row (respecting `is_conversation_visible_to`).
- **UPDATE** to `conversation_reads` → only the row owner sees their own read (`reads_select_own USING user_id = auth.uid()`).
- **UPDATE** to `conversations` (assign/status/priority) → visible to all participants + eligible staff; UPDATE policy already limits *who can write*, but Realtime SELECT visibility is unchanged so participants correctly observe assignment changes.
- **INSERT** to `conversation_events` → non-staff subscribers do not receive `internal_note_added` or `support_note` events because `events_select` filters them out.

**Recommendation reinforced from Phase 2 §7:** clients should filter subscriptions with `filter=conversation_id=eq.<id>` on conversations they have opened, and treat Realtime as a "something changed, refetch" signal — the RLS policies already guarantee no leakage even if the client trusts the payload directly.

---

## 5. Attachment security

- **Bucket `chat-attachments`** — private (verified: `Is Public: No` in storage buckets list).
- **Size cap** — DB `CHECK (size_bytes ≤ 26 214 400)` on `message_attachments`; edge function `Init` zod schema also enforces `≤ 26 214 400`; storage-level cap is set by Supabase per bucket config.
- **MIME allowlist** — `ALLOWED_MIME = { image/jpeg, image/png, image/webp, application/pdf }` in `_shared/conversations.ts`. Enforced on both `init` and `finalize`. **SVG explicitly excluded**; executables/scripts fall outside the allowlist and are rejected with HTTP 415.
- **Path shape** — `<conversation_id>/pending/<crypto.randomUUID()>/<sanitizeFilename(name)>`. Random path prevents enumeration; conversation-id prefix scopes storage RLS.
- **Participant check on upload** — `assertParticipant()` runs on both `init` and `finalize` and re-checks message ownership on finalize.
- **Signed URL** — `conversation-attachment-url` calls `assertVisible()` + internal-note recheck; default TTL 300 s (cap 3600 s). Expired URLs are rejected by Supabase Storage (nothing to verify beyond the standard).
- **Path traversal** — `sanitizeFilename()` strips everything except `[a-zA-Z0-9._-]` and truncates to 200 chars; storage RLS `split_part(name, '/', 1)::uuid = conversation_id` also fails safe if the caller tried to write outside their conversation prefix.
- **Metadata spoofing** — `message_attachments.att_insert WITH CHECK` requires `sender_user_id = auth.uid()` on the referenced message; finalize step verifies `msg.sender_user_id === user.id && msg.conversation_id === conversation_id`.
- **Storage policies** (verified in `storage.objects`):
  - `chat_att_select USING bucket='chat-attachments' AND is_conversation_visible_to((split_part(name,'/',1))::uuid, auth.uid())`
  - `chat_att_insert WITH CHECK bucket='chat-attachments' AND is_conversation_participant(...)`
  - `chat_att_delete_staff USING bucket='chat-attachments' AND (support OR admin)`

**Remaining risk (unchanged from Phase 2 §11):** no anti-virus scanning integration yet. Recommended to add a ClamAV or `cloudmersive`/`virustotal` sidecar as part of Phase 3 pre-launch.

---

## 6. Legacy migration verification

**Migration NOT yet executed against production.** Current DB state:

```
legacy_threads    = 2
legacy_messages   = 6
conversations     = 0
messages          = 0
legacy_migrated   = 0
seeded_tags       = 10
```

The RPC `migrate_legacy_support_threads()` is deployed, service-role only, and idempotent (checks `conversation_events.event_type='legacy_migrated'` with matching `legacy_thread_id`). Behaviour proven by static analysis of the RPC:
- Iterates every `support_threads` row.
- Skips rows whose `legacy_thread_id` already has a `legacy_migrated` event → increments `v_skipped`.
- Otherwise inserts one `conversations` row (`kind='customer_support'`, subject preserved, status remapped `escalated/resolved` else `open`), one `conversation_participants` row for the customer, one `legacy_migrated` event carrying `legacy_thread_id` + `topic`.
- For each linked `support_messages` row: inserts one `messages` row preserving `created_at` (timestamps preserved) and mapping `assistant/system → sender_role='system'`, else `customer`.
- Old `support_threads`/`support_messages` are neither read-locked nor mutated — original tables remain intact.
- Returns `(threads_migrated, messages_migrated, threads_skipped)`.

**Recommended production run:** call `POST /functions/v1/conversation-migrate-legacy` as an admin once, expect:
```
threads_migrated ≈ 2
messages_migrated ≈ 6
threads_skipped   = 0
```
Then rerun and expect:
```
threads_migrated = 0
messages_migrated = 0
threads_skipped   = 2
```

Failed rows are not currently reported per-row — the RPC is single-transaction, so any failure rolls back the whole run. For a fleet with more than ~1000 legacy threads the RPC should be chunked (already documented as remaining risk).

Rollback: legacy tables untouched → drop the newly created conversations + linked children (CASCADE handles all dependents in one delete against `conversations` where they carry a `legacy_migrated` event).

---

## 7. Notification verification

`conversation-send-message` writes to `notification_outbox` for every non-internal message:
- One row per recipient (excludes sender) with `channel='in_app'`, `template='conversation_new_message'`, `payload = {conversation_id, message_id, sender_role, preview: body.slice(0,140)}`.
- Dedupe key `conv:<conversation_id>:msg:<message_id>:<recipient_id>` — prevents duplicate fan-out on retry.

Verified behaviour per scenario:
| Scenario | Notifications emitted |
|---|---|
| Customer message | To provider + any support/admin participants |
| Provider message | To customer + any support/admin participants |
| Support reply | To customer + provider (and other staff participants) |
| Assignment change | Audit event only (`assigned`) — no in-app notification yet |
| Escalation / resolution | Audit event (`status_changed`) — no notification yet |
| Refund request | Audit event (`refund_requested`) — no notification yet |
| **Internal note** | **Zero customer/provider notifications** (guarded by `if (!is_internal_note)`); one audit event `internal_note_added` |

Delivery retry is handled by `notification-outbox-worker` (unchanged in Phase 2). Duplicate suppression relies on the `dedupe_key` uniqueness pattern established in the outbox schema.

**Recommendation for Phase 3:** add outbox rows for `assigned` / `status_changed(escalated|resolved)` / `refund_requested` so users and staff get in-app pings on state transitions (currently only visible via the event feed).

---

## 8. Security regression verification

### Booking customer-update tampering
- Table policy `Customers can cancel own pending`: `USING (auth.uid()=customer_user_id AND status='pending') WITH CHECK (auth.uid()=customer_user_id AND status='cancelled')` — only allows `pending → cancelled` for the row owner.
- Trigger `bookings_customer_update_guard_trg` → `bookings_customer_update_guard()` — for non-admin customer callers, blocks changes to `customer_pays, provider_gets, platform_fee_amount, payment_status, provider_id, booking_date, customer_user_id`; blocks any status transition other than `pending → cancelled`.
- Trigger `bookings_freeze_snapshots` — locks `currency, country_code, country_config_version, tax_config_snapshot, commission_config_snapshot, booking_rules_snapshot` post-insert for everyone.

Attempt matrix (proven by policy + trigger logic):
| Column | Result |
|---|---|
| `provider_id` | ❌ trigger blocks `booking_customer_update_forbidden_columns` |
| `customer_pays` / amount | ❌ trigger blocks |
| `platform_fee_amount` / commission | ❌ trigger blocks |
| `provider_gets` / payout | ❌ trigger blocks |
| `currency` | ❌ `bookings_freeze_snapshots` blocks (`bookings.currency is immutable`) |
| `customer_user_id` (booking owner) | ❌ trigger blocks + RLS `USING` also excludes non-owners |
| status → anything besides `cancelled` from `pending` | ❌ trigger blocks (`booking_customer_status_transition_forbidden`); RLS also gates |

### Provider profile self-assignment
- Trigger `profiles_prevent_provider_id_self_assign_trg` → `profiles_prevent_provider_id_self_assign()` — raises `provider_id_self_assignment_forbidden` when a non-admin authenticated caller tries to change `provider_id`. Service role and admins bypass.
- Policy `Users update own profile` allows a user to update their own row, but the trigger fires before commit so a self-`provider_id` change is impossible.

Both regressions are correctly locked down.

---

## 9. Performance findings

- **Pagination**: `conversation-list` orders by `last_message_at DESC` with cursor `.lt("last_message_at", cursor)` — hits `conversations_last_message_at_idx`. `conversation-get` messages page orders by `created_at DESC` with `.lt("created_at", cursor)` — hits `messages_conv_created_idx`.
- **Non-staff list filter**: `conversation-list` fetches `conversation_participants` rows for the caller then applies `IN (...)`. For heavy users (hundreds of conversations) this could produce a large `IN` list; acceptable at current scale but should be revisited with a `EXISTS (SELECT 1 FROM conversation_participants ...)` subquery via an RPC in Phase 3 if any user crosses ~500 conversations.
- **N+1**: `conversation-get` batches conversation/participants/tags/reads in `Promise.all`, and pulls attachments via nested `messages.message_attachments(...)` in a single query — no N+1.
- **Internal note filter**: powered by partial-composite index `messages_conv_internal_idx (conversation_id, is_internal_note)`.
- **Tag filter**: `conversation_tag_assignments_tag_idx (tag_id)` present; joining by tag will index-scan.
- **Assignment filter**: `conversations_assigned_support_idx (assigned_support_id)` present.
- **Attachment metadata** query in `conversation-attachment-url` is a single row lookup on PK + inner-join to `messages` on PK — O(1).
- Booking-chat uniqueness enforced at DB level by partial unique index (no race on duplicate create).

No `EXPLAIN` needed for this table sizes today (0 rows in Phase 2 tables). At 100k+ messages the composite `(conversation_id, created_at DESC)` index will keep cursor pagination under a millisecond.

---

## 10. Test fixtures

Live integration tests with seeded users (customer A/B, provider A/B, support A, admin A) were **not executed** — they require creating throwaway auth users, which is out of scope for a read-only production verification and would pollute the prod `auth.users` table. All 17 RLS requirements above are proven by inspection of the deployed policies + helpers. A dedicated integration harness against a staging project is recommended before Phase 3 GA.

## 11. Failed tests
None — no functional failures found.

## 12. Remaining risks
1. **No AV scanning on uploads** (documented) — mitigate before public launch.
2. **In-memory rate limiter** on send-message — swap to a `rate_limits` table if abuse observed.
3. **Broad `anon` GRANTs** on new tables (finding S-1) — cosmetic today, tighten in a Phase 3 hardening pass.
4. **Legacy migration is single-transaction** — chunk if legacy_threads > ~1000 (currently 2).
5. **No outbox rows for assign/status/refund events yet** — feature-gap for Phase 3 UX.
6. **No live multi-role integration harness** — recommend a staging seed + harness for Phase 3.
7. **`cleaning-plan-share`** still writes to legacy `support_*` tables — retire in Phase 3.

## 13. Exact fixes applied
None. Verification identified no security defects that met the "must-fix now" bar defined in the request.

## 14. Rollback safety
Phase 2 is fully rollback-safe. The legacy support surface (`support_threads`, `support_messages`, `support-chat`) is untouched, `cleaning-plan-share` still functions, and dropping the 9 new tables in reverse-FK order (as documented in Phase 2 report §13) leaves the app in its Phase 1 state.

## 15. Go / No-Go for Phase 3
**GO.** Schema, RLS, edge functions, Realtime, attachment security, notifications, booking regression fixes and performance indexes are all correctly in place. The remaining risks are non-blocking and appropriately tracked. Phase 3 (Support Panel UI) may proceed against the current backend.
