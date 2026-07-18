// Admin-only: submit collected evidence to Stripe for a dispute.
// Uploads the linked files to Stripe Files API and calls disputes.update.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import Stripe from "npm:stripe@17";
import { authenticate, requireRole } from "../_shared/auth.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const { dispute_id } = await req.json();
  if (!dispute_id) {
    return new Response(JSON.stringify({ error: "dispute_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: dispute } = await ctx.admin
    .from("stripe_disputes")
    .select("id, stripe_dispute_id")
    .eq("id", dispute_id)
    .maybeSingle();
  if (!dispute) return new Response("not found", { status: 404, headers: corsHeaders });

  const { data: evidenceRows } = await ctx.admin
    .from("dispute_evidence")
    .select("id, storage_path, file_name, content_type, note, stripe_field")
    .eq("dispute_id", dispute_id)
    .is("submitted_to_stripe_at", null);

  const evidence: Record<string, unknown> = {};
  const notes: string[] = [];
  const submittedIds: string[] = [];

  for (const ev of evidenceRows ?? []) {
    if (ev.note) notes.push(ev.note);
    if (ev.storage_path) {
      const { data: blob, error } = await ctx.admin.storage
        .from("dispute-evidence").download(ev.storage_path);
      if (error || !blob) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      // Stripe files upload
      const form = new FormData();
      form.append("purpose", "dispute_evidence");
      form.append("file", new Blob([buf], { type: ev.content_type ?? "application/octet-stream" }), ev.file_name ?? "evidence");
      const upResp = await fetch("https://files.stripe.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")!}` },
        body: form,
      });
      if (!upResp.ok) {
        console.error("stripe file upload failed", await upResp.text());
        continue;
      }
      const upJson = await upResp.json();
      const field = ev.stripe_field || "uncategorized_file";
      evidence[field] = upJson.id;
    }
    submittedIds.push(ev.id);
  }
  if (notes.length) evidence["uncategorized_text"] = notes.join("\n\n---\n\n").slice(0, 20000);

  try {
    await stripe.disputes.update(dispute.stripe_dispute_id, { evidence: evidence as any });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await ctx.admin.from("dispute_evidence").update({
    submitted_to_stripe_at: new Date().toISOString(),
    submitted_by: ctx.user.id,
  }).in("id", submittedIds);

  await ctx.admin.from("stripe_disputes").update({
    has_evidence: true,
    submission_count: (evidenceRows?.length ?? 0),
    status: "under_review",
  }).eq("id", dispute_id);

  return new Response(JSON.stringify({ ok: true, submitted: submittedIds.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
