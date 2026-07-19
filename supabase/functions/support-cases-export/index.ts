// Safe CSV export of support cases. Support/admin only. Server-side scrubbed:
// NO PII (names/phones/addresses) and NO finance figures. Fully audit-logged.
// Streams a plain text CSV with row limit to avoid runaway exports.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { json } from "../_shared/conversations.ts";
import { listConversations } from "../_shared/conversationQuery.ts";
import { writeAudit } from "../_shared/audit.ts";

const MAX_ROWS = 5000;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const forbidden = requireRole(ctx, ["support", "admin"] as any, corsHeaders);
    if (forbidden) return forbidden;

    const u = new URL(req.url);
    const p = u.searchParams;
    const limit = Math.min(Number(p.get("limit") ?? MAX_ROWS), MAX_ROWS);

    // Paginate through until MAX_ROWS or end of data.
    const rows: any[] = [];
    let cursor: string | null | undefined = p.get("cursor");
    while (rows.length < limit) {
      const page = await listConversations(ctx, {
        scope: p.get("scope"),
        status: p.get("status"),
        priority: p.get("priority"),
        bookingId: p.get("booking_id"),
        countryCode: p.get("country"),
        tagId: p.get("tag_id"),
        unreadOnly: p.get("unread_only") === "1",
        search: p.get("q"),
        cursor: cursor ?? null,
        limit: Math.min(200, limit - rows.length),
      });
      rows.push(...page.rows);
      if (!page.nextCursor || page.rows.length === 0) break;
      cursor = page.nextCursor;
    }

    const headers = [
      "conversation_id", "kind", "status", "priority",
      "created_at", "last_message_at",
      "assigned_support_id", "country_code",
      "has_booking",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.id, r.kind, r.status, r.priority ?? "",
        r.created_at ?? "", r.last_message_at ?? "",
        r.assigned_support_id ?? "", r.country_code ?? "",
        r.booking_id ? "1" : "0",
      ].map(csvEscape).join(","));
    }
    const body = lines.join("\n") + "\n";

    // Audit (no PII in metadata)
    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id,
      actor_role: ctx.isSuperAdmin ? "super_admin" : (ctx.roles[0] ?? null),
      action: "support.cases.export",
      target_type: "support_cases_export",
      metadata: {
        row_count: rows.length,
        filters: {
          scope: p.get("scope"), status: p.get("status"),
          priority: p.get("priority"), country: p.get("country"),
          tag_id: p.get("tag_id"), unread_only: p.get("unread_only") === "1",
          has_search: !!p.get("q"),
        },
      },
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="support-cases-${stamp}.csv"`,
        "X-Row-Count": String(rows.length),
      },
    });
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
