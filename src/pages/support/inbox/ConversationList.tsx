import { useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, Inbox as InboxIcon } from "lucide-react";
import type { ConversationRow } from "@/hooks/useSupportConversations";

const STATUS_TONE: Record<string, string> = {
  open: "bg-primary/10 text-primary border-primary/20",
  pending_customer: "bg-muted text-muted-foreground",
  pending_provider: "bg-muted text-muted-foreground",
  pending_support: "bg-warning/10 text-warning-foreground border-warning/20",
  escalated: "bg-destructive/10 text-destructive border-destructive/20",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
};

const PRIO_TONE: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

const KIND_LABEL: Record<string, string> = {
  customer_support: "Kunde",
  provider_support: "Provider",
  dispute: "Tvist",
  internal: "Intern",
  booking: "Booking",
};

interface Props {
  rows: ConversationRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function ConversationList({
  rows, activeId, onSelect, loading, error,
  hasNextPage, isFetchingNextPage, fetchNextPage,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  if (loading && !rows.length) {
    return (
      <ul className="divide-y" aria-busy>
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="p-3 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex flex-col items-start gap-2 text-sm">
        <div className="inline-flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" /> Kunne ikke hente samtaler.
        </div>
        <p className="text-muted-foreground text-xs break-all">{error.message}</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-8 flex flex-col items-center text-center text-muted-foreground gap-2">
        <InboxIcon className="h-10 w-10 opacity-40" aria-hidden />
        <p className="text-sm">Ingen samtaler i dette filter.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y" role="listbox" aria-label="Samtaler">
      {rows.map((r) => {
        const active = r.id === activeId;
        return (
          <li key={r.id}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(r.id)}
              className={cn(
                "w-full text-left p-3 space-y-1 transition-colors focus:outline-none focus:bg-muted",
                active ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium line-clamp-1">
                  {r.subject || KIND_LABEL[r.kind] || "Uden emne"}
                </span>
                {r.last_message_at && (
                  <time
                    className="text-[11px] text-muted-foreground shrink-0 tabular-nums"
                    dateTime={r.last_message_at}
                    title={new Date(r.last_message_at).toLocaleString("da-DK")}
                  >
                    {formatDistanceToNow(new Date(r.last_message_at), { locale: da, addSuffix: false })}
                  </time>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant="outline" className={cn("text-[10px] font-normal py-0 px-1.5", STATUS_TONE[r.status])}>
                  {r.status}
                </Badge>
                {r.priority && PRIO_TONE[r.priority] && (
                  <Badge className={cn("text-[10px] font-normal py-0 px-1.5", PRIO_TONE[r.priority])}>
                    {r.priority}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {KIND_LABEL[r.kind] ?? r.kind}
                </span>
                {!r.assigned_support_id && (
                  <span className="text-[10px] text-muted-foreground">· ikke tildelt</span>
                )}
              </div>
            </button>
          </li>
        );
      })}
      <li ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-muted-foreground">
        {isFetchingNextPage && "Henter flere…"}
        {!hasNextPage && rows.length >= 20 && "Slut på listen"}
      </li>
    </ul>
  );
}
