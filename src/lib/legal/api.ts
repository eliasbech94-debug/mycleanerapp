// Legal Center data access. Reads the existing `legal_documents` table
// (public RLS: published + effective only) and resolves the best document per
// slug using the platform's country/language fallback chain.
import { supabase } from "@/integrations/supabase/client";

export interface LegalDocument {
  id: string;
  slug: string;
  kind: string;
  title: string;
  description: string | null;
  icon: string | null;
  country_code: string;
  language: string;
  version: string;
  body_md: string;
  body_hash: string;
  status: string;
  required: boolean;
  effective_at: string | null;
  published_at: string | null;
  created_at: string;
  doc_uid: string | null;
}

const SELECT =
  "id,slug,kind,title,description,icon,country_code,language,version,body_md,body_hash,status,required,effective_at,published_at,created_at,doc_uid";

/** country+lang → country+en → GLOBAL+en, mirroring legalAcceptance.ts. */
export function fallbackTiers(country: string, language: string) {
  const iso = (country || "DK").toUpperCase();
  const lang = (language || "da").toLowerCase();
  const tiers = [{ country: iso, language: lang }];
  if (lang !== "en") tiers.push({ country: iso, language: "en" });
  if (iso !== "GLOBAL") tiers.push({ country: "GLOBAL", language: "en" });
  return tiers;
}

function tierRank(doc: { country_code: string; language: string }, country: string, language: string): number {
  const tiers = fallbackTiers(country, language);
  const i = tiers.findIndex((t) => t.country === doc.country_code && t.language === doc.language);
  return i === -1 ? tiers.length : i;
}

/** Newest published version wins within the same tier. */
function pickBest(docs: LegalDocument[], country: string, language: string): LegalDocument[] {
  const best = new Map<string, LegalDocument>();
  for (const d of docs) {
    const current = best.get(d.slug);
    if (!current) {
      best.set(d.slug, d);
      continue;
    }
    const a = tierRank(d, country, language);
    const b = tierRank(current, country, language);
    if (a < b) best.set(d.slug, d);
    else if (a === b && (d.effective_at ?? "") > (current.effective_at ?? "")) best.set(d.slug, d);
  }
  return [...best.values()].sort((x, y) => x.title.localeCompare(y.title));
}

export async function fetchLegalIndex(country: string, language: string): Promise<LegalDocument[]> {
  const tiers = fallbackTiers(country, language);
  const { data, error } = await supabase
    .from("legal_documents")
    .select(SELECT)
    .eq("status", "published")
    .in("country_code", [...new Set(tiers.map((t) => t.country))])
    .in("language", [...new Set(tiers.map((t) => t.language))]);
  if (error) throw error;
  return pickBest((data ?? []) as LegalDocument[], country, language);
}

export async function fetchLegalDocument(
  slug: string,
  country: string,
  language: string,
): Promise<LegalDocument | null> {
  const tiers = fallbackTiers(country, language);
  const { data, error } = await supabase
    .from("legal_documents")
    .select(SELECT)
    .eq("status", "published")
    .eq("slug", slug)
    .in("country_code", [...new Set(tiers.map((t) => t.country))])
    .in("language", [...new Set(tiers.map((t) => t.language))]);
  if (error) throw error;
  return pickBest((data ?? []) as LegalDocument[], country, language)[0] ?? null;
}

/** Required documents the signed-in user has not accepted at the current hash. */
export async function fetchPendingRequired(
  userId: string,
  country: string,
  language: string,
): Promise<LegalDocument[]> {
  const all = await fetchLegalIndex(country, language);
  const required = all.filter((d) => d.required);
  if (!required.length) return [];
  const { data, error } = await supabase
    .from("user_legal_acceptances")
    .select("document_hash")
    .eq("user_id", userId)
    .in("document_hash", required.map((d) => d.body_hash));
  if (error) throw error;
  const accepted = new Set((data ?? []).map((r: { document_hash: string }) => r.document_hash));
  return required.filter((d) => !accepted.has(d.body_hash));
}

/** Append-only acceptance record. Never stores credentials. */
export async function acceptLegalDocument(
  userId: string,
  doc: LegalDocument,
  source: string,
): Promise<void> {
  const { error } = await supabase.from("user_legal_acceptances").insert({
    user_id: userId,
    document_id: doc.id,
    country_code: doc.country_code,
    language: doc.language,
    version: doc.version,
    document_hash: doc.body_hash,
    source,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
  });
  if (error && !/duplicate key|unique/i.test(error.message)) throw error;
}
