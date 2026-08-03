import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * useProviderProfileEditor — owns the load / dirty / save cycle for
 * native V2 provider profile section editors. Enforces the same
 * owner-editable whitelist as the legacy editor so the DB trigger
 * `provider_profiles_block_privileged_update` never rejects a save.
 */
export const OWNER_EDITABLE_COLUMNS = [
  "display_name", "headline", "bio", "public_bio", "photo_path",
  "languages", "years_experience", "hourly_rate", "service_categories",
  "service_area_radius_km", "base_address_place_id", "base_address_formatted",
  "base_country_code", "base_lat", "base_lng", "base_validation_source",
  "date_of_birth", "insurance_policy_number", "insurance_expires_on",
  "insurance_doc_path", "equipment_badges", "is_public",
] as const;
export type OwnerCol = typeof OWNER_EDITABLE_COLUMNS[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PP = Record<string, any>;

export interface ProviderEditorApi {
  pp: PP | null;
  loading: boolean;
  saving: boolean;
  dirty: Partial<Record<OwnerCol, unknown>>;
  isDirty: boolean;
  patch: (k: OwnerCol, v: unknown) => void;
  reset: () => void;
  save: (opts?: { silent?: boolean }) => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useProviderProfileEditor(): ProviderEditorApi {
  const { user } = useAuth();
  const [pp, setPp] = useState<PP | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Partial<Record<OwnerCol, unknown>>>({});
  const [baseline, setBaseline] = useState<PP | null>(null);

  const reload = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("provider_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) toast.error("Kunne ikke hente profil");
    setPp((data as PP | null) ?? null);
    setBaseline((data as PP | null) ?? null);
    setDirty({});
    setLoading(false);
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  const patch = useCallback((k: OwnerCol, v: unknown) => {
    setPp((p) => (p ? { ...p, [k]: v } : p));
    setDirty((d) => ({ ...d, [k]: v }));
  }, []);

  const reset = useCallback(() => {
    if (baseline) setPp(baseline);
    setDirty({});
  }, [baseline]);

  const save = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user || Object.keys(dirty).length === 0) return true;
    const payload: Record<string, unknown> = {};
    for (const k of Object.keys(dirty) as OwnerCol[]) {
      if ((OWNER_EDITABLE_COLUMNS as readonly string[]).includes(k)) {
        payload[k] = (dirty as Record<string, unknown>)[k];
      }
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("provider_profiles") as any)
      .update(payload).eq("user_id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message || "Kunne ikke gemme"); return false; }
    setBaseline(pp);
    setDirty({});
    if (!opts?.silent) toast.success("Gemt");
    return true;
  }, [user, dirty, pp]);

  return {
    pp, loading, saving, dirty,
    isDirty: Object.keys(dirty).length > 0,
    patch, reset, save, reload,
  };
}
