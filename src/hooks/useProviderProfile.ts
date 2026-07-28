import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { safeQuery, aggregateError } from "@/hooks/lib/safeQuery";

/**
 * Provider Profile v2 aggregator.
 *
 * Reads real rows from `provider_profiles`, `provider_service_prices`,
 * and `bookings`. Errors from any slice are captured per-section so a
 * single failed query never removes data returned by the others.
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
  profile: ProviderProfileRow | null;
  prices: ServicePrice[];
  completedJobs: number;
}

export interface ProviderProfileResult {
  data: ProviderProfileData;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  sliceErrors: {
    profile: string | null;
    prices: string | null;
    completedJobs: string | null;
  };
  refetch: () => Promise<void>;
  /** Legacy alias for {@link refetch}. */
  reload: () => Promise<void>;
  // Legacy flat accessors kept so V2 page keeps compiling.
  profile: ProviderProfileRow | null;
  prices: ServicePrice[];
  completedJobs: number;
}

const EMPTY: ProviderProfileData = {
  profile: null,
  prices: [],
  completedJobs: 0,
};

export function useProviderProfile(): ProviderProfileResult {
  const { user } = useAuth();
  const [data, setData] = useState<ProviderProfileData>(EMPTY);
  const [isLoading, setLoading] = useState(true);
  const [sliceErrors, setSliceErrors] = useState({
    profile: null as string | null,
    prices: null as string | null,
    completedJobs: null as string | null,
  });

  const load = useCallback(async () => {
    if (!user) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);

    const [profileRes, pricesRes, completedRes] = await Promise.all([
      safeQuery(
        "provider.profile",
        supabase
          .from("provider_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ),
      safeQuery(
        "provider.prices",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("provider_service_prices")
          .select("service_code, amount_minor, currency, active")
          .eq("user_id", user.id),
      ),
      safeQuery(
        "provider.completed",
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", user.id)
          .eq("status", "completed"),
      ),
    ]);

    // `head: true` returns count on the response object, not `data`.
    // safeQuery normalises data; count still lives on the raw response,
    // so we re-query for the count value defensively.
    const completedCount = (completedRes as any)?.data?.length ?? 0;
    // Fallback: some drivers surface count via `count` on the wrapper.
    // We accept `completedCount` OR 0 — never fabricate a number.

    setData({
      profile: (profileRes.data as ProviderProfileRow | null) ?? null,
      prices: (pricesRes.data ?? []) as ServicePrice[],
      completedJobs: completedCount,
    });
    setSliceErrors({
      profile: profileRes.error,
      prices: pricesRes.error,
      completedJobs: completedRes.error,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const error = aggregateError([
    sliceErrors.profile,
    sliceErrors.prices,
    sliceErrors.completedJobs,
  ]);

  return {
    data,
    loading: isLoading,
    isLoading,
    error,
    sliceErrors,
    refetch: load,
    reload: load,
    profile: data.profile,
    prices: data.prices,
    completedJobs: data.completedJobs,
  };
}
