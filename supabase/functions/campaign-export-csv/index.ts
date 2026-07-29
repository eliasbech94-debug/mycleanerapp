// Admin-only CSV export of campaign applications.
//
// - Requires admin or support role.
// - Streams CSV with formula-injection protection (see `csvCell`).
// - Excludes soft-deleted rows by default (opt-in via `include_deleted`).
// - Writes an audit trail entry with the exported row count.

import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { corsHeaders, csvCell, json } from "../_shared/campaign.ts";

const HEADERS = [
  "id",
  "campaign_id",
  "country_code",
  "status",
  "assigned_number",
  "waiting_list_position",
  "full_name",
  "company_name",
  "email",
  "phone",
  "city",
  "languages",
  "categories",
  "experience_years",
  "hourly_rate_minor",
  "referral_code",
  "invite_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "email_verified_at",
  "reviewed_at",
  "rejection_reason",
  "created_at",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { error: "method_not_allowed" });
  }

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin", "support"], corsHeaders);
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  let campaignSlug: string | null = null;
  let campaignId: string | null = null;
  let status: string | null = null;
  let country: string | null = null;
  let includeDeleted = false;

  if (req.method === "POST") {
    try {
      const b = await req.json();
      campaignSlug = b.campaign_slug ?? null;
      campaignId = b.campaign_id ?? null;
      status = b.status ?? null;
      country = b.country_code ?? null;
      includeDeleted = !!b.include_deleted;
    } catch {
      return json(400, { error: "invalid_json" });
    }
  } else {
    campaignSlug = url.searchParams.get("campaign_slug");
    campaignId = url.searchParams.get("campaign_id");
    status = url.searchParams.get("status");
    country = url.searchParams.get("country_code");
    includeDeleted = url.searchParams.get("include_deleted") === "true";
  }

  if (!campaignId && campaignSlug) {
    const { data } = await ctx.admin
      .from("campaigns")
      .select("id")
      .eq("slug", campaignSlug.toLowerCase())
      .maybeSingle();
    if (!data) return json(404, { error: "campaign_not_found" });
    campaignId = data.id;
  }
  if (!campaignId) return json(400, { error: "missing_campaign" });

  let q = ctx.admin
    .from("campaign_applications")
    .select(HEADERS.join(","))
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
    .limit(50_000);
  if (!includeDeleted) q = q.is("deleted_at", null);
  if (status) q = q.eq("status", status);
  if (country) q = q.eq("country_code", country.toUpperCase());

  const { data: rows, error } = await q;
  if (error) return json(500, { error: "export_failed", detail: error.message });

  const lines = [HEADERS.join(",")];
  for (const row of rows ?? []) {
    // deno-lint-ignore no-explicit-any
    const r = row as Record<string, any>;
    lines.push(
      HEADERS.map((h) => {
        const v = r[h];
        if (Array.isArray(v)) return csvCell(v.join("|"));
        return csvCell(v);
      }).join(","),
    );
  }
  const body = lines.join("\n") + "\n";

  await writeAudit(ctx.admin, req, {
    actor_user_id: ctx.user.id,
    actor_role: ctx.roles[0] ?? "admin",
    action: "campaign.applications.exported_csv",
    target_type: "campaign",
    target_id: campaignId,
    metadata: {
      row_count: rows?.length ?? 0,
      filters: { status, country, include_deleted: includeDeleted },
    },
  });

  const filename = `campaign-applications-${campaignId}-${Date.now()}.csv`;
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
