// Snapshots specific tables so scenarios can diff before/after.
import { psqlJson } from "./supabase-admin.js";
import { saveJson } from "./reporter.js";

const TABLES = [
  "profiles", "user_roles", "provider_profiles", "provider_trust",
  "bookings", "stripe_webhook_events", "admin_audit_log",
  "finance_payouts", "identity_webhook_events",
  "notification_outbox", "provider_score_history",
];

export interface Snapshot {
  taken_at: string;
  counts: Record<string, number>;
}

export function snapshotCounts(label: string): Snapshot {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = psqlJson<{ n: number }>(`select count(*)::int as n from public.${t}`);
    counts[t] = rows[0]?.n ?? 0;
  }
  const snap: Snapshot = { taken_at: new Date().toISOString(), counts };
  saveJson(`db/${label}.json`, snap);
  return snap;
}

export function diff(before: Snapshot, after: Snapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(after.counts)) {
    const d = after.counts[k] - (before.counts[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}
