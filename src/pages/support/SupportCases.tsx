import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SupportLayout } from "./SupportLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";

type Row = {
  id: string; kind: string; status: string; priority: string | null;
  subject: string | null; last_message_at: string | null;
  booking_id: string | null; assigned_support_id: string | null;
};

const STATUS_TABS = [
  { id: "open", label: "Åbne" },
  { id: "escalated", label: "Eskalerede" },
  { id: "resolved", label: "Løste" },
  { id: "closed", label: "Lukkede" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  open: "Åben", pending_customer: "Afventer kunde", pending_provider: "Afventer provider",
  pending_support: "Afventer support", escalated: "Eskaleret", resolved: "Løst", closed: "Lukket",
};

export default function SupportCasesPage() {
  const [tab, setTab] = useState<typeof STATUS_TABS[number]["id"]>("open");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["support", "cases", tab],
    queryFn: async (): Promise<Row[]> => {
      const params = new URLSearchParams({ status: tab, scope: "all", limit: "100" });
      const { data, error } = await supabase.functions.invoke(
        `support-list-conversations?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return (data as { conversations: Row[] })?.conversations ?? [];
    },
  });

  return (
    <SupportLayout title="Sager" description="Aktive, eskalerede, løste og lukkede sager.">
      <div className="flex gap-1 mb-4 border-b">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {isError && (
        <Card><CardContent className="p-6 text-sm text-destructive">
          Fejl: {(error as Error).message}
        </CardContent></Card>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">
          Ingen sager i denne visning.
        </CardContent></Card>
      )}

      <ul className="space-y-2" role="list">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.subject || "Uden emne"}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.kind}
                    {c.booking_id && ` • Booking ${c.booking_id.slice(0, 8)}`}
                    {c.last_message_at && ` • ${formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: da })}`}
                  </div>
                </div>
                <Badge variant="secondary">{STATUS_LABEL[c.status] ?? c.status}</Badge>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </SupportLayout>
  );
}
