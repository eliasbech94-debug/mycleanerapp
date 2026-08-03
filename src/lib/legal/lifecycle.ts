// Legal document lifecycle: statuses, allowed transitions, review scheduling.
// Mirrors the `legal_documents_status_check` constraint in the database.

export const LEGAL_STATUSES = [
  "draft",
  "internal_review",
  "legal_review",
  "approved",
  "scheduled",
  "published",
  "superseded",
  "archived",
] as const;

export type LegalStatus = (typeof LEGAL_STATUSES)[number];

export const LEGAL_STATUS_LABEL: Record<LegalStatus, string> = {
  draft: "Kladde",
  internal_review: "Intern gennemgang",
  legal_review: "Juridisk gennemgang",
  approved: "Godkendt",
  scheduled: "Planlagt",
  published: "Publiceret",
  superseded: "Erstattet",
  archived: "Arkiveret",
};

/** Workflow order used by the admin stepper. */
export const REVIEW_WORKFLOW: LegalStatus[] = ["draft", "internal_review", "legal_review", "approved", "published"];

const TRANSITIONS: Record<LegalStatus, LegalStatus[]> = {
  draft: ["internal_review", "archived"],
  internal_review: ["draft", "legal_review", "archived"],
  legal_review: ["internal_review", "approved", "archived"],
  approved: ["legal_review", "scheduled", "published", "archived"],
  scheduled: ["approved", "published", "archived"],
  // Published/superseded rows are immutable except for end-state moves.
  published: ["superseded", "archived"],
  superseded: ["archived"],
  archived: [],
};

export function isLegalStatus(value: string): value is LegalStatus {
  return (LEGAL_STATUSES as readonly string[]).includes(value);
}

export function nextStatuses(current: string): LegalStatus[] {
  return isLegalStatus(current) ? TRANSITIONS[current] : ["draft"];
}

export function canTransition(from: string, to: string): boolean {
  return isLegalStatus(to) && nextStatuses(from).includes(to);
}

/** Only `approved` (or `scheduled`) documents may be published. */
export function canPublish(status: string): boolean {
  return status === "approved" || status === "scheduled";
}

export function isPublicStatus(status: string): boolean {
  return status === "published";
}

export function isEditableStatus(status: string): boolean {
  return ["draft", "internal_review", "legal_review"].includes(status);
}

/* ------------------------------------------------------------------ */
/* Review scheduling                                                   */
/* ------------------------------------------------------------------ */

export interface ReviewState {
  dueAt: Date | null;
  daysUntil: number | null;
  isOverdue: boolean;
  isDueSoon: boolean;
}

export function reviewState(nextReviewAt: string | null | undefined, now = new Date(), soonDays = 30): ReviewState {
  if (!nextReviewAt) return { dueAt: null, daysUntil: null, isOverdue: false, isDueSoon: false };
  const dueAt = new Date(nextReviewAt);
  const daysUntil = Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000);
  return {
    dueAt,
    daysUntil,
    isOverdue: daysUntil < 0,
    isDueSoon: daysUntil >= 0 && daysUntil <= soonDays,
  };
}

export function computeNextReview(from: Date, intervalMonths = 12): string {
  const next = new Date(from);
  next.setMonth(next.getMonth() + Math.max(1, intervalMonths));
  return next.toISOString();
}
