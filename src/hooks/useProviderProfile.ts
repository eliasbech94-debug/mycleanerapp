import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Provider Profile v2 aggregator.
 *
 * Reads real rows from `provider_profiles`, `provider_service_prices`,
 * and `bookings`. No mock data. Metrics without a backend source
 * (reviews, gallery, cover photos, trust badges) are surfaced as
 * `null` / empty so the UI can render an honest "Kommer snart" card.
 */

export type ProviderProfileRow = Record<string, unknown> & {
  user_id?: string;
  display_name?: string | null;
  headline?: string | null;
  bio?: string | null;
  public_bio?: string | null;
  photo_path?: string | null;
  languages?: string[] | null;
  years_experience?: number | null;
  hourly_rate?: number | null;
  service_categories?: string[] | null;
  service_area_radius_km?: number | null;
  base_address_formatted?: string | null;
  base_country_code?: string | null;
  provider_slug?: string | null;
  is_public?: boolean | null;
  status?: string | null;
  visibility?: string | null;
  identity_status?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  insurance_policy_number?: string | null;
  insurance_expires_on?: string | null;
  insurance_doc_path?: string | null;
  equipment_badges?: Record<string, boolean> | null;
  completion_pct?: number | null;
  provider_score?: number | null;
  provider_tier?: string | null;
  performance_snapshot?: Record<string, unknown> | null;
};

export type ServicePrice = {
  service_code: string;
  amount_minor: number;
  currency: string;
  active: boolean;
};

export interface ProviderProfileData {
  loading: boolean;
  profile: ProviderProfileRow | null;
  prices: ServicePrice[];
  completedJobs: number;
  reload: () => Promise<void>;
}

const EMPTY: Omit<ProviderProfileData, "reload"> = {
  loading: true,
  profile: null,
  prices: [],
  completedJobs: 0,
};

export function useProviderProfile(): ProviderProfileData {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<ProviderProfileData, "reload">>(EMPTY);

  const load = useCallback(async () => {
    if (!user) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));

    const [profileRes, pricesRes, completedRes] = await Promise.all([
      supabase.from("provider_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      // Generated types refresh async; cast is intentional and narrow.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("provider_service_prices")
        .select("service_code, amount_minor, currency, active")
        .eq("user_id", user.id),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", user.id)
        .eq("status", "completed"),
    ]);

    setState({
      loading: false,
      profile: (profileRes.data as ProviderProfileRow | null) ?? null,
      prices: (pricesRes.data ?? []) as ServicePrice[],
      completedJobs: completedRes.count ?? 0,
    });
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  return { ...state, reload: load };
}
