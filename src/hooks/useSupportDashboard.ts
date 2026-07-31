import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupportCounters } from "./useSupportCounters";

export interface SupportActivityItem {
  event_id: string;
  conversation_id: string;
  event_type: string;
  created_at: string;
  conversation_subject: string | null;
  conversation_status: string | null;
  conversation_priority: string | null;
  assigned_to_me: boolean;
}

export interface SupportDashboardData {
  counters: SupportCounters;
  recent_activity: SupportActivityItem[];
}

const EMPTY_COUNTERS: SupportCounters = {
  mine_open: 0,
  unassigned: 0,
  urgent: 0,
  escalated: 0,
  unread: 0,
};

/**
 * Support workspace dashboard data. Backed by the `support-dashboard` edge
 * function, which enforces the support/admin gate server-side and only
 * returns scrubbed, support-relevant fields.
 */
export function useSupportDashboard(limit = 20) {
  return useQuery({
    queryKey: ["support", "dashboard", limit],
    queryFn: async (): Promise<SupportDashboardData> => {
      const { data, error } = await supabase.functions.invoke(
        `support-dashboard?limit=${limit}`,
        { method: "GET" },
      );
      if (error) throw error;
      const payload = data as Partial<SupportDashboardData> | null;
      return {
        counters: { ...EMPTY_COUNTERS, ...(payload?.counters ?? {}) },
        recent_activity: payload?.recent_activity ?? [],
      };
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
