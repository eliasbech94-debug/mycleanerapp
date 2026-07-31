import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { SenderType } from "@/lib/conversations/senderType";

export type MessageRole = "customer" | "provider" | "support" | "admin" | "system";
export type MessageType = "text" | "system" | "attachment" | "note";

export interface MessageAttachment {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
}

export interface ConversationMessage {
  id: string;
  sender_user_id: string | null;
  sender_role: MessageRole;
  /**
   * Authoritative, immutable sender classification. AI labelling in the UI is
   * driven by this field only — never by analysing `body`.
   */
  sender_type?: SenderType | null;
  /** AI wrote the draft; a human reviewed and sent it (audit only, not shown as AI). */
  ai_drafted?: boolean | null;
  ai_draft_reviewed_by?: string | null;
  message_type: MessageType;
  body: string | null;
  is_internal_note: boolean;
  reply_to_message_id: string | null;
  edited_at: string | null;
  created_at: string;
  message_attachments?: MessageAttachment[];
  /** Client-only fields for optimistic composer messages. */
  _optimistic?: boolean;
  _failed?: boolean;
  _tempId?: string;
}


export interface ConversationEvent {
  id: string;
  conversation_id: string;
  actor_user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ConversationDetail {
  conversation: any;
  participants: any[];
  tags: any[];
  read: { last_read_message_id: string | null; last_read_at: string | null } | null;
  messages: ConversationMessage[];
  events: ConversationEvent[] | null;
}

const PAGE = 40;

async function fetchPage(id: string, cursor: string | null): Promise<ConversationDetail> {
  const params = new URLSearchParams({ id, limit: String(PAGE) });
  if (cursor) params.set("cursor", cursor);
  const { data, error } = await supabase.functions.invoke(
    `conversation-get?${params.toString()}`,
    { method: "GET" },
  );
  if (error) throw error;
  return data as ConversationDetail;
}

/**
 * Detail hook for the active conversation.
 * - Cursor pagination: initial page = newest N, "load older" prepends.
 * - Realtime: only subscribes to the active conversation; RLS on `messages`
 *   filters out internal notes for non-staff clients server-side.
 * - Does NOT auto-mark-read; caller must invoke `markRead(latestId)` after
 *   the newest message is actually visible on screen.
 */
export function useConversationDetail(conversationId: string | null) {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [rtStatus, setRtStatus] = useState<"connecting" | "live" | "error">("connecting");
  const currentId = useRef<string | null>(null);

  useEffect(() => {
    currentId.current = conversationId;
    setDetail(null);
    setError(null);
    setOlderCursor(null);
    setHasMoreOlder(false);
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    fetchPage(conversationId, null)
      .then((d) => {
        if (cancelled || currentId.current !== conversationId) return;
        setDetail(d);
        if (d.messages.length >= PAGE) {
          setOlderCursor(d.messages[0]?.created_at ?? null);
          setHasMoreOlder(true);
        }
      })
      .catch((e) => !cancelled && setError(e as Error))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await fetchPage(conversationId, olderCursor);
      if (currentId.current !== conversationId) return;
      setDetail((prev) => {
        if (!prev) return prev;
        const existing = new Set(prev.messages.map((m) => m.id));
        const merged = [
          ...older.messages.filter((m) => !existing.has(m.id)),
          ...prev.messages,
        ];
        return { ...prev, messages: merged };
      });
      if (older.messages.length < PAGE) {
        setHasMoreOlder(false);
      } else {
        setOlderCursor(older.messages[0]?.created_at ?? null);
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, olderCursor, loadingOlder]);

  // Realtime: scoped to the active conversation only.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages",
          filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as ConversationMessage;
          setDetail((prev) => {
            if (!prev) return prev;
            if (m.is_internal_note && !prev.conversation) return prev;
            // Dedupe by real id
            if (prev.messages.some((x) => x.id === m.id)) return prev;
            // Reconcile optimistic sends from the same sender:
            //   we don't have a tempId in the payload, so we match on
            //   (sender_user_id, body, created_at±5s, is_internal_note).
            const idx = prev.messages.findIndex(
              (x) =>
                x._optimistic &&
                x.sender_user_id === m.sender_user_id &&
                x.is_internal_note === m.is_internal_note &&
                (x.body ?? "") === (m.body ?? "") &&
                Math.abs(
                  new Date(x.created_at).getTime() - new Date(m.created_at).getTime(),
                ) < 15_000,
            );
            if (idx >= 0) {
              const messages = [...prev.messages];
              messages[idx] = { ...m };
              return { ...prev, messages };
            }
            return { ...prev, messages: [...prev.messages, m] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages",
          filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as ConversationMessage;
          setDetail((prev) => {
            if (!prev) return prev;
            const messages = prev.messages.map((x) => (x.id === m.id ? { ...x, ...m } : x));
            return { ...prev, messages };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_events",
          filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const ev = payload.new as ConversationEvent;
          setDetail((prev) => {
            if (!prev) return prev;
            if (prev.events?.some((x) => x.id === ev.id)) return prev;
            const events = prev.events ? [ev, ...prev.events] : [ev];
            return { ...prev, events };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations",
          filter: `id=eq.${conversationId}` },
        (payload) => {
          const c = payload.new as any;
          setDetail((prev) => {
            if (!prev) return prev;
            return { ...prev, conversation: { ...prev.conversation, ...c } };
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRtStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRtStatus("error");
        } else {
          setRtStatus("connecting");
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // ---- Optimistic composer helpers ----
  const addOptimistic = useCallback((partial: {
    tempId: string; body: string; is_internal_note: boolean;
    sender_user_id: string; sender_role: MessageRole; created_at: string;
    attachment?: { original_filename: string; mime_type: string; size_bytes: number };
  }) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const msg: ConversationMessage = {
        id: partial.tempId,
        sender_user_id: partial.sender_user_id,
        sender_role: partial.sender_role,
        message_type: partial.attachment ? "attachment" : "text",
        body: partial.body || null,
        is_internal_note: partial.is_internal_note,
        reply_to_message_id: null,
        edited_at: null,
        created_at: partial.created_at,
        message_attachments: partial.attachment
          ? [{
              id: `${partial.tempId}-a`,
              original_filename: partial.attachment.original_filename,
              mime_type: partial.attachment.mime_type,
              size_bytes: partial.attachment.size_bytes,
              storage_path: "",
            }]
          : undefined,
        _optimistic: true,
        _tempId: partial.tempId,
      };
      return { ...prev, messages: [...prev.messages, msg] };
    });
  }, []);

  const confirmOptimistic = useCallback((tempId: string, real: { id: string; created_at: string }) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const idx = prev.messages.findIndex((m) => m._tempId === tempId);
      if (idx < 0) return prev;
      // If realtime already inserted the real message, drop the optimistic one.
      if (prev.messages.some((m) => m.id === real.id)) {
        const messages = prev.messages.filter((m) => m._tempId !== tempId);
        return { ...prev, messages };
      }
      const messages = [...prev.messages];
      messages[idx] = {
        ...messages[idx],
        id: real.id,
        created_at: real.created_at,
        _optimistic: false,
        _tempId: undefined,
      };
      return { ...prev, messages };
    });
  }, []);

  const failOptimistic = useCallback((tempId: string) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const messages = prev.messages.map((m) =>
        m._tempId === tempId ? { ...m, _failed: true } : m,
      );
      return { ...prev, messages };
    });
    // Remove failed placeholder after a short delay — composer restores content for retry.
    setTimeout(() => {
      setDetail((prev) => {
        if (!prev) return prev;
        return { ...prev, messages: prev.messages.filter((m) => m._tempId !== tempId) };
      });
    }, 100);
  }, []);



  const markRead = useCallback(
    async (lastMessageId: string) => {
      if (!conversationId) return;
      // Optimistic
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              read: {
                last_read_message_id: lastMessageId,
                last_read_at: new Date().toISOString(),
              },
            }
          : prev,
      );
      try {
        await supabase.functions.invoke("conversation-mark-read", {
          body: { conversation_id: conversationId, last_read_message_id: lastMessageId },
        });
        qc.invalidateQueries({ queryKey: ["support", "counters"] });
      } catch (e) {
        console.warn("mark-read failed", e);
      }
    },
    [conversationId, qc],
  );

  const latestMessageId = useMemo(
    () => (detail?.messages.length ? detail.messages[detail.messages.length - 1].id : null),
    [detail?.messages],
  );

  return {
    detail,
    loading,
    error,
    loadOlder,
    hasMoreOlder,
    loadingOlder,
    markRead,
    latestMessageId,
    realtimeStatus: rtStatus,
    addOptimistic,
    confirmOptimistic,
    failOptimistic,
  };
}

