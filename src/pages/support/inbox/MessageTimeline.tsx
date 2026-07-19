import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, ChevronUp, FileText, ImageIcon, Loader2 } from "lucide-react";
import type { ConversationEvent, ConversationMessage, MessageAttachment, MessageRole } from "@/hooks/useConversationDetail";
import { getAttachmentUrl } from "@/lib/support/attachments";

const ROLE_LABEL: Record<MessageRole, string> = {
  customer: "Kunde",
  provider: "Provider",
  support: "Support",
  admin: "Admin",
  system: "System",
};

const ROLE_TONE: Record<MessageRole, string> = {
  customer:  "border-l-primary bg-primary/[0.03]",
  provider:  "border-l-teal-500 bg-teal-500/[0.03]",
  support:   "border-l-amber-500 bg-amber-500/[0.04]",
  admin:     "border-l-purple-500 bg-purple-500/[0.04]",
  system:    "border-l-muted bg-muted/40",
};

interface TimelineItem {
  kind: "message" | "event";
  at: string;
  message?: ConversationMessage;
  event?: ConversationEvent;
}

interface Props {
  messages: ConversationMessage[];
  events: ConversationEvent[] | null;
  hasMoreOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  latestMessageId: string | null;
  onLatestVisible: (id: string) => void;
}

export function MessageTimeline({
  messages, events, hasMoreOlder, loadingOlder, onLoadOlder,
  latestMessageId, onLatestVisible,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLLIElement | null>(null);
  const prevScrollHeight = useRef<number>(0);
  const initialScrolled = useRef<boolean>(false);

  const items = useMemo<TimelineItem[]>(() => {
    const list: TimelineItem[] = messages.map((m) => ({ kind: "message", at: m.created_at, message: m }));
    if (events) {
      for (const e of events) list.push({ kind: "event", at: e.created_at, event: e });
    }
    list.sort((a, b) => a.at.localeCompare(b.at));
    return list;
  }, [messages, events]);

  // Preserve scroll position when older messages are prepended.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!initialScrolled.current && messages.length) {
      el.scrollTop = el.scrollHeight;
      initialScrolled.current = true;
      prevScrollHeight.current = el.scrollHeight;
      return;
    }
    if (loadingOlder) return;
    if (prevScrollHeight.current && el.scrollHeight > prevScrollHeight.current) {
      const nearBottom =
        el.scrollTop + el.clientHeight >= prevScrollHeight.current - 80;
      if (nearBottom) {
        el.scrollTop = el.scrollHeight; // new incoming message and user was at bottom
      } else {
        // older prepended: adjust scrollTop to keep viewport steady
        el.scrollTop += el.scrollHeight - prevScrollHeight.current;
      }
    }
    prevScrollHeight.current = el.scrollHeight;
  }, [messages.length, events?.length, loadingOlder]);

  // Auto-load older when top sentinel is visible inside the scroll container.
  useEffect(() => {
    const top = topRef.current;
    const root = scrollRef.current;
    if (!top || !root || !hasMoreOlder) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingOlder) onLoadOlder();
      },
      { root, rootMargin: "80px 0px 0px 0px" },
    );
    io.observe(top);
    return () => io.disconnect();
  }, [hasMoreOlder, loadingOlder, onLoadOlder]);

  // Fire "latest visible" only when the newest message is actually painted on-screen.
  useEffect(() => {
    const bottom = bottomRef.current;
    const root = scrollRef.current;
    if (!bottom || !root || !latestMessageId) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLatestVisible(latestMessageId);
      },
      { root, threshold: 0.9 },
    );
    io.observe(bottom);
    return () => io.disconnect();
  }, [latestMessageId, onLatestVisible]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
      <div ref={topRef} className="p-3 text-center">
        {hasMoreOlder ? (
          <Button
            variant="ghost" size="sm" onClick={onLoadOlder} disabled={loadingOlder}
            className="text-xs"
          >
            <ChevronUp className="h-3 w-3 mr-1" />
            {loadingOlder ? "Henter…" : "Hent ældre beskeder"}
          </Button>
        ) : messages.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">Samtalens start</span>
        ) : null}
      </div>

      <ul className="px-3 pb-4 space-y-3">
        {items.map((it, i) => {
          if (it.kind === "event" && it.event) {
            return (
              <li key={`e-${it.event.id}`} className="text-center">
                <span className="inline-block text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                  {format(new Date(it.at), "d. MMM HH:mm", { locale: da })} — {formatEvent(it.event)}
                </span>
              </li>
            );
          }
          const m = it.message!;
          const isLast = i === items.length - 1;
          const isSystem = m.sender_role === "system" || m.message_type === "system";

          if (isSystem) {
            return (
              <li key={m.id} className="text-center" ref={isLast ? bottomRef : undefined}>
                <span className="inline-block text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                  {format(new Date(m.created_at), "d. MMM HH:mm", { locale: da })} — {m.body}
                </span>
              </li>
            );
          }

          return (
            <li key={m._tempId ?? m.id} ref={isLast ? bottomRef : undefined}>
              <article
                className={cn(
                  "rounded-md border-l-4 border border-border/60 p-3 space-y-1",
                  ROLE_TONE[m.sender_role],
                  m.is_internal_note && "border-l-amber-600 bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-500/20",
                  m._optimistic && !m._failed && "opacity-70",
                  m._failed && "ring-1 ring-destructive/50",
                )}
                data-optimistic={m._optimistic ? "true" : undefined}
              >
                <header className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{ROLE_LABEL[m.sender_role] ?? m.sender_role}</span>
                  <time className="text-muted-foreground tabular-nums" dateTime={m.created_at}>
                    {format(new Date(m.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                  </time>
                  {m.edited_at && <span className="text-muted-foreground italic">(redigeret)</span>}
                  {m._optimistic && !m._failed && (
                    <span className="text-muted-foreground italic">(sender…)</span>
                  )}
                  {m._failed && (
                    <span className="text-destructive font-medium">Fejl — prøv igen</span>
                  )}
                  {m.is_internal_note && (
                    <span className="ml-auto inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-[11px] font-medium">
                      <Lock className="h-3 w-3" aria-hidden />
                      Intern note
                    </span>
                  )}
                </header>
                {m.is_internal_note && (
                  <div
                    role="note"
                    className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 border-b border-amber-500/20 pb-1"
                  >
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                    <span>Kun synlig for support og administrator.</span>
                  </div>
                )}
                {m.body && (
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {m.body}
                  </p>
                )}
                {m.message_attachments && m.message_attachments.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {m.message_attachments.map((a) => (
                      <AttachmentChip key={a.id} attachment={a} optimistic={!!m._optimistic} />
                    ))}
                  </ul>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatEvent(ev: ConversationEvent): string {
  const map: Record<string, string> = {
    created: "Samtale oprettet",
    assigned: "Tildelt support",
    unassigned: "Tildeling fjernet",
    status_changed: "Status ændret",
    priority_changed: "Prioritet ændret",
    tag_added: "Tag tilføjet",
    tag_removed: "Tag fjernet",
    escalated: "Eskaleret",
    resolved: "Løst",
    reopened: "Genåbnet",
    refund_requested: "Refusion anmodet",
    legacy_migrated: "Migreret fra gammel tråd",
    participant_joined: "Deltager tilføjet",
    participant_left: "Deltager fjernet",
  };
  return map[ev.event_type] ?? ev.event_type;
}
