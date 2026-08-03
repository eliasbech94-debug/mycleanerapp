import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

type Counts = { h24: number; d7: number; d30: number };

/**
 * Shows a red banner if Stripe webhook events have been rejected (bad signature)
 * or failed handling within the recent window. Auto-refreshes via realtime.
 */
export default function WebhookAlertBanner({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("common");
  const [counts, setCounts] = useState<Counts>({ h24: 0, d7: 0, d30: 0 });
  const [lastError, setLastError] = useState<string | null>(null);

  const load = async () => {
    const since30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const { data } = await supabase
      .from("stripe_webhook_events")
      .select("created_at,status,event_type,payload")
      .in("status", ["rejected", "error", "failed"])
      .gte("created_at", since30)
      .order("created_at", { ascending: false })
      .limit(500);

    const rows = data ?? [];
    const now = Date.now();
    const h24 = rows.filter((r) => now - new Date(r.created_at).getTime() < 24 * 3600_000).length;
    const d7 = rows.filter((r) => now - new Date(r.created_at).getTime() < 7 * 24 * 3600_000).length;
    setCounts({ h24, d7, d30: rows.length });
    const first = rows[0];
    setLastError(first ? ((first.payload as any)?.error ?? first.event_type ?? null) : null);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("webhook_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stripe_webhook_events" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (counts.d30 === 0) return null;

  if (compact) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>{t("ui.webhookAlertBanner.compactTitle")}</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
          <span>
            {t("ui.webhookAlertBanner.compactSummary", { h24: counts.h24, d7: counts.d7, d30: counts.d30 })}
          </span>
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/webhooks">{t("ui.webhookAlertBanner.seeDetails")}</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("ui.webhookAlertBanner.title")}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Der er afviste eller fejlede webhook-events. Det kan betyde forkert signing
          secret, ugyldige forespørgsler eller fejl i event-håndtering.
        </p>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="bg-background/40 rounded p-2">
            <div className="text-xs opacity-80">{t("ui.webhookAlertBanner.last24h")}</div>
            <div className="text-xl font-serif">{counts.h24}</div>
          </div>
          <div className="bg-background/40 rounded p-2">
            <div className="text-xs opacity-80">{t("ui.webhookAlertBanner.last7d")}</div>
            <div className="text-xl font-serif">{counts.d7}</div>
          </div>
          <div className="bg-background/40 rounded p-2">
            <div className="text-xs opacity-80">{t("ui.webhookAlertBanner.last30d")}</div>
            <div className="text-xl font-serif">{counts.d30}</div>
          </div>
        </div>
        {lastError && (
          <p className="text-xs opacity-80 break-all">Seneste fejl: {lastError}</p>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin/webhooks">{t("ui.webhookAlertBanner.openLog")}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
