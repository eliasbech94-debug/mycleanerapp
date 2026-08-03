// Central helper: the approval engine is the ONLY writer of
// approved / is_public / is_bookable. Edge functions must never set those
// columns themselves — they call this after any signal changes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface ApprovalResult {
  state: string;
  previous_state?: string | null;
  gates: Record<string, unknown>;
  is_public?: boolean;
  is_bookable?: boolean;
  changed?: boolean;
}

/** Run the atomic gate evaluation for one provider. Never throws. */
export async function evaluateProviderApproval(
  admin: SupabaseClient,
  userId: string,
  reason = "signal",
): Promise<ApprovalResult | null> {
  if (!userId) return null;
  const { data, error } = await admin.rpc("evaluate_provider_approval", { _uid: userId });
  if (error) {
    console.error(JSON.stringify({
      evt: "provider_approval.evaluate_failed",
      user_id: userId,
      reason,
      error: error.message,
    }));
    return null;
  }
  const result = data as unknown as ApprovalResult;
  console.log(JSON.stringify({
    evt: "provider_approval.evaluated",
    user_id: userId,
    reason,
    state: result?.state ?? null,
    changed: result?.changed ?? false,
  }));
  return result;
}

/**
 * Notify provider + admins when an already-approved provider loses a gate.
 * Bookings are never cancelled automatically.
 */
export async function notifyApprovalRegression(
  admin: SupabaseClient,
  userId: string,
  result: ApprovalResult,
): Promise<void> {
  if (result.previous_state !== "approved" || result.state === "approved") return;
  try {
    await admin.from("notification_outbox").insert({
      user_id: userId,
      channel: "in_app",
      event_type: "provider.approval_regressed",
      subject: "Din profil er sat på pause",
      body:
        "Et krav til din godkendelse er ikke længere opfyldt, så din profil er midlertidigt " +
        "ikke bookbar. Eksisterende bookinger er ikke aflyst. Se din onboarding-tjekliste.",
      payload: { state: result.state, missing: result.gates?.["missing"] ?? [] },
    });
  } catch (e) {
    console.error("approval_regression_notify_failed", (e as Error).message);
  }
  try {
    await admin.from("system_alerts").insert({
      alert_key: `provider_approval_regression:${userId}`,
      severity: "medium",
      source: "provider_approval_engine",
      title: "Provider mistede en kritisk godkendelses-gate",
      body: `Provider ${userId} er nu i tilstand ${result.state}.`,
      metadata: { user_id: userId, state: result.state, gates: result.gates },
    });
  } catch { /* alerts are best-effort */ }
}
