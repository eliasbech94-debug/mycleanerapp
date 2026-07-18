// Deterministic feature-flag helper. Percentage rollout uses a stable SHA-256
// hash of (flag_key, subject_id, rollout_seed) so the same subject always
// gets the same answer. Precedence: user → provider → country → beta → global.
import { supabase } from "@/integrations/supabase/client";

export type FlagScope = "user" | "provider" | "country" | "beta" | "global";

async function stableHashPct(input: string): Promise<number> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const view = new DataView(digest);
  // Take first 4 bytes → 0..2^32-1 → normalise to 0..99
  return view.getUint32(0) % 100;
}

interface FlagRow {
  flag_key: string;
  scope: FlagScope;
  target_id: string | null;
  enabled: boolean;
  rollout_pct: number;
  rollout_seed: string | null;
}

async function evaluate(row: FlagRow, subjectId: string): Promise<boolean> {
  if (!row.enabled) return false;
  if (row.rollout_pct >= 100) return true;
  const bucket = await stableHashPct(`${row.flag_key}:${subjectId}:${row.rollout_seed ?? ""}`);
  return bucket < row.rollout_pct;
}

export async function hasFlag(
  key: string,
  ctx: { userId?: string; providerId?: string; countryIso?: string },
): Promise<boolean> {
  const { data } = await supabase.from("feature_flags").select("*").eq("flag_key", key);
  const rows = (data ?? []) as FlagRow[];
  const pick = (scope: FlagScope, target: string | null) =>
    rows.find(r => r.scope === scope && (r.target_id ?? null) === target);

  // Precedence: user → provider → country → beta → global
  const ordered = [
    ctx.userId ? pick("user", ctx.userId) : undefined,
    ctx.providerId ? pick("provider", ctx.providerId) : undefined,
    ctx.countryIso ? pick("country", ctx.countryIso.toUpperCase()) : undefined,
    pick("beta", null),
    pick("global", null),
  ].filter(Boolean) as FlagRow[];

  for (const row of ordered) {
    const subject = ctx.userId ?? ctx.providerId ?? ctx.countryIso ?? "anon";
    return await evaluate(row, subject);
  }
  return false;
}
