import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SupportLayout } from "./SupportLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { Inbox as InboxIcon, MessageSquare, Search } from "lucide-react";

type Scope = "mine" | "unassigned" | "all" | "escalated" | "open" | "resolved";
type Row = {
  id: string; kind: string; status: string; priority: string | null;
  subject: string | null; last_message_at: string | null;
  booking_id: string | null; assigned_support_id: string | null;
};

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "mine",       label: "Mine sager" },
  { id: "unassigned", label: "Ikke tildelte" },
  { id: "open",       label: "Åbne" },
  { id: "escalated",  label: "Eskalerede" },
  { id: "resolved",   label: "Løste" },
  { id: "all",        label: "Alle" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Åben",
  pending_customer: "Afventer kunde",
  pending_provider: "Afventer provider",
  pending_support: "Afventer support",
  escalated: "Eskaleret",
  resolved: "Løst",
  closed: "Lukket",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Lav", normal: "Normal", high: "Høj", urgent: "Akut",
};

function useConversations(scope: Scope, q: string) {
  return useQuery({
    queryKey: ["support", "conversations", scope, q],
    queryFn: async (): Promise<Row[]> => {
      const params = new URLSearchParams({ scope, limit: "50" });
      if (q) params.set("q", q);
      const { data, error } = await supabase.functions.invoke(
        `support-list-conversations?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return (data as { conversations: Row[] })?.conversations ?? [];
    },
    staleTime: 10_000,
  });
}

export default function SupportInboxPage() {
  const [scope, setScope] = useState<Scope>("mine");
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const { data, isLoading, isError, error, refetch, isFetching } = useConversations(scope, committedQ);

  return (
    <SupportLayout title="Support-indbakke" description="Samtaler fra kunder og providere.">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Scope filters */}
        <aside aria-label="Filtre">
          <Card>
            <CardContent className="p-2">
              <nav className="flex lg:flex-col gap-1 overflow-x-auto">
                {SCOPES.map((s) => (
                  <Button
                    key={s.id}
                    variant={scope === s.id ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start whitespace-nowrap"
                    onClick={() => setScope(s.id)}
                    aria-pressed={scope === s.id}
                  >
                    {s.label}
                  </Button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </aside>

        {/* List */}
        <section aria-label="Samtaler" className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setCommittedQ(q.trim()); }}
            role="search"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Søg i emne…"
                className="pl-9"
                aria-label="Søg i samtaler"
              />
            </div>
            <Button type="submit" variant="outline" disabled={isFetching}>Søg</Button>
          </form>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {isError && (
            <Card>
              <CardContent className="p-6 text-sm text-destructive">
                Kunne ikke hente samtaler: {(error as Error).message}
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
                  Prøv igen
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <InboxIcon className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden />
                <p className="text-sm">Ingen samtaler i denne visning.</p>
              </CardContent>
            </Card>
          )}

          <ul className="space-y-2" role="list">
            {(data ?? []).map((c) => (
              <li key={c.id}>
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-start gap-3">
                    <MessageSquare className="h-4 w-4 mt-1 text-muted-foreground shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium truncate">
                          {c.subject || "Uden emne"}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {STATUS_LABEL[c.status] ?? c.status}
                        </Badge>
                        {c.priority && c.priority !== "normal" && (
                          <Badge
                            variant={c.priority === "urgent" ? "destructive" : "outline"}
                            className="text-xs"
                          >
                            {PRIORITY_LABEL[c.priority] ?? c.priority}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        <span>{c.kind}</span>
                        {c.booking_id && <span>• Booking {c.booking_id.slice(0, 8)}</span>}
                        {c.last_message_at && (
                          <span>
                            • {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: da })}
                          </span>
                        )}
                        {!c.assigned_support_id && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">Ikke tildelt</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SupportLayout>
  );
}
