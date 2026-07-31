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
import { useTranslation } from "react-i18next";

type Provider = {
  id: string;
  provider_id: string | null;
  full_name: string | null;
  country_code: string | null;
  deactivated_at: string | null;
  created_at: string;
};

export default function SupportProvidersPage() {
  const { t } = useTranslation("admin");
  const [q, setQ] = useState("");
  const [committed, setCommitted] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["support", "providers", committed],
    queryFn: async (): Promise<Provider[]> => {
      const params = new URLSearchParams({ limit: "50" });
      if (committed) params.set("q", committed);
      const { data, error } = await supabase.functions.invoke(
        `support-provider-summary?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return (data as { providers: Provider[] })?.providers ?? [];
    },
  });

  return (
    <SupportLayout title={t("support.providers.title")} description={t("support.providers.description")}>
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
            placeholder={t("support.providers.searchPlaceholder")}
            className="pl-9"
            aria-label={t("support.providers.searchAria")}
          />
        </div>
        <Button type="submit" variant="outline">{t("support.providers.searchButton")}</Button>
      </form>

      {isLoading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
      {isError && <Card><CardContent className="p-6 text-sm text-destructive">{t("support.providers.error", { message: (error as Error).message })}</CardContent></Card>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">{t("support.providers.empty")}</CardContent></Card>
      )}

      <ul className="space-y-2" role="list">
        {(data ?? []).map((p) => (
          <li key={p.id}>
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {p.full_name || t("support.providers.noName")}
                    {p.provider_id && <span className="ml-2 text-xs font-mono text-muted-foreground">#{p.provider_id}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.country_code && <>{t("support.providers.countryLabel")} {p.country_code} • </>}
                    {t("support.providers.createdOn", { date: new Date(p.created_at).toLocaleDateString() })}
                  </div>
                </div>
                {p.deactivated_at
                  ? <Badge variant="destructive">{t("support.providers.deactivated")}</Badge>
                  : <Badge variant="secondary">{t("support.providers.active")}</Badge>}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </SupportLayout>
  );
}
