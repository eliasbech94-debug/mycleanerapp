// Legal Center service layer: sections (chapters), publishing, changelog,
// audit trail, rollback, translations and search. Single source of truth —
// UI components must not query the legal tables directly.
import { supabase } from "@/integrations/supabase/client";
import { sha256Hex } from "@/lib/legal/hash";
import { bumpSectionVersion, bumpVersion, normalizeVersion, parseVersion, type VersionBump } from "@/lib/legal/version";
import { detectSectionChanges, suggestBump, summarizeChanges, type ComparableSection, type SectionChange } from "@/lib/legal/diff";
import { readingTimeMinutes } from "@/lib/legal/markdown";
import { canPublish, canTransition, computeNextReview, type LegalStatus } from "@/lib/legal/lifecycle";

export interface LegalSection {
  id: string;
  document_id: string;
  section_key: string;
  section_order: number;
  title: string;
  slug: string;
  content_md: string;
  version: string;
  status: string;
  hash: string;
  language: string;
  translation_of: string | null;
  effective_date: string | null;
  published_at: string | null;
  created_by: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
  word_count?: number;
  reading_minutes?: number;
}

export interface LegalChangelogEntry {
  id: string;
  document_id: string;
  doc_uid: string | null;
  version: string;
  previous_version: string | null;
  summary: string | null;
  entries: SectionChange[];
  published_at: string;
}

const SECTION_COLUMNS =
  "id,document_id,section_key,section_order,title,slug,content_md,version,status,hash,language,translation_of,effective_date,published_at,created_by,published_by,created_at,updated_at,word_count,reading_minutes";

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function fetchSections(documentId: string, language?: string): Promise<LegalSection[]> {
  let query = supabase
    .from("legal_document_sections")
    .select(SECTION_COLUMNS)
    .eq("document_id", documentId)
    .order("section_order", { ascending: true });
  if (language) query = query.eq("language", language);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LegalSection[];
}

export async function fetchPublishedSections(documentId: string, language?: string): Promise<LegalSection[]> {
  const all = await fetchSections(documentId, language);
  return all.filter((s) => s.status === "published");
}

/** Assembles chapters into one markdown body (backwards-compatible render). */
export function composeSections(sections: LegalSection[]): string {
  return [...sections]
    .sort((a, b) => a.section_order - b.section_order)
    .map((s) => {
      const body = (s.content_md ?? "").trim();
      return /^#{1,2}\s/.test(body) ? body : `## ${s.title}\n\n${body}`;
    })
    .join("\n\n");
}

export function sectionsReadingTime(sections: LegalSection[]): number {
  return readingTimeMinutes(composeSections(sections));
}

export async function fetchChangelog(documentId: string): Promise<LegalChangelogEntry[]> {
  const { data, error } = await supabase
    .from("legal_document_changelog")
    .select("id,document_id,doc_uid,version,previous_version,summary,entries,published_at")
    .eq("document_id", documentId)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, entries: (r.entries ?? []) as unknown as SectionChange[] })) as LegalChangelogEntry[];
}

export async function fetchAuditLog(documentId: string) {
  const { data, error } = await supabase
    .from("legal_audit_log")
    .select("id,document_id,section_id,actor_id,action,old_hash,new_hash,reason,created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export async function recordAudit(input: {
  documentId?: string | null;
  sectionId?: string | null;
  action: string;
  oldHash?: string | null;
  newHash?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const actorId = auth.user?.id;
  if (!actorId) return;
  // Audit failures must never block a legal edit; they are logged, not thrown.
  const { error } = await supabase.from("legal_audit_log").insert({
    document_id: input.documentId ?? null,
    section_id: input.sectionId ?? null,
    actor_id: actorId,
    action: input.action,
    old_hash: input.oldHash ?? null,
    new_hash: input.newHash ?? null,
    reason: input.reason ?? null,
    metadata: (input.metadata ?? {}) as never,
  });
  if (error) console.warn("legal audit insert failed", error.message);
}

/* ------------------------------------------------------------------ */
/* Section writes                                                      */
/* ------------------------------------------------------------------ */

export function slugifyKey(input: string, fallback = "kapitel"): string {
  const slug = (input || "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

export function nextSectionKey(sections: LegalSection[]): string {
  const numbers = sections
    .map((s) => Number(s.section_key.match(/(\d+)$/)?.[1] ?? 0))
    .filter((n) => Number.isFinite(n));
  return `chapter-${Math.max(0, ...numbers) + 1}`;
}

export async function createSection(input: {
  documentId: string;
  title: string;
  contentMd?: string;
  language: string;
  sections: LegalSection[];
}): Promise<LegalSection> {
  const key = nextSectionKey(input.sections);
  const content = input.contentMd ?? "";
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("legal_document_sections")
    .insert({
      document_id: input.documentId,
      section_key: key,
      section_order: input.sections.length + 1,
      title: input.title,
      slug: slugifyKey(input.title, key),
      content_md: content,
      version: "1.0",
      status: "draft",
      hash: await sha256Hex(content),
      language: input.language,
      created_by: auth.user?.id ?? null,
    })
    .select(SECTION_COLUMNS)
    .single();
  if (error) throw error;
  await recordAudit({ documentId: input.documentId, sectionId: data.id, action: "section.created", newHash: data.hash });
  return data as LegalSection;
}

export async function updateSection(
  section: LegalSection,
  patch: { title?: string; content_md?: string; effective_date?: string | null },
  reason?: string,
): Promise<LegalSection> {
  const content = patch.content_md ?? section.content_md;
  const hash = await sha256Hex(content);
  const contentChanged = hash !== section.hash;
  const { data, error } = await supabase
    .from("legal_document_sections")
    .update({
      title: patch.title ?? section.title,
      slug: slugifyKey(patch.title ?? section.title, section.section_key),
      content_md: content,
      hash,
      effective_date: patch.effective_date === undefined ? section.effective_date : patch.effective_date,
      // Editing published text creates the next draft version of that chapter.
      version: contentChanged && section.status === "published" ? bumpSectionVersion(section.version) : section.version,
      status: contentChanged && section.status === "published" ? "draft" : section.status,
    })
    .eq("id", section.id)
    .select(SECTION_COLUMNS)
    .single();
  if (error) throw error;
  await recordAudit({
    documentId: section.document_id,
    sectionId: section.id,
    action: "section.updated",
    oldHash: section.hash,
    newHash: hash,
    reason: reason ?? null,
  });
  return data as LegalSection;
}

export async function deleteSection(section: LegalSection, reason?: string): Promise<void> {
  const { error } = await supabase.from("legal_document_sections").delete().eq("id", section.id);
  if (error) throw error;
  await recordAudit({
    documentId: section.document_id,
    sectionId: null,
    action: "section.deleted",
    oldHash: section.hash,
    reason: reason ?? null,
    metadata: { section_key: section.section_key, title: section.title },
  });
}

export async function reorderSections(documentId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("legal_document_sections")
      .update({ section_order: i + 1 })
      .eq("id", orderedIds[i]);
    if (error) throw error;
  }
  await recordAudit({ documentId, action: "sections.reordered", metadata: { order: orderedIds } });
}

export async function duplicateSection(section: LegalSection, sections: LegalSection[]): Promise<LegalSection> {
  return createSection({
    documentId: section.document_id,
    title: `${section.title} (kopi)`,
    contentMd: section.content_md,
    language: section.language,
    sections,
  });
}

/** Splits a chapter at a marker (default: the first "---" line). */
export function splitContent(content: string, marker = "---"): [string, string] {
  const lines = (content ?? "").split("\n");
  const idx = lines.findIndex((l) => l.trim() === marker);
  if (idx === -1) {
    const mid = Math.ceil(lines.length / 2);
    return [lines.slice(0, mid).join("\n").trim(), lines.slice(mid).join("\n").trim()];
  }
  return [lines.slice(0, idx).join("\n").trim(), lines.slice(idx + 1).join("\n").trim()];
}

export async function splitSection(section: LegalSection, sections: LegalSection[]): Promise<void> {
  const [head, tail] = splitContent(section.content_md);
  await updateSection(section, { content_md: head }, "split");
  await createSection({
    documentId: section.document_id,
    title: `${section.title} (del 2)`,
    contentMd: tail,
    language: section.language,
    sections,
  });
}

export function mergeContent(a: string, b: string): string {
  return `${(a ?? "").trim()}\n\n${(b ?? "").trim()}`.trim();
}

export async function mergeSections(target: LegalSection, source: LegalSection): Promise<void> {
  await updateSection(target, { content_md: mergeContent(target.content_md, source.content_md) }, "merge");
  await deleteSection(source, `merged into ${target.section_key}`);
}

/* ------------------------------------------------------------------ */
/* Translations                                                        */
/* ------------------------------------------------------------------ */

export async function createTranslation(source: LegalSection, language: string): Promise<LegalSection> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("legal_document_sections")
    .insert({
      document_id: source.document_id,
      section_key: source.section_key,
      section_order: source.section_order,
      title: source.title,
      slug: source.slug,
      content_md: source.content_md,
      version: source.version,
      status: "draft",
      hash: await sha256Hex(source.content_md),
      language,
      translation_of: source.id,
      created_by: auth.user?.id ?? null,
    })
    .select(SECTION_COLUMNS)
    .single();
  if (error) throw error;
  await recordAudit({
    documentId: source.document_id,
    sectionId: data.id,
    action: "section.translation_created",
    metadata: { language, source_section: source.id },
  });
  return data as LegalSection;
}

/** Translations whose source chapter changed after the translation was saved. */
export function staleTranslations(sections: LegalSection[]): LegalSection[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  return sections.filter((s) => {
    if (!s.translation_of) return false;
    const src = byId.get(s.translation_of);
    return Boolean(src && src.updated_at > s.updated_at);
  });
}

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

export interface PublishPreview {
  changes: SectionChange[];
  bump: VersionBump;
  nextVersion: string;
  summary: string;
  previousBody: string;
  nextBody: string;
  nextHash: string;
}

function comparable(sections: LegalSection[]): ComparableSection[] {
  return sections.map((s) => ({
    section_key: s.section_key,
    title: s.title,
    hash: s.hash,
    version: s.version,
    section_order: s.section_order,
  }));
}

/** Computes what publishing would change — used by the diff viewer. */
export async function buildPublishPreview(doc: {
  id: string;
  version: string;
  body_md: string;
  language: string;
}): Promise<PublishPreview> {
  const sections = await fetchSections(doc.id, doc.language);
  const published = sections.filter((s) => s.status === "published");
  const draftSet = sections.filter((s) => s.status !== "archived");
  const changes = detectSectionChanges(comparable(published), comparable(draftSet));
  const bump = suggestBump(changes);
  const nextBody = composeSections(draftSet);
  return {
    changes,
    bump,
    nextVersion: bumpVersion(doc.version, bump),
    summary: summarizeChanges(changes),
    previousBody: doc.body_md,
    nextBody,
    nextHash: await sha256Hex(nextBody),
  };
}

export interface LegalDocumentRef {
  id: string;
  slug: string;
  kind: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  country_code: string;
  language: string;
  version: string;
  body_md: string;
  body_hash: string;
  status: string;
  required?: boolean;
  doc_uid?: string | null;
}

/**
 * Creates the next draft version of a published document as a NEW row
 * (published rows are immutable in the database) and copies its chapters.
 * The permanent document id (`doc_uid`) is carried over unchanged.
 */
export async function createDraftVersion(
  doc: LegalDocumentRef,
  bump: VersionBump = "minor",
  reason?: string,
): Promise<string> {
  const version = bumpVersion(doc.version, bump);
  const v = parseVersion(version);
  const { data: auth } = await supabase.auth.getUser();

  const { data: created, error } = await supabase
    .from("legal_documents")
    .insert({
      slug: doc.slug,
      kind: doc.kind,
      title: doc.title,
      description: doc.description ?? null,
      icon: doc.icon ?? null,
      country_code: doc.country_code,
      language: doc.language,
      version,
      version_major: v.major,
      version_minor: v.minor,
      version_patch: v.patch,
      body_md: doc.body_md,
      body_hash: doc.body_hash,
      status: "draft",
      required: doc.required ?? true,
      doc_uid: doc.doc_uid ?? null,
      created_by: auth.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const sections = await fetchSections(doc.id, doc.language);
  if (sections.length) {
    const { error: copyError } = await supabase.from("legal_document_sections").insert(
      sections.map((s) => ({
        document_id: created.id,
        section_key: s.section_key,
        section_order: s.section_order,
        title: s.title,
        slug: s.slug,
        content_md: s.content_md,
        version: s.version,
        status: "draft",
        hash: s.hash,
        language: s.language,
        created_by: auth.user?.id ?? null,
      })),
    );
    if (copyError) throw copyError;
  }

  await recordAudit({
    documentId: created.id,
    action: "document.draft_version_created",
    oldHash: doc.body_hash,
    reason: reason ?? null,
    metadata: { from_document: doc.id, from_version: doc.version, version },
  });
  return created.id;
}

/**
 * Publishes a draft document: composes chapters into `legal_documents.body_md`,
 * recomputes the SHA-256 hash, supersedes the previously published version and
 * writes the automatic changelog + audit entry.
 */
export async function publishDocumentVersion(input: {
  document: LegalDocumentRef;
  bump?: VersionBump;
  reason?: string;
}): Promise<{ version: string; hash: string }> {
  const { document } = input;
  if (document.status === "published") {
    throw new Error("Publicerede versioner er uforanderlige — opret en ny kladdeversion først.");
  }

  const preview = await buildPublishPreview(document);
  const now = new Date().toISOString();
  const { data: auth } = await supabase.auth.getUser();

  // Previously published version of the same document scope is superseded.
  const { data: currentPublished } = await supabase
    .from("legal_documents")
    .select("id,version,body_hash")
    .eq("kind", document.kind)
    .eq("country_code", document.country_code)
    .eq("language", document.language)
    .eq("status", "published")
    .maybeSingle();

  const previousVersion = currentPublished?.version ?? null;
  const version = input.bump ? bumpVersion(previousVersion ?? document.version, input.bump) : document.version;
  const v = parseVersion(version);

  if (currentPublished) {
    const { error: supersedeError } = await supabase
      .from("legal_documents")
      .update({ status: "superseded", superseded_at: now })
      .eq("id", currentPublished.id);
    if (supersedeError) throw supersedeError;
  }

  const { error: docError } = await supabase
    .from("legal_documents")
    .update({
      body_md: preview.nextBody,
      body_hash: preview.nextHash,
      version,
      version_major: v.major,
      version_minor: v.minor,
      version_patch: v.patch,
      status: "published",
      published_at: now,
      effective_at: now,
    })
    .eq("id", document.id);
  if (docError) throw docError;

  const { error: sectionError } = await supabase
    .from("legal_document_sections")
    .update({ status: "published", published_at: now, published_by: auth.user?.id ?? null, effective_date: now })
    .eq("document_id", document.id)
    .eq("language", document.language)
    .neq("status", "archived");
  if (sectionError) throw sectionError;

  const { error: logError } = await supabase.from("legal_document_changelog").insert({
    document_id: document.id,
    doc_uid: document.doc_uid ?? null,
    version,
    previous_version: previousVersion,
    summary: preview.summary,
    entries: preview.changes as never,
    created_by: auth.user?.id ?? null,
    published_at: now,
  });
  if (logError) throw logError;

  await recordAudit({
    documentId: document.id,
    action: "document.published",
    oldHash: currentPublished?.body_hash ?? document.body_hash,
    newHash: preview.nextHash,
    reason: input.reason ?? null,
    metadata: { version, previous_version: previousVersion },
  });

  return { version, hash: preview.nextHash };
}

/**
 * Rollback: takes an earlier (superseded/archived) version and re-creates it as
 * a new draft version with its chapters, ready to be reviewed and published.
 * Nothing is deleted, so the full version history stays intact.
 */
export async function rollbackToVersion(doc: LegalDocumentRef, reason?: string): Promise<string> {
  const draftId = await createDraftVersion(doc, "patch", reason ?? "rollback");
  await recordAudit({
    documentId: draftId,
    action: "document.rollback_prepared",
    reason: reason ?? null,
    metadata: { from_document: doc.id, from_version: doc.version },
  });
  return draftId;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface LegalSearchHit {
  document_id: string;
  section_id: string;
  section_key: string;
  title: string;
  snippet: string;
}

export function matchSections(sections: LegalSection[], term: string): LegalSearchHit[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const hits: LegalSearchHit[] = [];
  for (const s of sections) {
    const haystack = `${s.title}\n${s.content_md}`.toLowerCase();
    const at = haystack.indexOf(q);
    if (at === -1) continue;
    const source = `${s.title}\n${s.content_md}`;
    hits.push({
      document_id: s.document_id,
      section_id: s.id,
      section_key: s.section_key,
      title: s.title,
      snippet: source.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, " ").trim(),
    });
  }
  return hits;
}

/** Library-wide search across published chapters. */
export async function searchLegalLibrary(term: string, documentId?: string): Promise<LegalSearchHit[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  let query = supabase
    .from("legal_document_sections")
    .select(SECTION_COLUMNS)
    .eq("status", "published")
    .or(`title.ilike.%${q}%,content_md.ilike.%${q}%`)
    .limit(50);
  if (documentId) query = query.eq("document_id", documentId);
  const { data, error } = await query;
  if (error) throw error;
  return matchSections((data ?? []) as LegalSection[], q);
}
