import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SupportScope = "mine" | "unassigned" | "open" | "escalated" | "resolved" | "all";

export interface ConversationRow {
  id: string;
  kind: string;
  status: string;
  priority: string | null;
  subject: string | null;
  last_message_at: string | null;
  booking_id: string | null;
  customer_user_id: string | null;
  provider_user_id: string | null;
  assigned_support_id: string | null;
  updated_at: string;
  country_code?: string | null;
}

interface Page {
  conversations: ConversationRow[];
  nextCursor: string | null;
}

const PAGE_SIZE = 40;

/**
 * Cursor-paginated support conversation list.
 * - Uses `support-list-conversations` (staff-scoped, RLS-enforced).
 * - Subscribes to Realtime UPDATE events on `conversations`; only rows
 *   already present in the cache are patched, so we never leak conversations
 *   the user is not allowed to see (RLS filters realtime payloads server-side).
 */
export function useSupportConversations(scope: SupportScope, search: string) {
  const qc = useQueryClient();
  const queryKey = ["support", "conversations", scope, search] as const;

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page) => last.nextCursor,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const params = new URLSearchParams({ scope, limit: String(PAGE_SIZE) });
      if (search.trim()) params.set("q", search.trim());
      if (pageParam) params.set("cursor", pageParam);
      const { data, error } = await supabase.functions.invoke(
        `support-list-conversations?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return {
        conversations: (data as any)?.conversations ?? [],
        nextCursor: (data as any)?.nextCursor ?? null,
      };
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`support-inbox:${scope}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => {
          const next = payload.new as ConversationRow;
          // Patch only rows already visible in the cache; do not append new IDs
          // (a full refetch would be required, and we let cursor pagination handle that).
          qc.setQueryData<{ pages: Page[]; pageParams: unknown[] }>(queryKey, (prev) => {
            if (!prev) return prev;
            let touched = false;
            const pages = prev.pages.map((p) => {
              const idx = p.conversations.findIndex((c) => c.id === next.id);
              if (idx === -1) return p;
              touched = true;
              const conversations = [...p.conversations];
              conversations[idx] = { ...conversations[idx], ...next };
              return { ...p, conversations };
            });
            return touched ? { ...prev, pages } : prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [scope, qc, queryKey.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.conversations) ?? [],
    [query.data],
  );

  return { ...query, rows };
}
