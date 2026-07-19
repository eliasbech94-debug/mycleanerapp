import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SupportLayout } from "./SupportLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  country_code: string | null;
  deactivated_at: string | null;
  created_at: string;
};

export default function SupportCustomersPage() {
  const [q, setQ] = useState("");
  const [committed, setCommitted] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["support", "customers", committed],
    queryFn: async (): Promise<Customer[]> => {
      const params = new URLSearchParams({ limit: "50" });
      if (committed) params.set("q", committed);
      const { data, error } = await supabase.functions.invoke(
        `support-customer-summary?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return (data as { customers: Customer[] })?.customers ?? [];
    },
  });

  return (
    <SupportLayout title="Kunder" description="Support-sikker kundesøgning. Ingen finans- eller skattedata.">
      <form
        onSubmit={(e) => { e.preventDefault(); setCommitted(q.trim()); }}
        className="flex gap-2 mb-4 max-w-lg"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg på navn eller telefon…"
            className="pl-9"
            aria-label="Søg kunder"
          />
        </div>
        <Button type="submit" variant="outline">Søg</Button>
      </form>

      {isLoading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
      {isError && <Card><CardContent className="p-6 text-sm text-destructive">Fejl: {(error as Error).message}</CardContent></Card>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">Ingen kunder fundet.</CardContent></Card>
      )}

      <ul className="space-y-2" role="list">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.full_name || "(Uden navn)"}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                    {c.phone && <span>{c.phone}</span>}
                    {c.country_code && <span>• {c.country_code}</span>}
                    <span>• Oprettet {new Date(c.created_at).toLocaleDateString("da-DK")}</span>
                  </div>
                </div>
                {c.deactivated_at
                  ? <Badge variant="destructive">Deaktiveret</Badge>
                  : <Badge variant="secondary">Aktiv</Badge>}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </SupportLayout>
  );
}
