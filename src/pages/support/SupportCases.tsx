import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { SupportLayout } from "./SupportLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Download, Search } from "lucide-react";
import {
  PRIORITY_LABEL_DA, PRIORITY_ORDER, STATUS_LABEL_DA, STATUS_ORDER,
} from "@/lib/support/labels";

type Row = {
  id: string; kind: string; status: string; priority: string | null;
  subject: string | null; last_message_at: string | null;
  booking_id: string | null; assigned_support_id: string | null;
  country_code?: string | null;
};

interface Page { conversations: Row[]; nextCursor: string | null; }

const PAGE_SIZE = 40;

/**
 * Cases explorer. All filtering, pagination and export happens server-side.
 * URL is the source of truth so links are shareable.
 */
export default function SupportCasesPage() {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  const status = sp.get("status") ?? "";
  const priority = sp.get("priority") ?? "";
  const scope = sp.get("scope") ?? "all";
  const search = sp.get("q") ?? "";

  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => { setSearchDraft(search); }, [search]);

  const queryKey = ["support", "cases", { status, priority, scope, search }] as const;

  const q = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page) => last.nextCursor,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const params = new URLSearchParams({ scope, limit: String(PAGE_SIZE) });
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (search.trim()) params.set("q", search.trim());
      if (pageParam) params.set("cursor", pageParam);
      const { data, error } = await supabase.functions.invoke(
        `support-list-conversations?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return {
        conversations: (data as { conversations?: Row[] } | null)?.conversations ?? [],
        nextCursor: (data as { nextCursor?: string | null } | null)?.nextCursor ?? null,
      };
    },
    staleTime: 15_000,
  });

  // Realtime: patch rows already in the cache; new rows arrive on refetch/next page.
  useEffect(() => {
    const ch = supabase
      .channel("support-cases")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => qc.invalidateQueries({ queryKey: ["support", "cases"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const rows = useMemo(
    () => q.data?.pages.flatMap((p) => p.conversations) ?? [],
    [q.data],
  );

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value); else next.delete(key);
    setSp(next, { replace: true });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    update("q", searchDraft.trim());
  };

  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ scope });
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (search.trim()) params.set("q", search.trim());
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-cases-export?${params.toString()}`;
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t("support.cases.exportError", { status: res.status }));
      const blob = await res.blob();
      const rowCount = res.headers.get("X-Row-Count") ?? "?";
      const dl = document.createElement("a");
      dl.href = URL.createObjectURL(blob);
      dl.download = `support-cases-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(dl); dl.click(); dl.remove();
      URL.revokeObjectURL(dl.href);
      toast.success(t("support.cases.exportSuccess", { count: rowCount }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SupportLayout title={t("support.cases.title")} description={t("support.cases.description")}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <form onSubmit={submitSearch} className="relative flex-1 min-w-[220px]">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t("support.cases.searchPlaceholder")}
              className="pl-7 h-9"
              aria-label={t("support.cases.searchAria")}
            />
          </form>

          <Select value={scope} onValueChange={(v) => update("scope", v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("support.cases.scope.all")}</SelectItem>
              <SelectItem value="mine">{t("support.cases.scope.mine")}</SelectItem>
              <SelectItem value="unassigned">{t("support.cases.scope.unassigned")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status || "__all"} onValueChange={(v) => update("status", v === "__all" ? "" : v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder={t("support.cases.statusPlaceholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("support.cases.statusAll")}</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL_DA[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority || "__all"} onValueChange={(v) => update("priority", v === "__all" ? "" : v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder={t("support.cases.priorityPlaceholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("support.cases.priorityAll")}</SelectItem>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL_DA[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline" size="sm" onClick={doExport}
            disabled={exporting || rows.length === 0}
            aria-label={t("support.cases.exportAria")}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            {exporting ? t("support.cases.exporting") : "CSV"}
          </Button>
        </div>

        {q.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        )}

        {q.isError && (
          <Card><CardContent className="p-6 text-sm text-destructive">
            {t("support.cases.error", { message: (q.error as Error).message })}
          </CardContent></Card>
        )}

        {!q.isLoading && !q.isError && rows.length === 0 && (
          <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">
            {t("support.cases.empty")}
          </CardContent></Card>
        )}

        {rows.length > 0 && (
          <ul className="space-y-2" role="list">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/support/inbox/${c.id}`} className="block focus:outline-none focus:ring-2 focus:ring-primary rounded">
                  <Card className="hover:bg-muted/30 transition-colors">
                    <CardContent className="p-4 flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.subject || t("support.cases.noSubject")}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.kind}
                          {c.booking_id && ` • ${t("support.cases.bookingLabel")} ${c.booking_id.slice(0, 8)}`}
                          {c.country_code && ` • ${c.country_code}`}
                          {c.last_message_at && ` • ${formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: da })}`}
                        </div>
                      </div>
                      {c.priority && c.priority !== "normal" && (
                        <Badge
                          variant={c.priority === "urgent" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {PRIORITY_LABEL_DA[c.priority] ?? c.priority}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {STATUS_LABEL_DA[c.status] ?? c.status}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {q.hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline" size="sm"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage ? t("support.cases.loadingMore") : t("support.cases.loadMore")}
            </Button>
          </div>
        )}
      </div>
    </SupportLayout>
  );
}
