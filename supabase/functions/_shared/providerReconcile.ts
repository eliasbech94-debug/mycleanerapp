// Trusted reconciliation triple: called from webhooks and edge functions
// after any signal that could change onboarding progress.
// Uses service-role client — never trusts caller identity for `_uid`.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * `supabase-js` `.rpc()` RESOLVES with `{ data, error }` — it does not throw on
 * a database or PostgREST error. A bare `await admin.rpc(...)` inside a
 * try/catch therefore swallows every RPC failure silently: the catch only ever
 * fires on transport-level faults.
 *
 * This is not hypothetical. `refresh_provider_score_tier` had two overloads,
 * so PostgREST could not resolve the `{_uid,_reason}` payload and returned
 * PGRST203 on every call. Because the error was never read, provider scores and
 * tiers silently stopped updating with no signal anywhere.
 *
 * `callRpc` forces the error to be inspected and logged.
 */
async function callRpc(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<boolean> {
  const { error } = await admin.rpc(fn, args);
  if (error) {
    console.error(
      "provider_reconcile_rpc_failed",
      JSON.stringify({
        rpc: fn,
        user_id: userId,
        code: (error as { code?: string }).code ?? null,
        message: error.message,
        details: (error as { details?: string }).details ?? null,
      }),
    );
    return false;
  }
  return true;
}

export async function reconcileProvider(
  admin: SupabaseClient,
  userId: string,
  reason = "webhook",
): Promise<void> {
  if (!userId) return;
  try {
    // Order matters: completion first (may affect visibility), then reconcile
    // status transitions, then refresh score/tier.
    // Each step is independent: a failure is logged and the remaining steps
    // still run, so one broken RPC cannot silently disable the whole chain.
    const results = {
      calc_provider_completion: await callRpc(
        admin,
        "calc_provider_completion",
        { _uid: userId },
        userId,
      ),
      reconcile_provider_status: await callRpc(
        admin,
        "reconcile_provider_status",
        { _uid: userId },
        userId,
      ),
      refresh_provider_score_tier: await callRpc(
        admin,
        "refresh_provider_score_tier",
        { _uid: userId, _reason: reason },
        userId,
      ),
      // The approval engine is the single authority for approved/public/bookable.
      evaluate_provider_approval: await callRpc(
        admin,
        "evaluate_provider_approval",
        { _uid: userId },
        userId,
      ),
    };

    const failed = Object.entries(results)
      .filter(([, ok]) => !ok)
      .map(([fn]) => fn);
    if (failed.length > 0) {
      console.error(
        "provider_reconcile_incomplete",
        JSON.stringify({ user_id: userId, reason, failed }),
      );
    }
  } catch (e) {
    // Transport/runtime faults only — RPC-level errors are handled above.
    console.error(
      "provider_reconcile_failed",
      JSON.stringify({ user_id: userId, reason, message: (e as Error).message }),
    );
  }
}
