/**
 * Rule Pack Manager — permission matrix.
 *
 * The matrix is data, not scattered `if (role === ...)` checks, so the UI, the
 * tests and (eventually) the backend can all assert against the same table.
 */

export type RulePackAction =
  | "view"
  | "create"
  | "edit"
  | "validate"
  | "preview"
  | "sandbox"
  | "compare"
  | "import_json"
  | "export_json"
  | "add_source"
  | "verify_source"
  | "submit_for_review"
  | "approve"
  | "ai_analyze"
  | "publish"
  | "retire"
  | "rollback"
  | "delete_draft";

export const RULE_PACK_ACTIONS: RulePackAction[] = [
  "view",
  "create",
  "edit",
  "validate",
  "preview",
  "sandbox",
  "compare",
  "import_json",
  "export_json",
  "add_source",
  "verify_source",
  "submit_for_review",
  "approve",
  "ai_analyze",
  "publish",
  "retire",
  "rollback",
  "delete_draft",
];

/** Actions reserved for super_admin, no matter which permissions are granted. */
export const SUPER_ADMIN_ONLY_ACTIONS: RulePackAction[] = [
  "publish",
  "retire",
  "rollback",
  "delete_draft",
];

/** The named permission an `admin` must hold to reach the module at all. */
export const ACCOUNTING_RULES_PERMISSION = "accounting_rules";

export interface RulePackActor {
  userId: string | null;
  roles: string[];
  /** Granular permissions granted to this admin. */
  permissions: string[];
}

export function isSuperAdmin(actor: RulePackActor): boolean {
  return actor.roles.includes("super_admin");
}

/** Can this actor open /admin/accounting-rules at all? */
export function canAccessRulePackModule(actor: RulePackActor): boolean {
  if (!actor.userId) return false;
  if (isSuperAdmin(actor)) return true;
  return (
    actor.roles.includes("admin") && actor.permissions.includes(ACCOUNTING_RULES_PERMISSION)
  );
}

export function canPerformRulePackAction(
  actor: RulePackActor,
  action: RulePackAction,
): boolean {
  if (!canAccessRulePackModule(actor)) return false;
  if (isSuperAdmin(actor)) return true;
  // A permitted admin may author and review, but never change lifecycle state
  // in a way that reaches providers.
  return !SUPER_ADMIN_ONLY_ACTIONS.includes(action);
}

export function explainDeniedAction(actor: RulePackActor, action: RulePackAction): string {
  if (!actor.userId) return "Du skal være logget ind.";
  if (!canAccessRulePackModule(actor)) {
    return "Kræver rollen super_admin eller admin med tilladelsen “Accounting Rules”.";
  }
  if (SUPER_ADMIN_ONLY_ACTIONS.includes(action)) {
    return "Kun super_admin kan udføre denne handling.";
  }
  return "Handlingen er ikke tilladt.";
}
