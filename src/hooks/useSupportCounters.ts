import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const qc = useQueryClient();
  const query = useQuery({
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

  // Live invalidation on conversation activity — cheap and RLS-safe.
  useEffect(() => {
    const ch = supabase
      .channel("support-counters-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => qc.invalidateQueries({ queryKey: ["support", "counters"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => qc.invalidateQueries({ queryKey: ["support", "counters"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Reflect unread count in the tab title so agents notice off-tab.
  useEffect(() => {
    const unread = query.data?.unread ?? 0;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => { document.title = document.title.replace(/^\(\d+\)\s*/, ""); };
  }, [query.data?.unread]);

  return query;
}
