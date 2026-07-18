// Append-only audit log helper. Never throws — auditing must not break a flow.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface AuditEntry {
  actor_user_id?: string | null;
  actor_role?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  booking_id?: string | null;
  previous_state?: unknown;
  new_state?: unknown;
  refund_amount?: number | null;
  currency?: string | null;
  stripe_refund_id?: string | null;
  stripe_payment_intent_id?: string | null;
  metadata?: Record<string, unknown>;
}

/** Extracts best-effort client identity from an incoming Request. */
export function requestFingerprint(req: Request) {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent") ?? null;
  return { ip, ua };
}

export async function writeAudit(
  admin: SupabaseClient,
  req: Request | null,
  entry: AuditEntry,
): Promise<void> {
  try {
    const fp = req ? requestFingerprint(req) : { ip: null, ua: null };
    await admin.from("admin_audit_log").insert({
      ...entry,
      ip_address: fp.ip,
      user_agent: fp.ua,
    });
  } catch (e) {
    console.error("audit_write_failed", (e as Error).message);
  }
}
