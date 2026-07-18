// Providers (and admins) upload evidence files or written notes for a dispute.
// Files land in the private `dispute-evidence` bucket under <user_id>/<dispute_id>/<filename>.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const isAdmin = ctx.roles.includes("admin") || ctx.isSuperAdmin;
  const isProvider = ctx.roles.includes("provider");
  if (!isAdmin && !isProvider) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const form = await req.formData();
  const disputeId = String(form.get("dispute_id") ?? "");
  const note = form.get("note") ? String(form.get("note")) : null;
  const stripeField = form.get("stripe_field") ? String(form.get("stripe_field")) : null;
  const file = form.get("file") as File | null;

  if (!disputeId) {
    return new Response(JSON.stringify({ error: "dispute_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: dispute, error: dErr } = await ctx.admin
    .from("stripe_disputes")
    .select("id, provider_user_id, status")
    .eq("id", disputeId)
    .maybeSingle();
  if (dErr || !dispute) {
    return new Response(JSON.stringify({ error: "Dispute not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!isAdmin && dispute.provider_user_id !== ctx.user.id) {
    return new Response(JSON.stringify({ error: "Not your dispute" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let storagePath: string | null = null;
  let fileName: string | null = null;
  let contentType: string | null = null;
  let fileSize: number | null = null;

  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    storagePath = `${ctx.user.id}/${disputeId}/${Date.now()}_${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await ctx.admin.storage
      .from("dispute-evidence")
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    fileName = file.name;
    contentType = file.type;
    fileSize = file.size;
  } else if (!note) {
    return new Response(JSON.stringify({ error: "file or note required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: row, error: insErr } = await ctx.admin.from("dispute_evidence").insert({
    dispute_id: disputeId,
    uploaded_by: ctx.user.id,
    uploader_role: isAdmin ? "admin" : "provider",
    kind: file ? "file" : "note",
    storage_path: storagePath,
    file_name: fileName,
    content_type: contentType,
    file_size: fileSize,
    note,
    stripe_field: stripeField,
  }).select("id").single();
  if (insErr) {
    return new Response(JSON.stringify({ error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, evidence_id: row.id, storage_path: storagePath }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
