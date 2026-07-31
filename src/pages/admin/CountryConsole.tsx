// /admin/countries — Admin Country Console. Read-only preview of the effective
// public configuration, with server-side publish. Sensitive JSONB is never
// written directly from the browser; it round-trips through admin-country-publish.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Country = {
  iso: string;
  status: string;
  launch_status: string;
  active: boolean;
  currency: string;
  timezone: string;
  default_language: string;
  supported_languages: string[];
  commission_bps: number;
  vat_rate_bps: number;
  config_version: number;
  booking_rules: Record<string, unknown>;
  pricing_rules: Record<string, unknown>;
  config: Record<string, unknown>;
  published_at: string | null;
};

const SECTIONS = [
  "Overview", "Publication", "Languages", "Currency & timezone",
  "Booking rules", "Pricing & commission", "VAT & tax wording",
  "Payment methods", "Stripe readiness", "Identity verification",
  "Notifications", "Holidays", "Legal documents", "Feature flags",
  "Public contact", "History", "Audit",
] as const;

export default function CountryConsole() {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<Country[]>([]);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Country>>({});
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("country_configs").select("*").order("iso");
    setRows((data ?? []) as Country[]);
    if (!selectedIso && data?.length) setSelectedIso(data[0].iso);
  }
  const selected = useMemo(() => rows.find((r) => r.iso === selectedIso) ?? null, [rows, selectedIso]);
  useEffect(() => { if (selected) setDraft(selected); }, [selected]);

  async function publish() {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-country-publish", {
      body: {
        iso: selected.iso,
        expected_version: selected.config_version,
        draft: { ...selected, ...draft },
        change_summary: summary,
      },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if ((data as { error?: string })?.error) return toast.error((data as { message?: string }).message ?? (data as { error: string }).error);
    toast.success(t("pages.countryConsole.publishedNewVersion"));
    setSummary("");
    void load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("pages.countryConsole.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("pages.countryConsole.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {rows.map((r) => (
            <Button
              key={r.iso}
              variant={r.iso === selectedIso ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedIso(r.iso)}
            >
              {r.iso} <Badge variant="secondary" className="ml-2">{r.status}</Badge>
            </Button>
          ))}
        </div>
      </header>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selected.iso} — v{selected.config_version}
              <Badge>{selected.launch_status}</Badge>
              {selected.active ? <Badge variant="secondary">active</Badge> : <Badge variant="destructive">inactive</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={SECTIONS[0]}>
              <TabsList className="flex flex-wrap h-auto">
                {SECTIONS.map((s) => <TabsTrigger key={s} value={s}>{s}</TabsTrigger>)}
              </TabsList>

              <TabsContent value="Overview" className="space-y-2 pt-4">
                <pre className="rounded bg-muted p-3 text-xs overflow-auto">{JSON.stringify(selected, null, 2)}</pre>
              </TabsContent>

              <TabsContent value="Currency & timezone" className="space-y-2 pt-4">
                <label className="text-sm">{t("pages.countryConsole.currency")}
                  <Input value={draft.currency ?? ""} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
                </label>
                <label className="text-sm">{t("pages.countryConsole.timezone")}
                  <Input value={draft.timezone ?? ""} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} />
                </label>
              </TabsContent>

              <TabsContent value="Pricing & commission" className="space-y-2 pt-4">
                <label className="text-sm">{t("pages.countryConsole.commission")}
                  <Input type="number" value={draft.commission_bps ?? 0} onChange={(e) => setDraft({ ...draft, commission_bps: Number(e.target.value) })} />
                </label>
                <label className="text-sm">{t("pages.countryConsole.vatRate")}
                  <Input type="number" value={draft.vat_rate_bps ?? 0} onChange={(e) => setDraft({ ...draft, vat_rate_bps: Number(e.target.value) })} />
                </label>
                <p className="text-xs text-muted-foreground">
                  {t("pages.countryConsole.vatHint")}
                </p>
              </TabsContent>

              <TabsContent value="Booking rules" className="space-y-2 pt-4">
                <Textarea
                  rows={16}
                  value={JSON.stringify(draft.booking_rules ?? {}, null, 2)}
                  onChange={(e) => {
                    try { setDraft({ ...draft, booking_rules: JSON.parse(e.target.value) }); } catch { /* ignore */ }
                  }}
                />
              </TabsContent>

              {SECTIONS.filter((s) => !["Overview", "Currency & timezone", "Pricing & commission", "Booking rules"].includes(s)).map((s) => (
                <TabsContent key={s} value={s} className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    {t("pages.countryConsole.sectionManaged", { section: s })}
                  </p>
                </TabsContent>
              ))}
            </Tabs>

            <div className="mt-4 flex items-end gap-2">
              <label className="text-sm flex-1">{t("pages.countryConsole.changeSummary")}
                <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
              </label>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={busy}>{t("pages.countryConsole.publishNewVersion")}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("pages.countryConsole.publishVersionConfirm", { version: selected.config_version + 1 })}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("pages.countryConsole.publishWarning")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("pages.countryConsole.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={publish}>{t("pages.countryConsole.confirmPublish")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
