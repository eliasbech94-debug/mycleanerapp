// Determines which required legal documents the authenticated user still owes
// acceptance for, in their marketplace country + language. Does NOT record
// acceptance — that requires an explicit call to legal-accept.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(monitored("legal-gate-status", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "DK").toUpperCase();
  const language = (url.searchParams.get("language") ?? "da").toLowerCase();
  const isProvider = url.searchParams.get("is_provider") === "true";

  // Effective published docs for country/language, or English fallback where allowed.
  const { data: docs } = await admin
    .from("legal_documents")
    .select("id, kind, country_code, language, version, body_hash, title, effective_at, required, fallback_to_english")
    .in("status", ["published"])
    .lte("effective_at", new Date().toISOString())
    .eq("country_code", country);

  const applicable = (docs ?? []).filter((d) => {
    if (!d.required) return false;
    if (d.kind === "provider_agreement" && !isProvider) return false;
    return d.language === language || d.fallback_to_english;
  });

  // Which of these has the user accepted at the exact hash?
  const { data: accepts } = await admin
    .from("user_legal_acceptances")
    .select("document_id")
    .eq("user_id", ctx.userId)
    .in("document_id", applicable.map((d) => d.id));

  const acceptedIds = new Set((accepts ?? []).map((a) => a.document_id));
  const pending = applicable.filter((d) => !acceptedIds.has(d.id));

  return new Response(JSON.stringify({ pending, applicable_count: applicable.length }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}));
