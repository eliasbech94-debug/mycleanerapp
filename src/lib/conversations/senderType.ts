/**
 * Canonical sender classification for every MyCleaner message.
 *
 * HARD RULE: AI labelling is decided *only* by the persisted `sender_type`
 * column. Never infer it from the message text, the model name, a prefix, or
 * any heuristic on `body`. The column is immutable in the database, which is
 * what makes the label survive export, reopening and handover to a human.
 */

export const SENDER_TYPES = [
  "customer",
  "provider",
  "support_agent",
  "ai_assistant",
  "system",
] as const;

export type SenderType = (typeof SENDER_TYPES)[number];

/** Legacy `sender_role` values that predate `sender_type`. */
export type LegacySenderRole = "customer" | "provider" | "support" | "admin" | "system";

const LEGACY_MAP: Record<LegacySenderRole, SenderType> = {
  customer: "customer",
  provider: "provider",
  support: "support_agent",
  admin: "support_agent",
  system: "system",
};

export function isSenderType(value: unknown): value is SenderType {
  return typeof value === "string" && (SENDER_TYPES as readonly string[]).includes(value);
}

/**
 * Resolve the authoritative sender type for a message row.
 * Falls back to the legacy role mapping for rows written before the column
 * existed — never to text analysis.
 */
export function resolveSenderType(message: {
  sender_type?: string | null;
  sender_role?: string | null;
}): SenderType {
  if (isSenderType(message.sender_type)) return message.sender_type;
  const legacy = message.sender_role as LegacySenderRole | undefined | null;
  if (legacy && legacy in LEGACY_MAP) return LEGACY_MAP[legacy];
  return "system";
}

/** True only for messages generated AND automatically sent by the AI assistant. */
export function isAiGenerated(message: {
  sender_type?: string | null;
  sender_role?: string | null;
}): boolean {
  return resolveSenderType(message) === "ai_assistant";
}

/**
 * Automatic, non-generative platform messages ("Automatisk besked fra MyCleaner").
 * These are explicitly NOT labelled as AI unless generative AI produced the body,
 * in which case they are stored with sender_type = 'ai_assistant' instead.
 */
export function isAutomatedSystemMessage(message: {
  sender_type?: string | null;
  sender_role?: string | null;
}): boolean {
  return resolveSenderType(message) === "system";
}

/**
 * An AI draft that a human reviewed and actively sent is attributed to the human.
 * It is only "human reviewed" when a reviewer is actually recorded — a draft that
 * was auto-sent without a reviewer never qualifies.
 */
export function isHumanReviewedAiDraft(message: {
  sender_type?: string | null;
  sender_role?: string | null;
  ai_drafted?: boolean | null;
  ai_draft_reviewed_by?: string | null;
}): boolean {
  return (
    resolveSenderType(message) === "support_agent" &&
    !!message.ai_drafted &&
    !!message.ai_draft_reviewed_by
  );
}

/** Translation key for the visible author label of a message. */
export function senderLabelKey(type: SenderType): string {
  return `sender.${type}`;
}
