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

/**
 * Fallback lookup order for legal documents:
 *   1. country + language
 *   2. country + 'en'
 *   3. GLOBAL  + 'en'
 * The first tier providing a document for each required kind (terms, privacy)
 * is used for that kind. If a kind is not resolvable in any tier, signup
 * remains blocked because the required document is unavailable.
 */
export function legalFallbackTiers(country: string, language: string): Array<{ country: string; language: string }> {
  const iso = (country || "DK").toUpperCase();
  const lang = (language || "da").toLowerCase();
  const tiers = [{ country: iso, language: lang }];
  if (lang !== "en") tiers.push({ country: iso, language: "en" });
  if (iso !== "GLOBAL") tiers.push({ country: "GLOBAL", language: "en" });
  return tiers;
}

/** Fetch the active published required documents applying the global fallback chain. */
export async function fetchActiveRequiredDocs(country: string, language: string): Promise<ActiveLegalDoc[]> {
  const now = Date.now();
  const wanted = new Set<string>(["terms", "privacy"]);
  const resolved = new Map<string, ActiveLegalDoc>();

  for (const tier of legalFallbackTiers(country, language)) {
    if (resolved.size === wanted.size) break;
    const { data, error } = await supabase
      .from("legal_documents")
      .select("id,kind,country_code,language,version,body_hash,title,status,effective_at,required")
      .eq("status", "published")
      .eq("country_code", tier.country)
      .eq("language", tier.language)
      .in("kind", ["terms", "privacy"]);
    if (error) throw error;
    for (const d of data ?? []) {
      if (!wanted.has(d.kind) || resolved.has(d.kind)) continue;
      if (!d.required || !d.effective_at) continue;
      if (new Date(d.effective_at).getTime() > now) continue;
      resolved.set(d.kind, {
        id: d.id, kind: d.kind, country_code: d.country_code, language: d.language,
        version: d.version, body_hash: d.body_hash, title: d.title ?? null,
      });
    }
  }
  return [...resolved.values()];
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
