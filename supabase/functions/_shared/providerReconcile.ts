// Trusted reconciliation triple: called from webhooks and edge functions
// after any signal that could change onboarding progress.
// Uses service-role client — never trusts caller identity for `_uid`.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function reconcileProvider(
  admin: SupabaseClient,
  userId: string,
  reason = "webhook",
): Promise<void> {
  if (!userId) return;
  try {
    // Order matters: completion first (may affect visibility), then reconcile
    // status transitions, then refresh score/tier.
    await admin.rpc("calc_provider_completion", { _uid: userId });
    await admin.rpc("reconcile_provider_status", { _uid: userId });
    await admin.rpc("refresh_provider_score_tier", {
      _uid: userId,
      _reason: reason,
    });
  } catch (e) {
    console.error("provider_reconcile_failed", userId, (e as Error).message);
  }
}
