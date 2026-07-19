// Determines which required legal documents the authenticated user still owes
// acceptance for. Lookup order:
//   1. country + language
//   2. country + 'en'
//   3. GLOBAL  + 'en'
// The first tier that yields a published, required document for a given `kind`
// is used for that kind. Different kinds can resolve at different tiers.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Doc = {
  id: string;
  kind: string;
  country_code: string;
  language: string;
  version: string;
  body_hash: string;
  title: string | null;
  effective_at: string;
  required: boolean;
  fallback_to_english: boolean;
};

// Fallback tiers, tried in order per document kind
function tiers(country: string, language: string): Array<{ country: string; language: string }> {
  const t = [{ country, language }];
  if (language !== "en") t.push({ country, language: "en" });
  if (country !== "GLOBAL") t.push({ country: "GLOBAL", language: "en" });
  return t;
}

async function fetchTier(country: string, language: string): Promise<Doc[]> {
  const { data } = await admin
    .from("legal_documents")
    .select("id, kind, country_code, language, version, body_hash, title, effective_at, required, fallback_to_english")
    .eq("status", "published")
    .lte("effective_at", new Date().toISOString())
    .eq("country_code", country)
    .eq("language", language);
  return (data ?? []) as Doc[];
}

Deno.serve(monitored("legal-gate-status", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "DK").toUpperCase();
  const language = (url.searchParams.get("language") ?? "da").toLowerCase();
  const isProvider = url.searchParams.get("is_provider") === "true";

  const wantedKinds = new Set<string>(["terms", "privacy"]);
  if (isProvider) wantedKinds.add("provider_agreement");

  // Resolve each kind at the highest-priority tier that has it
  const resolved: Doc[] = [];
  const resolvedKinds = new Set<string>();
  const tierUsage: Record<string, string> = {};

  for (const { country: c, language: l } of tiers(country, language)) {
    if (resolvedKinds.size === wantedKinds.size) break;
    const docs = await fetchTier(c, l);
    for (const d of docs) {
      if (!d.required) continue;
      if (!wantedKinds.has(d.kind)) continue;
      if (resolvedKinds.has(d.kind)) continue;
      resolved.push(d);
      resolvedKinds.add(d.kind);
      tierUsage[d.kind] = `${c}/${l}`;
    }
  }

  // Which of these has the user accepted at the exact hash?
  const { data: accepts } = await admin
    .from("user_legal_acceptances")
    .select("document_id")
    .eq("user_id", ctx.userId)
    .in("document_id", resolved.map((d) => d.id));

  const acceptedIds = new Set((accepts ?? []).map((a) => a.document_id));
  const pending = resolved.filter((d) => !acceptedIds.has(d.id));
  const missingKinds = [...wantedKinds].filter((k) => !resolvedKinds.has(k));

  return new Response(JSON.stringify({
    pending,
    applicable: resolved,
    applicable_count: resolved.length,
    resolved_tiers: tierUsage,
    missing_kinds: missingKinds,
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}));
