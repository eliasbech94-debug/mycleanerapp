// Shared helpers for GDPR export and deletion flows.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Redact CPR/CVR-like tax id to first-2 + last-2 pattern. */
export function maskTaxId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/\D+/g, "");
  if (s.length <= 4) return "••••";
  return `${s.slice(0, 2)}••••${s.slice(-2)}`;
}

/** Mask IBAN / bank account: keep first 4 + last 4. */
export function maskBank(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/\s+/g, "");
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

/** Strip fields that must never leave the platform in an export. */
export const FORBIDDEN_FIELDS = new Set([
  "password", "password_hash", "encrypted_password",
  "tax_id_enc", "tax_id_encrypted", "vat_number_enc", "business_address_enc",
  "stripe_secret_key", "api_key", "webhook_secret",
  "fraud_score", "fraud_rules", "internal_notes",
]);

export function scrub<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    if (FORBIDDEN_FIELDS.has(k)) delete out[k];
  }
  return out as T;
}

export function scrubAll<T>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).map(scrub);
}

/** Collect every user-scoped dataset into a GDPR bundle. */
export async function collectUserData(admin: SupabaseClient, userId: string) {
  const bundle: Record<string, unknown> = {};

  const tables: Array<[string, string, string]> = [
    // [property, table, user column]
    ["profile", "profiles", "id"],
    ["addresses", "customer_addresses", "user_id"],
    ["bookings_as_customer", "bookings", "customer_id"],
    ["bookings_as_provider", "bookings", "provider_user_id"],
    ["cleaning_plans", "cleaning_plans", "customer_id"],
    ["support_threads", "support_threads", "user_id"],
    ["support_messages", "support_messages", "sender_id"],
    ["notifications", "customer_notifications", "user_id"],
    ["notification_outbox", "notification_outbox", "user_id"],
    ["consent_history", "consent_ledger", "user_id"],
    ["sms_verifications", "sms_verifications", "user_id"],
    ["provider_receipts", "provider_receipts", "user_id"],
    ["payments", "payment_intents_view", "user_id"], // may not exist — best effort
    ["refund_requests", "refund_requests", "requested_by"],
    ["cancellations", "booking_cancellations", "requested_by"],
    ["disputes_as_provider", "stripe_disputes", "provider_user_id"],
    ["disputes_as_customer", "stripe_disputes", "customer_user_id"],
    ["settlements", "provider_settlement_statements", "provider_user_id"],
    ["payouts", "finance_payouts", "provider_user_id"],
    ["fee_invoices", "platform_fee_invoices", "provider_user_id"],
    ["credit_notes", "platform_credit_notes", "provider_user_id"],
    ["deletion_requests", "account_deletion_requests", "user_id"],
    ["export_jobs", "gdpr_export_jobs", "user_id"],
  ];

  for (const [key, table, col] of tables) {
    try {
      const { data } = await admin.from(table).select("*").eq(col, userId);
      if (data && data.length) bundle[key] = scrubAll(data);
    } catch {
      /* table missing / not accessible — skip silently */
    }
  }

  // Tax profile — sensitive fields masked
  try {
    const { data: tp } = await admin
      .from("provider_tax_profiles").select("*").eq("provider_user_id", userId).maybeSingle();
    if (tp) {
      const scrubbed = scrub(tp) as Record<string, unknown>;
      scrubbed["vat_number_masked"] = maskTaxId((tp as any).vat_number ?? null);
      bundle["tax_profile"] = scrubbed;
    }
  } catch { /* ignore */ }

  try {
    const { data: p } = await admin
      .from("profiles")
      .select("tax_id_last4, tax_municipality, tax_type")
      .eq("id", userId).maybeSingle();
    if (p) bundle["tax_identity_masked"] = p;
  } catch { /* ignore */ }

  // roles
  try {
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if (roles) bundle["roles"] = roles;
  } catch { /* ignore */ }

  // account activity: last audit entries where the user was actor
  try {
    const { data: audit } = await admin
      .from("admin_audit_log").select("action, target_type, target_id, created_at, metadata")
      .eq("actor_user_id", userId).order("created_at", { ascending: false }).limit(500);
    if (audit) bundle["account_activity"] = audit;
  } catch { /* ignore */ }

  return bundle;
}
