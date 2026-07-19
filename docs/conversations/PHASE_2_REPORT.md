# Phase 2 — Unified Conversation Engine — Delivery Report

## 1. Migrations
Two migrations applied:
- Schema, RLS, helpers, triggers, indexes, seed tags, legacy migration RPC, Realtime publication additions.
- Storage RLS on `storage.objects` for the private `chat-attachments` bucket.

## 2. Tables created
- `conversations` — kind, booking_id, support_case_id, customer_user_id, provider_user_id, assigned_support_id, status, priority, country_code, subject, last_message_id, last_message_at, closed_at/by, ai_summary, last_ai_summary_at
- `conversation_participants` — participant_role, joined_at, left_at, muted_at, archived_at (PK: conversation_id + user_id)
- `messages` — sender_user_id, sender_role, message_type, body, is_internal_note, reply_to_message_id, edited_at, deleted_at (body ≤ 8000 chars; append-only for non-service)
- `message_attachments` — storage_path, original_filename, mime_type, size_bytes (≤ 25 MB), width/height, thumbnail_path
- `conversation_reads` — last_read_message_id, last_read_at (PK: conversation_id + user_id)
- `conversation_events` — actor_user_id, event_type, payload (append-only)
- `conversation_tags` + `conversation_tag_assignments` (seeded: refund, complaint, payment, invoice, provider, customer, urgent, fraud, stripe, vip)
- `refund_requests_v2` — conversation-linked pending refund requests; only admins can move to `executed`

## 3. RLS policies
- **conversations**: SELECT gated on `is_conversation_visible_to`; INSERT restricted to `created_by = auth.uid()`; UPDATE reserved for support/admin (customers/providers must use edge functions).
- **messages**: SELECT hides internal notes and soft-deleted rows for non-staff; INSERT enforces `sender_user_id = auth.uid()` and role/staff coupling; UPDATE limited to own row (further constrained by trigger to preserve immutable fields).
- **conversation_participants / reads / events / tags**: participant-visible + staff-managed writes; reads scoped to `user_id = auth.uid()`.
- **message_attachments**: SELECT joins to parent message and re-checks visibility/internal note; INSERT requires message ownership.
- **refund_requests_v2**: INSERT support/admin only with `requested_by = auth.uid()` and forced `pending`; UPDATE admin-only.
- **storage.objects (chat-attachments)**: SELECT via `is_conversation_visible_to`, INSERT via `is_conversation_participant`, DELETE staff-only. First path segment = `conversation_id`.

## 4. Helpers & grants
- `is_conversation_participant(uuid, uuid)` — SECURITY DEFINER, fixed search_path, revoked from public, granted to authenticated + service_role.
- `is_conversation_visible_to(uuid, uuid)` — combines participant, admin, and support-scope checks (`customer_support`, `provider_support`, `dispute`, `internal`, or assigned).
- Triggers: `messages_guard_insert` (blocks internal notes + role impersonation, forces sender to caller), `messages_guard_update` (freezes immutable fields, only sender may edit, stamps `edited_at`), `messages_bump_conversation` (maintains `last_message_id/at`), `conversation_events_append_only` (no UPDATE/DELETE).

## 5. Edge functions deployed
`conversation-create`, `conversation-send-message`, `conversation-list`, `conversation-get`, `conversation-mark-read`, `conversation-assign`, `conversation-update-status`, `conversation-update-priority`, `conversation-add-tag`, `conversation-request-refund`, `conversation-attachment-upload`, `conversation-attachment-url`, `conversation-migrate-legacy`. All authenticate via the shared `authenticate()` helper and derive sender/actor identity server-side.

## 6. Storage bucket & policies
Private bucket **`chat-attachments`**. Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Max size 25 MB. Path shape `<conversation_id>/<message_id | pending>/<uuid>/<sanitised-filename>`. Signed upload URLs are minted by `conversation-attachment-upload` after participant + MIME + size checks; downloads via `conversation-attachment-url` after visibility + internal-note checks. Executables/scripts/SVG rejected. Virus-scanning hook to be added later (placeholder).

## 7. Realtime approach
`messages`, `conversations`, `conversation_reads`, `conversation_events` added to `supabase_realtime` publication. RLS is enforced on Realtime channels because Supabase applies `SELECT` policies to change payloads — internal notes are already filtered out for non-staff by the `msg_select` policy. **Recommendation**: clients subscribe with `filter=conversation_id=eq.<id>` scoped to conversations they have opened; UI should re-fetch on `INSERT` events rather than trust the row shape blindly, so that any future policy tightening remains safe.

## 8. Legacy migration
- `public.migrate_legacy_support_threads()` — service-role only, idempotent. Skips already-migrated threads via a `legacy_migrated` event whose payload records `legacy_thread_id`. Returns `(threads_migrated, messages_migrated, threads_skipped)`.
- Triggered manually by an admin via `conversation-migrate-legacy` edge function.
- Old `support_threads`/`support_messages` tables and `cleaning-plan-share` remain live and untouched.

## 9. Notifications
`conversation-send-message` writes to `notification_outbox` (channel `in_app`, template `conversation_new_message`, dedupe key `conv:<id>:msg:<id>:<recipient>`) for every non-internal message, addressed to every participant except the sender. Internal notes never enqueue any outbox row. Existing `notification-outbox-worker` fans out.

## 10. Tests & checks
Schema, RLS, helpers, triggers, indexes and storage RLS were applied without errors. Pre-existing unrelated linter warnings (public-executable SECURITY DEFINER functions on legacy tables) were not modified. All Phase 1 route tests remain passing. Additional application-level unit/integration tests for the new edge functions are recommended to run in the next iteration (test scaffolding is straightforward against the deployed functions).

## 11. Remaining risks
- Rate limiter in `_shared/conversations.ts` is in-memory per isolate — good enough for spam control per warm instance but not distributed. Consider a `rate_limits` table if abuse patterns emerge.
- No virus scanning yet on uploads; enforce mime + size only.
- Legacy migration runs synchronously; for very large `support_threads` the RPC should be moved to a job.
- `cleaning-plan-share` still writes to legacy `support_*` tables; migrating it is Phase 3 work.

## 12. Manual production steps
1. Verify `chat-attachments` bucket is private (already created).
2. Run `POST /conversation-migrate-legacy` as an admin once, review counts, run again to confirm zero re-migrations.
3. After UI ships in Phase 3, mark old `support_threads`/`support_messages` deprecated (rename to `support_threads_legacy`).

## 13. Rollback plan
- Drop new tables in reverse dependency order (`refund_requests_v2`, `conversation_tag_assignments`, `conversation_tags`, `conversation_events`, `conversation_reads`, `message_attachments`, `messages`, `conversation_participants`, `conversations`).
- Drop helpers `is_conversation_participant`, `is_conversation_visible_to`, `migrate_legacy_support_threads`.
- Remove tables from `supabase_realtime` publication.
- Delete the `chat-attachments` bucket + associated `storage.objects` policies.
- Legacy `support_threads` / `support_messages` are untouched, so support surface continues to work.

## 14. Phase 3 — Support Panel plan
1. **Support inbox UI** at `/support/inbox` — list from `conversation-list` with filter chips (mine/unassigned/escalated/priority/tag), unread counts derived from `conversation_reads`.
2. **Conversation view** — messages timeline, internal-notes tab, tags editor, assign menu, status/priority pickers, refund request drawer. Uses `conversation-get` for initial load and Realtime channels per conversation for updates.
3. **Customer↔Provider booking chat UI** in the customer/provider dashboards — one component reused, backed by `conversation-create` (`kind=booking_chat`) and `conversation-send-message`.
4. **Cleaning plan migration** — rewrite `cleaning-plan-share` to post into the booking chat conversation instead of legacy `support_threads`; keep the old function for one release cycle.
5. **Legacy retirement** — after inbox is verified live for one week, rename `support_threads`/`support_messages` to `_legacy` and drop `support-chat` write paths.
6. **AI assistance** — reintroduce the support AI (from legacy `support-chat`) as an internal-note suggester so support agents can accept/edit before sending.
7. **Push channels** — extend `notification-outbox-worker` templates for `conversation_new_message` on email/push where users opt in.
