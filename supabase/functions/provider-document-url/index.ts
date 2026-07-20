// POST /provider-document-url — returns a short-lived signed download URL.
// Owner or admin only. Path must be <uid>/... under provider-documents.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  try {
    const body = await req.json().catch(() => ({}));
    const path = String(body?.path ?? "");
    const expiresIn = Math.min(Math.max(Number(body?.expires_in ?? 120), 30), 600);

    if (!path || path.includes("..") || !path.match(/^[0-9a-f-]{36}\//i)) {
      return json({ error: "invalid_path" }, 400);
    }
    const ownerId = path.split("/")[0];
    const isAdmin = ctx.roles.includes("admin") || ctx.isSuperAdmin;
    if (ownerId !== ctx.user.id && !isAdmin) {
      return json({ error: "forbidden" }, 403);
    }

    const { data, error } = await ctx.admin.storage
      .from("provider-documents")
      .createSignedUrl(path, expiresIn);
    if (error) return json({ error: "signed_url_failed", message: error.message }, 500);

    return json({ ok: true, signed_url: data.signedUrl, expires_in: expiresIn });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
