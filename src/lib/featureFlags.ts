// Client-safe feature-flag evaluator. Never reads the raw feature_flags table
// (that table is admin-only per Security Hardening Phase 1). Instead calls the
// server-side SECURITY DEFINER RPC `evaluate_feature_flag`, which only returns
// a boolean and never leaks rollout percentages, seeds or targeting metadata.
import { supabase } from "@/integrations/supabase/client";

export async function hasFlag(
  key: string,
  ctx: { userId?: string; providerId?: string; countryIso?: string },
): Promise<boolean> {
  if (!key) return false;
  const { data, error } = await supabase.rpc("evaluate_feature_flag", {
    _flag_key: key,
    _user_id: ctx.userId ?? null,
    _provider_id: ctx.providerId ?? null,
    _country_iso: ctx.countryIso ?? null,
  });
  if (error) return false;
  return data === true;
}
