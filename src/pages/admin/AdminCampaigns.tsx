// Admin Campaign Console. Feature-flag gated on `campaigns.admin_ui`.
// Provides: campaign list, application review with approve/reject/waitlist,
// internal notes, and CSV export via campaign-export-csv edge function.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import {
  listAdminCampaigns,
  listAdminApplications,
  adminCampaignAction,
} from "@/lib/campaigns/api";
import { hasFlag } from "@/lib/featureFlags";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type Campaign = Awaited<ReturnType<typeof listAdminCampaigns>>[number];
type Application = Awaited<ReturnType<typeof listAdminApplications>>[number];

export default function AdminCampaigns() {
  const { t } = useTranslation("admin");
  const [flag, setFlag] = useState<boolean | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setFlag(await hasFlag("campaigns.admin_ui", {}));
      try {
        const list = await listAdminCampaigns();
        setCampaigns(list);
        if (list.length && !selected) setSelected(list[0]);
      } catch (e) {
        toast({ title: t("pages.adminCampaigns.fetchCampaignsFailed"), description: (e as Error).message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        setApps(await listAdminApplications(selected.id));
      } catch (e) {
        toast({ title: t("pages.adminCampaigns.fetchApplicationsFailed"), description: (e as Error).message, variant: "destructive" });
      }
    })();
  }, [selected]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return apps;
    return apps.filter((a) => a.full_name?.toLowerCase().includes(f) || a.email?.toLowerCase().includes(f));
  }, [apps, filter]);

  async function act(a: Application, action: "approve" | "reject" | "waitlist") {
    try {
      await adminCampaignAction({ action, application_id: a.id, note: note[a.id] });
      toast({ title: t("pages.adminCampaigns.applicationActionDone", { action }) });
      if (selected) setApps(await listAdminApplications(selected.id));
    } catch (e) {
      toast({ title: t("pages.adminCampaigns.actionFailed"), description: (e as Error).message, variant: "destructive" });
    }
  }

  async function exportCsv() {
    if (!selected) return;
    try {
      const { data, error } = await supabase.functions.invoke("campaign-export-csv", {
        body: { campaign_id: selected.id },
      });
      if (error) throw error;
      const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data)], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${selected.slug}-applications.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: t("pages.adminCampaigns.csvExportFailed"), description: (e as Error).message, variant: "destructive" });
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!flag) {
    return (
      <main className="container py-10 max-w-2xl">
        <Alert>
          <AlertDescription>
            {t("pages.adminCampaigns.consoleDisabled")} <code>campaigns.admin_ui</code>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="container py-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl">{t("pages.adminCampaigns.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("pages.adminCampaigns.subtitle")}</p>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("pages.adminCampaigns.noCampaigns")}</p>
          )}
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full text-left rounded-lg border px-3 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === c.id ? "bg-muted border-primary" : "border-border"}`}
            >
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Badge variant="secondary">{c.lifecycle}</Badge>
                <span>v{c.version}</span>
                {c.deleted_at && <Badge variant="destructive">{t("pages.adminCampaigns.deleted")}</Badge>}
              </div>
            </button>
          ))}
        </aside>

        <section className="space-y-4">
          {selected && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>{selected.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">/{selected.slug} · {selected.kind}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportCsv}>{t("pages.adminCampaigns.exportCsv")}</Button>
                </CardHeader>
                <CardContent>
                  <Input placeholder={t("pages.adminCampaigns.filterApplicantsPlaceholder")} value={filter} onChange={(e) => setFilter(e.target.value)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">{t("pages.adminCampaigns.applicationsCount", { count: filtered.length })}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {filtered.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("pages.adminCampaigns.noApplications")}</p>
                  )}
                  {filtered.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{a.full_name}</div>
                          <div className="text-xs text-muted-foreground">{a.email} · {a.country_code}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary">{a.status}</Badge>
                          {a.email_verified_at ? <Badge>{t("pages.adminCampaigns.verified")}</Badge> : <Badge variant="outline">{t("pages.adminCampaigns.unverified")}</Badge>}
                          {a.assigned_number && <Badge>#{a.assigned_number}</Badge>}
                        </div>
                      </div>
                      <Textarea
                        placeholder={t("pages.adminCampaigns.internalNotePlaceholder")}
                        value={note[a.id] ?? ""}
                        onChange={(e) => setNote({ ...note, [a.id]: e.target.value })}
                        className="min-h-[60px]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => act(a, "approve")}>{t("pages.adminCampaigns.approve")}</Button>
                        <Button size="sm" variant="outline" onClick={() => act(a, "waitlist")}>{t("pages.adminCampaigns.waitlist")}</Button>
                        <Button size="sm" variant="destructive" onClick={() => act(a, "reject")}>{t("pages.adminCampaigns.reject")}</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
