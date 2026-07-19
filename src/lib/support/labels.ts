// Canonical Danish labels for the support conversation status/priority values.
// Keep in one place so all menus, badges and dialogs stay consistent.
export const STATUS_LABEL_DA: Record<string, string> = {
  open: "Åben",
  pending_customer: "Afventer kunde",
  pending_provider: "Afventer provider",
  pending_support: "Afventer support",
  escalated: "Eskaleret",
  resolved: "Løst",
  closed: "Lukket",
};

export const PRIORITY_LABEL_DA: Record<string, string> = {
  low: "Lav",
  normal: "Normal",
  high: "Høj",
  urgent: "Akut",
};

export const STATUS_ORDER = [
  "open",
  "pending_customer",
  "pending_provider",
  "pending_support",
  "escalated",
  "resolved",
  "closed",
] as const;

export const PRIORITY_ORDER = ["low", "normal", "high", "urgent"] as const;

// Mirror of the server-side TRANSITIONS map. Server is authoritative; this exists
// only to hide invalid options in the UI. Any mismatch is surfaced by the
// server's `invalid_transition` error.
const TRANSITIONS: Record<string, string[]> = {
  open: ["pending_customer", "pending_provider", "pending_support", "escalated", "resolved", "closed"],
  pending_customer: ["open", "pending_provider", "pending_support", "escalated", "resolved", "closed"],
  pending_provider: ["open", "pending_customer", "pending_support", "escalated", "resolved", "closed"],
  pending_support: ["open", "pending_customer", "pending_provider", "escalated", "resolved", "closed"],
  escalated: ["open", "pending_customer", "pending_provider", "pending_support", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

export function allowedTransitions(from: string): string[] {
  return TRANSITIONS[from] ?? [];
}

export function reasonRequired(from: string, to: string): boolean {
  if (to === "escalated" || to === "closed") return true;
  if ((from === "resolved" || from === "closed") && to === "open") return true;
  return false;
}
