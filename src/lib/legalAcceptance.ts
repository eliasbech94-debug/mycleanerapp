import { supabase } from "@/integrations/supabase/client";

export type ActiveLegalDoc = {
  id: string;
  kind: "terms" | "privacy" | string;
  country_code: string;
  language: string;
  version: string;
  body_hash: string;
  title: string | null;
};

/** Fetch the active published required documents for a country/language. */
export async function fetchActiveRequiredDocs(country: string, language: string): Promise<ActiveLegalDoc[]> {
  const iso = (country || "DK").toUpperCase();
  const lang = (language || "da").toLowerCase();
  const { data, error } = await supabase
    .from("legal_documents")
    .select("id,kind,country_code,language,version,body_hash,title,status,effective_at,required")
    .eq("status", "published")
    .eq("country_code", iso)
    .eq("language", lang)
    .in("kind", ["terms", "privacy"]);
  if (error) throw error;
  const now = Date.now();
  return (data ?? [])
    .filter((d: any) => d.required && d.effective_at && new Date(d.effective_at).getTime() <= now)
    .map((d: any) => ({
      id: d.id, kind: d.kind, country_code: d.country_code, language: d.language,
      version: d.version, body_hash: d.body_hash, title: d.title ?? null,
    }));
}

/** Persist acceptance rows for the current authenticated user. Idempotent per (user, doc). */
export async function recordAcceptances(userId: string, docs: ActiveLegalDoc[]): Promise<void> {
  if (!docs.length) return;
  const rows = docs.map((d) => ({
    user_id: userId,
    document_id: d.id,
    country_code: d.country_code,
    language: d.language,
    version: d.version,
    document_hash: d.body_hash,
    source: "web" as const,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
  }));
  const { error } = await supabase.from("user_legal_acceptances").insert(rows);
  // Ignore unique-violation duplicates (idempotent).
  if (error && !/duplicate key|unique/i.test(error.message)) throw error;
}
