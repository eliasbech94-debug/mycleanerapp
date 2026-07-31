import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SupportLayout } from "./SupportLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupportDashboard } from "@/hooks/useSupportDashboard";

/**
 * Support workspace landing page. All numbers and activity come from the
 * staff-gated `support-dashboard` edge function.
 */
export default function SupportDashboardPage() {
  const { t } = useTranslation("admin");
  const { data, isLoading, isError, error } = useSupportDashboard();

  const tiles = [
    { key: "mine_open", label: t("support.dashboard.mineOpen") },
    { key: "unassigned", label: t("support.dashboard.unassigned") },
    { key: "urgent", label: t("support.dashboard.urgent") },
    { key: "escalated", label: t("support.dashboard.escalated") },
    { key: "unread", label: t("support.dashboard.unread") },
  ] as const;

  return (
    <SupportLayout
      title={t("support.dashboard.title")}
      description={t("support.dashboard.description")}
    >
      {isError && (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {t("support.dashboard.error", { message: (error as Error).message })}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <Card key={tile.key}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{tile.label}</div>
              {isLoading ? (
                <Skeleton className="mt-2 h-7 w-10" />
              ) : (
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {data?.counters[tile.key] ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-6 space-y-2">
        <h2 className="text-lg font-serif">{t("support.dashboard.recentActivity")}</h2>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {!isLoading && (data?.recent_activity.length ?? 0) === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t("support.dashboard.recentEmpty")}
            </CardContent>
          </Card>
        )}

        <ul className="space-y-2" role="list">
          {(data?.recent_activity ?? []).map((item) => (
            <li key={item.event_id}>
              <Card>
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {item.conversation_subject || t("support.dashboard.noSubject")}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                      <span>{item.event_type}</span>
                      <span>• {new Date(item.created_at).toLocaleString()}</span>
                      {item.conversation_status && <span>• {item.conversation_status}</span>}
                    </div>
                  </div>
                  {item.assigned_to_me && (
                    <Badge variant="secondary">{t("support.dashboard.assignedToMe")}</Badge>
                  )}
                  <Link
                    to={`/support/inbox/${item.conversation_id}`}
                    className="text-sm text-primary underline underline-offset-4"
                  >
                    {t("support.dashboard.openConversation")}
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </SupportLayout>
  );
}
