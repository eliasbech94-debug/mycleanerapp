/**
 * Rule Pack Manager — audit trail contracts.
 *
 * The audit log is append-only. This module only builds entries; nothing here
 * can mutate or delete a previously recorded entry.
 */

export type RulePackAuditAction =
  | "rule_pack_created"
  | "rule_pack_edited"
  | "tax_rule_edited"
  | "category_created"
  | "category_edited"
  | "category_deleted"
  | "mileage_edited"
  | "mixed_use_edited"
  | "filing_edited"
  | "source_added"
  | "source_verified"
  | "source_removed"
  | "validated"
  | "previewed"
  | "sandbox_run"
  | "compared"
  | "ai_analyzed"
  | "imported_json"
  | "exported"
  | "submitted_for_review"
  | "approved"
  | "published"
  | "retired"
  | "rolled_back"
  | "draft_deleted";

export interface RulePackAuditEntry {
  id: string;
  rulePackId: string | null;
  countryCode: string | null;
  rulePackVersion: string | null;
  action: RulePackAuditAction;
  actorUserId: string | null;
  actorRoles: string[];
  summary: string;
  /** Field-level before/after. Never contains provider personal data. */
  changes: { field: string; before: unknown; after: unknown }[];
  createdAt: string;
}

export const AUDIT_ACTION_LABELS: Record<RulePackAuditAction, string> = {
  rule_pack_created: "Oprettede rule pack",
  rule_pack_edited: "Redigerede rule pack",
  tax_rule_edited: "Redigerede skatteregel",
  category_created: "Oprettede kategori",
  category_edited: "Redigerede kategori",
  category_deleted: "Slettede kategori",
  mileage_edited: "Redigerede kørselsregler",
  mixed_use_edited: "Redigerede blandet brug",
  filing_edited: "Redigerede indberetningsperioder",
  source_added: "Tilføjede kilde",
  source_verified: "Verificerede kilde",
  source_removed: "Fjernede kilde",
  validated: "Validerede",
  previewed: "Kørte preview",
  sandbox_run: "Kørte sandbox",
  compared: "Sammenlignede versioner",
  ai_analyzed: "Kørte AI-analyse",
  imported_json: "Importerede JSON",
  exported: "Eksporterede",
  submitted_for_review: "Sendte til review",
  approved: "Godkendte",
  published: "Publicerede",
  retired: "Pensionerede",
  rolled_back: "Rullede tilbage",
  draft_deleted: "Slettede kladde",
};

export function buildAuditEntry(input: {
  rulePackId: string | null;
  countryCode: string | null;
  rulePackVersion: string | null;
  action: RulePackAuditAction;
  actorUserId: string | null;
  actorRoles: string[];
  summary?: string;
  changes?: { field: string; before: unknown; after: unknown }[];
  now?: string;
}): Omit<RulePackAuditEntry, "id"> {
  return {
    rulePackId: input.rulePackId,
    countryCode: input.countryCode,
    rulePackVersion: input.rulePackVersion,
    action: input.action,
    actorUserId: input.actorUserId,
    actorRoles: input.actorRoles,
    summary: input.summary ?? AUDIT_ACTION_LABELS[input.action],
    changes: input.changes ?? [],
    createdAt: input.now ?? new Date().toISOString(),
  };
}

/** Guard used by tests and the UI: the log may only ever grow. */
export function appendAuditEntry(
  log: RulePackAuditEntry[],
  entry: RulePackAuditEntry,
): RulePackAuditEntry[] {
  return [...log, entry];
}
