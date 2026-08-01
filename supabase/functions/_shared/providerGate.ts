// Server-side provider activation gate.
//
// SECURITY CONTRACT: frontend hiding is never sufficient. Any edge function
// that lets a provider act as an operating provider — deciding on bookings,
// driving the booking lifecycle, or touching financial operations — must call
// `requireActiveProvider` and refuse when the profile is missing, not yet
// approved, paused (unless explicitly allowed), suspended, rejected or
// archived. The gate is fail-closed: any lookup error is a 403, never a pass.
import type { AuthContext } from "./auth.ts";

export type ProviderGateReason =
  | "no_provider_profile"
  | "provider_not_active"
  | "provider_paused"
  | "provider_suspended"
  | "provider_rejected"
  | "provider_archived"
  | "provider_lookup_failed";

export interface ActiveProviderContext {
  userId: string;
  /** Public provider id used on `bookings.provider_id`. */
  providerId: string | null;
  status: string;
}

export interface ProviderGateOptions {
  /**
   * Allow `status = 'paused'`. Paused providers keep servicing the bookings
   * they already accepted (cancel, mileage, calendar, own finance documents)
   * but must never be able to take on new work.
   */
  allowPaused?: boolean;
}

export interface ProviderGateResult {
  ok: boolean;
  reason: ProviderGateReason | null;
  status: string | null;
  provider: ActiveProviderContext | null;
}

interface ProviderRow {
  user_id: string;
  provider_id: string | null;
  status: string | null;
  suspended_at: string | null;
  rejected_at: string | null;
  archived_at: string | null;
  approved_at: string | null;
}

/**
 * Pure decision function — exported so the rules can be unit tested without a
 * database. `row === null` means "no provider profile" and is always refused.
 */
export function evaluateProviderGate(
  row: ProviderRow | null,
  options: ProviderGateOptions = {},
): ProviderGateResult {
  if (!row) {
    return { ok: false, reason: "no_provider_profile", status: null, provider: null };
  }
  const status = row.status ?? "draft";

  if (row.archived_at) {
    return { ok: false, reason: "provider_archived", status, provider: null };
  }
  if (row.rejected_at || status === "rejected") {
    return { ok: false, reason: "provider_rejected", status, provider: null };
  }
  if (row.suspended_at || status === "suspended") {
    return { ok: false, reason: "provider_suspended", status, provider: null };
  }
  if (status === "paused") {
    if (!options.allowPaused) {
      return { ok: false, reason: "provider_paused", status, provider: null };
    }
  } else if (status !== "active") {
    return { ok: false, reason: "provider_not_active", status, provider: null };
  }
  if (!row.approved_at) {
    return { ok: false, reason: "provider_not_active", status, provider: null };
  }

  return {
    ok: true,
    reason: null,
    status,
    provider: { userId: row.user_id, providerId: row.provider_id, status },
  };
}

/**
 * Loads the caller's provider profile with the service-role client and applies
 * `evaluateProviderGate`. Returns a 403 `Response` to short-circuit the handler
 * when the provider may not operate.
 */
export async function requireActiveProvider(
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
  options: ProviderGateOptions = {},
): Promise<ActiveProviderContext | Response> {
  const deny = (reason: ProviderGateReason, status: string | null) =>
    new Response(
      JSON.stringify({ error: "provider_not_active", reason, provider_status: status }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  const { data, error } = await ctx.admin
    .from("provider_profiles")
    .select("user_id, provider_id, status, suspended_at, rejected_at, archived_at, approved_at")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  // Fail closed: a failed lookup must never be treated as "active".
  if (error) return deny("provider_lookup_failed", null);

  const result = evaluateProviderGate((data as ProviderRow | null) ?? null, options);
  if (!result.ok) return deny(result.reason!, result.status);
  return result.provider!;
}
