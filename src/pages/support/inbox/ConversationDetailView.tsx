import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { AlertCircle, ArrowLeft, Loader2, MessageSquare, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationDetail } from "@/hooks/useConversationDetail";
import { MessageTimeline } from "./MessageTimeline";

interface Props {
  conversationId: string | null;
  onDetail: (detail: ReturnType<typeof useConversationDetail>["detail"]) => void;
  showBack?: boolean;
}

export function ConversationDetailView({ conversationId, onDetail, showBack }: Props) {
  const nav = useNavigate();
  const state = useConversationDetail(conversationId);
  const { detail, loading, error, hasMoreOlder, loadingOlder, loadOlder,
          latestMessageId, markRead, realtimeStatus } = state;

  // Bubble detail up so the outer layout can render the context panel.
  // Using useEffect avoids re-render loops.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffectOnChange(detail, () => onDetail(detail));

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8 text-muted-foreground">
        <div className="space-y-2 max-w-sm">
          <MessageSquare className="h-10 w-10 mx-auto opacity-40" aria-hidden />
          <p className="text-sm">Vælg en samtale for at se detaljer.</p>
        </div>
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="flex-1 p-4 space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-3/4" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2 max-w-sm">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" aria-hidden />
          <p className="text-sm">Kunne ikke hente samtalen.</p>
          <p className="text-xs text-muted-foreground break-all">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => nav(0)}>Prøv igen</Button>
        </div>
      </div>
    );
  }

  if (!detail) return null;
  const conv = detail.conversation;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <header className="border-b p-3 flex items-start gap-3">
        {showBack && (
          <Button
            variant="ghost" size="icon"
            onClick={() => nav("/support/inbox")}
            aria-label="Tilbage til indbakke"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-medium truncate">
              {conv.subject || "Uden emne"}
            </h2>
            <Badge variant="outline" className="text-[10px]">{conv.status}</Badge>
            {conv.priority && <Badge variant="secondary" className="text-[10px]">{conv.priority}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Oprettet {format(new Date(conv.created_at), "d. MMM yyyy HH:mm", { locale: da })} · {conv.kind}
          </p>
        </div>
        <RealtimeIndicator status={realtimeStatus} />
      </header>

      <MessageTimeline
        messages={detail.messages}
        events={detail.events}
        hasMoreOlder={hasMoreOlder}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        latestMessageId={latestMessageId}
        onLatestVisible={(id) => {
          if (detail.read?.last_read_message_id !== id) markRead(id);
        }}
      />

      <footer className="border-t p-3 bg-muted/30">
        <p className="text-xs text-muted-foreground italic text-center">
          Svar, tildeling, status og prioritet aktiveres i næste fase.
        </p>
      </footer>
    </div>
  );
}

function RealtimeIndicator({ status }: { status: "connecting" | "live" | "error" }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-destructive" title="Genopretter forbindelse">
        <WifiOff className="h-3 w-3" /> Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Forbinder
    </span>
  );
}

// Small helper — invoke callback whenever value's reference changes.
import { useEffect, useRef } from "react";
function useEffectOnChange<T>(value: T, cb: () => void) {
  const prev = useRef<T | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      cb();
    }
  });
}
