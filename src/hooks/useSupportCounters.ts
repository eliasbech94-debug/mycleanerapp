import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SupportCounters {
  mine_open: number;
  unassigned: number;
  urgent: number;
  escalated: number;
  unread: number;
}

const EMPTY: SupportCounters = {
  mine_open: 0,
  unassigned: 0,
  urgent: 0,
  escalated: 0,
  unread: 0,
};

/**
 * Live counters for the support sidebar / header. Polls every 30s and
 * refetches on window focus. Backed by `support-counters` edge function
 * which is gated to support/admin server-side.
 */
export function useSupportCounters() {
  return useQuery({
    queryKey: ["support", "counters"],
    queryFn: async (): Promise<SupportCounters> => {
      const { data, error } = await supabase.functions.invoke("support-counters", {
        method: "GET",
      });
      if (error) throw error;
      const c = (data as { counters?: Partial<SupportCounters> })?.counters ?? {};
      return { ...EMPTY, ...c };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
