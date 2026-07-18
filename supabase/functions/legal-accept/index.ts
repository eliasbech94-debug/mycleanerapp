// Records an explicit legal acceptance. Requires the exact document_id and
// hash the user was shown. Append-only enforced by trigger.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(monitored("legal-accept", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null) as
    | { document_id?: string; document_hash?: string; source?: string }
    | null;
  if (!body?.document_id || !body?.document_hash) {
    return json({ error: "document_id and document_hash required" }, 400);
  }

  const { data: doc, error: docErr } = await admin
    .from("legal_documents")
    .select("id, kind, country_code, language, version, body_hash, status")
    .eq("id", body.document_id)
    .maybeSingle();
  if (docErr || !doc) return json({ error: "document_not_found" }, 404);
  if (doc.status !== "published") return json({ error: "document_not_published" }, 409);
  if (doc.body_hash !== body.document_hash) {
    return json({ error: "hash_mismatch", expected: doc.body_hash }, 409);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  const { error: insErr } = await admin.from("user_legal_acceptances").insert({
    user_id: ctx.userId,
    document_id: doc.id,
    country_code: doc.country_code,
    language: doc.language,
    version: doc.version,
    document_hash: doc.body_hash,
    ip,
    user_agent: ua,
    source: body.source ?? "legal_gate",
  });
  if (insErr) return json({ error: insErr.message }, 409);

  return json({ ok: true });
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
