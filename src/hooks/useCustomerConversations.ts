/**
 * useCustomerConversations — participant-scoped conversation list for
 * mobile inbox surfaces. Delegates authorization to the `conversation-list`
 * edge function which enforces RLS and participant scoping server-side.
 *
 * No new tables or endpoints — this is a thin client hook over existing
 * trusted infrastructure. Realtime updates piggyback on the shared
 * `conversations` channel (RLS filters payloads server-side).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InboxConversationRow {
  id: string;
  kind: string;
  status: string;
  subject: string | null;
  last_message_at: string | null;
  customer_user_id: string | null;
  provider_user_id: string | null;
  updated_at: string;
}

export interface UseCustomerConversationsResult {
  conversations: InboxConversationRow[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useCustomerConversations(): UseCustomerConversationsResult {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<InboxConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "conversation-list?scope=mine&limit=50",
        { method: "GET" },
      );
      if (fnErr) throw fnErr;
      const rows = ((data as any)?.conversations ?? []) as InboxConversationRow[];
      setConversations(rows);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    // Clear rows on user change to avoid leaking a prior session's data
    // while the new list loads.
    setConversations([]);
    refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`inbox:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  return { conversations, loading, error, refresh };
}
