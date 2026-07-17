// Returns a short-lived signed URL for either a platform-fee invoice or a
// provider settlement statement. Access is enforced server-side:
// - Providers can only download their own docs
// - Admins/employees can download any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind"); // 'invoice' | 'statement'
  const id = url.searchParams.get("id");
  if (!kind || !id) return json({ error: "kind and id required" }, 400);

  const isAdmin = ctx.isSuperAdmin || ctx.roles.includes("admin") || ctx.roles.includes("employee");
  const table = kind === "invoice" ? "platform_fee_invoices" : "provider_settlement_statements";

  const { data: row, error } = await ctx.admin.from(table)
    .select("id, provider_user_id, pdf_storage_path").eq("id", id).maybeSingle();
  if (error || !row) return json({ error: "not_found" }, 404);
  if (!isAdmin && row.provider_user_id !== ctx.user.id) return json({ error: "forbidden" }, 403);
  if (!row.pdf_storage_path) return json({ error: "pdf_missing" }, 404);

  const { data: signed, error: sErr } = await ctx.admin.storage
    .from("invoices").createSignedUrl(row.pdf_storage_path, 300);
  if (sErr || !signed) return json({ error: sErr?.message ?? "sign_failed" }, 500);

  return json({ url: signed.signedUrl, expires_in: 300 });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
