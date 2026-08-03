import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RevenueBucket {
  gross_minor: number;
  fee_minor: number;
  count: number;
}

export interface MissionControlData {
  generated_at: string;
  currency: string | null;
  currencies: string[];
  revenue: { today: RevenueBucket; week: RevenueBucket; month: RevenueBucket };
  bookings: {
    today: number;
    pending: number;
    active: number;
    completed_30d: number;
    cancelled_30d: number;
    created_30d: number;
    completion_rate: number | null;
    cancellation_rate: number | null;
  };
  people: {
    customers: number;
    providers_active: number;
    new_signups_7d: number;
    pending_review: number;
    pending_identity: number;
    insurance_missing: number;
  };
  support: { open_conversations: number; open_refund_requests: number };
  health: {
    webhooks_24h: number;
    webhooks_failed_24h: number;
    emails_24h: number;
    emails_failed_24h: number;
    sms_failed_24h: number;
    notification_backlog: number;
    errors_24h: number;
    open_alerts: number;
  };
  alerts: Array<{
    id: string;
    title: string;
    severity: string;
    source: string;
    status: string;
    last_seen_at: string;
  }>;
  series: {
    daily: Array<{ date: string; gross_minor: number; fee_minor: number; bookings: number }>;
    countries: Array<{ country_code: string; bookings: number; gross_minor: number }>;
    customer_growth: Array<{ date: string; added: number; cumulative: number }>;
    provider_growth: Array<{ date: string; added: number; cumulative: number }>;
  };
  activity: Array<{
    id: string;
    booking_id: string;
    from_state: string | null;
    to_state: string;
    actor_role: string;
    created_at: string;
    reason: string | null;
  }>;
}

async function fetchMissionControl(): Promise<MissionControlData> {
  const { data, error } = await supabase.functions.invoke<MissionControlData>(
    "admin-mission-control",
    { body: {} },
  );
  if (error) throw error;
  if (!data) throw new Error("Ingen data modtaget");
  return data;
}

/** Live Mission Control metrics. Auto-refreshes so the console stays current. */
export function useMissionControlData() {
  return useQuery({
    queryKey: ["mission-control", "overview"],
    queryFn: fetchMissionControl,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export interface SearchHit {
  type: "booking" | "customer" | "provider" | "conversation";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export function useGlobalSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["mission-control", "search", q],
    enabled: q.length >= 2,
    staleTime: 15_000,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await supabase.functions.invoke<{ results: SearchHit[] }>(
        "admin-global-search",
        { body: { q } },
      );
      if (error) throw error;
      return data?.results ?? [];
    },
  });
}
