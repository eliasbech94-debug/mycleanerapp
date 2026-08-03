import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { formatMinor } from "@/lib/accounting";
import { monthLabel, type MonthlyReportRecord } from "@/lib/accounting/monthlyReport";
import { useTranslation } from "react-i18next";

/**
 * /admin/accounting-reports
 *
 * Operational overview of the scheduled monthly report generator. Admins see
 * generation status only — never a provider's report content or PDF. Any
 * access to a report file is logged and handled by the backend.
 */
export default function AdminAccountingReports() {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<MonthlyReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("accounting-monthly-reports", {
          body: { action: "admin_list" },
        });
        if (cancelled) return;
        if (error || !data) {
          setRows([]);
          setUnavailable(t("pages.adminAccountingReports.notEnabled"));
        } else {
          setRows((data as { reports?: MonthlyReportRecord[] }).reports ?? []);
          setUnavailable(null);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setUnavailable(t("pages.adminAccountingReports.fetchFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.providerId, row.registrationCountry, row.jurisdictionCode, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [rows, query]);

  const failed = filtered.filter((row) => row.status === "failed");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <BackButton />
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("pages.adminAccountingReports.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pages.adminAccountingReports.subtitle")}
        </p>
      </header>

      {unavailable ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("pages.adminAccountingReports.unavailableTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{unavailable}</CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>{t("pages.adminAccountingReports.loadingStatus")}</span>
        </div>
      ) : (
        <div className="space-y-4">
          {failed.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t("pages.adminAccountingReports.failedCount", { count: failed.length })}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t("pages.adminAccountingReports.failedHelp")}
              </CardContent>
            </Card>
          )}

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("pages.adminAccountingReports.searchPlaceholder")}
            aria-label={t("pages.adminAccountingReports.searchAriaLabel")}
          />

          <Card>
            <CardContent className="overflow-x-auto py-4">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {[
                      t("pages.adminAccountingReports.columns.month"),
                      t("pages.adminAccountingReports.columns.provider"),
                      t("pages.adminAccountingReports.columns.country"),
                      t("pages.adminAccountingReports.columns.rulePack"),
                      t("pages.adminAccountingReports.columns.status"),
                      t("pages.adminAccountingReports.columns.version"),
                      t("pages.adminAccountingReports.columns.income"),
                      t("pages.adminAccountingReports.columns.reviewPoints"),
                    ].map((column) => (
                      <th key={column} className="border-b border-border py-2 pr-3 font-medium text-muted-foreground">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="py-4 text-muted-foreground" colSpan={8}>
                        {t("pages.adminAccountingReports.noResults")}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.id}>
                        <td className="border-b border-border/60 py-2 pr-3">
                          {monthLabel(row.reportYear, row.reportMonth)}
                        </td>
                        <td className="border-b border-border/60 py-2 pr-3 font-mono text-xs">
                          {row.providerId}
                        </td>
                        <td className="border-b border-border/60 py-2 pr-3">
                          {row.registrationCountry ?? "—"}
                        </td>
                        <td className="border-b border-border/60 py-2 pr-3">
                          {row.rulePackVersion ?? "—"}
                        </td>
                        <td className="border-b border-border/60 py-2 pr-3">
                          <Badge variant={row.status === "failed" ? "destructive" : "outline"}>
                            {row.status}
                          </Badge>
                          {row.generationErrorCode && (
                            <span className="ml-2 text-xs text-destructive">
                              {row.generationErrorCode}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border/60 py-2 pr-3">
                          v{row.reportVersion}
                          {!row.isCurrentVersion && ` (${t("pages.adminAccountingReports.replaced")})`}
                        </td>
                        <td className="border-b border-border/60 py-2 pr-3">
                          {formatMinor(row.totalIncomeMinor, row.accountingCurrency, null)}
                        </td>
                        <td className="border-b border-border/60 py-2 pr-3">
                          {row.reviewRequiredCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
