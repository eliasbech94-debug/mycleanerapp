// Shared conversation-list query builder. Single source of truth for
// visibility/filter/pagination logic used by both `conversation-list`
// (participant view) and `support-list-conversations` (staff view).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AuthContext } from "./auth.ts";
import { isStaff } from "./conversations.ts";

export interface ListFilters {
  scope?: string | null;         // mine | unassigned | escalated | all
  status?: string | null;
  priority?: string | null;
  bookingId?: string | null;
  customerUserId?: string | null;
  providerUserId?: string | null;
  countryCode?: string | null;
  tagId?: string | null;
  unreadOnly?: boolean;
  search?: string | null;
  cursor?: string | null;        // ISO timestamp (last_message_at)
  limit?: number;
}

export interface ListRow {
  id: string;
  kind: string;
  status: string;
  priority: string | null;
  subject: string | null;
  last_message_at: string | null;
  booking_id: string | null;
  customer_user_id: string | null;
  provider_user_id: string | null;
  assigned_support_id: string | null;
  updated_at: string;
}

const SELECT_COLS =
  "id, kind, status, priority, subject, last_message_at, booking_id, " +
  "customer_user_id, provider_user_id, assigned_support_id, updated_at, country_code";

/**
 * Build and execute a conversation list query with visibility + filters
 * applied server-side. Returns rows plus a nextCursor for pagination.
 */
export async function listConversations(
  ctx: AuthContext,
  filters: ListFilters,
): Promise<{ rows: ListRow[]; nextCursor: string | null }> {
  const { admin, user } = ctx;
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const staff = isStaff(ctx);

  let q = admin
    .from("conversations")
    .select(SELECT_COLS)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);

  if (filters.cursor) q = q.lt("last_message_at", filters.cursor);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.bookingId) q = q.eq("booking_id", filters.bookingId);
  if (filters.customerUserId) q = q.eq("customer_user_id", filters.customerUserId);
  if (filters.providerUserId) q = q.eq("provider_user_id", filters.providerUserId);
  if (filters.countryCode) q = q.eq("country_code", filters.countryCode.toUpperCase());
  if (filters.search) {
    const s = filters.search.replace(/[%_]/g, "\\$&").slice(0, 120);
    q = q.ilike("subject", `%${s}%`);
  }

  if (!staff) {
    // Non-staff: restrict to conversations where caller is a participant.
    const { data: parts, error: pe } = await admin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id)
      .is("left_at", null);
    if (pe) throw new Error("participant_lookup_failed: " + pe.message);
    const ids = (parts ?? []).map((p) => p.conversation_id as string);
    if (!ids.length) return { rows: [], nextCursor: null };
    q = q.in("id", ids);
  } else {
    // Staff scopes.
    switch (filters.scope) {
      case "mine":
        q = q.eq("assigned_support_id", user.id); break;
      case "unassigned":
        q = q.is("assigned_support_id", null); break;
      case "escalated":
        q = q.eq("status", "escalated"); break;
      case "all":
      case null:
      case undefined:
        break;
      default:
        // Explicit statuses can be passed as scope for convenience.
        if (["open","pending_customer","pending_provider","pending_support","resolved","closed"].includes(filters.scope)) {
          q = q.eq("status", filters.scope);
        }
    }
  }

  // Tag filter (staff-only path).
  if (staff && filters.tagId) {
    const { data: tagged, error: te } = await admin
      .from("conversation_tag_assignments")
      .select("conversation_id")
      .eq("tag_id", filters.tagId);
    if (te) throw new Error("tag_lookup_failed: " + te.message);
    const ids = (tagged ?? []).map((r) => r.conversation_id as string);
    if (!ids.length) return { rows: [], nextCursor: null };
    q = q.in("id", ids);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as ListRow[];

  // Unread-only filter (applied post-fetch because it needs a per-row join).
  if (filters.unreadOnly) {
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: reads } = await admin
        .from("conversation_reads")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id)
        .in("conversation_id", ids);
      const readMap = new Map<string, string | null>();
      (reads ?? []).forEach((r) => readMap.set(r.conversation_id as string, r.last_read_at as string | null));
      rows = rows.filter((r) => {
        if (!r.last_message_at) return false;
        const last = readMap.get(r.id);
        return !last || new Date(last).getTime() < new Date(r.last_message_at).getTime();
      });
    }
  }

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const overflow = rows.pop()!;
    nextCursor = overflow.last_message_at;
  }
  return { rows, nextCursor };
}
