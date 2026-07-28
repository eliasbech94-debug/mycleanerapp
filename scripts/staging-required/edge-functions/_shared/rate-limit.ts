// Server-side per-user + per-incident rate limiter backed by
// public.incident_evidence_rate_events. Fails CLOSED on DB error.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type RateBucket = "upload_init" | "finalize" | "download";

interface Limit {
  max: number;
  windowMinutes: number;
  scope: "user" | "incident";
}

const LIMITS: Record<RateBucket, Limit> = {
  upload_init: { max: 20, windowMinutes: 60, scope: "user" },
  finalize:    { max: 10, windowMinutes: 60, scope: "incident" },
  download:    { max: 60, windowMinutes: 60, scope: "user" },
};

export interface RateResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

/**
 * Records the event AFTER the check so idempotent retries can be excluded by
 * the caller (do not call `record` if the caller determined the request is a
 * replay of an existing idempotency key).
 */
export async function checkRateLimit(
  admin: SupabaseClient,
  bucket: RateBucket,
  userId: string,
  incidentId: string | null,
): Promise<RateResult> {
  const cfg = LIMITS[bucket];
  const since = new Date(Date.now() - cfg.windowMinutes * 60_000).toISOString();
  const q = admin
    .from("incident_evidence_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .gte("created_at", since);
  const scoped = cfg.scope === "incident" && incidentId
    ? q.eq("incident_id", incidentId)
    : q.eq("user_id", userId);
  const { count, error } = await scoped;
  if (error) return { ok: false, retryAfterSeconds: 60 };
  if ((count ?? 0) >= cfg.max) {
    return { ok: false, retryAfterSeconds: cfg.windowMinutes * 60 };
  }
  return { ok: true };
}

export async function recordRateEvent(
  admin: SupabaseClient,
  bucket: RateBucket,
  userId: string,
  incidentId: string | null,
): Promise<void> {
  await admin.from("incident_evidence_rate_events").insert({
    user_id: userId, incident_id: incidentId, bucket,
  });
}
