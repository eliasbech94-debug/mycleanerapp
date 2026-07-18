// Return a short-lived signed URL for an evidence file. RLS handles who
// owns the dispute; we recheck server-side before signing.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const { evidence_id } = await req.json();
  if (!evidence_id) return new Response("bad request", { status: 400, headers: corsHeaders });

  const { data: ev } = await ctx.admin
    .from("dispute_evidence")
    .select("storage_path, dispute_id")
    .eq("id", evidence_id).maybeSingle();
  if (!ev?.storage_path) return new Response("not found", { status: 404, headers: corsHeaders });

  const isAdmin = ctx.roles.includes("admin") || ctx.isSuperAdmin;
  if (!isAdmin) {
    const { data: d } = await ctx.admin.from("stripe_disputes")
      .select("provider_user_id").eq("id", ev.dispute_id).maybeSingle();
    if (!d || d.provider_user_id !== ctx.user.id) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
  }

  const { data: signed, error } = await ctx.admin.storage
    .from("dispute-evidence").createSignedUrl(ev.storage_path, 300);
  if (error) return new Response(error.message, { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ url: signed.signedUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
