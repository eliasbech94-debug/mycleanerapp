import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = { userId: string; onClose: () => void; onChanged: () => void };

type Pp = any;
type Audit = { id: string; action: string; from_status: string | null; to_status: string | null; reason: string | null; metadata: any; created_at: string; actor_id: string | null };
type Score = { id: string; provider_score: number; provider_tier: string; reason: string; created_at: string; breakdown: any; metrics_snapshot: any };

const DESTRUCTIVE = new Set(["reject", "suspend", "archive", "freeze_payout"]);

const ACTIONS: { key: string; labelKey: string; variant?: "destructive" | "outline" | "default"; requireReason?: boolean }[] = [
  { key: "approve", labelKey: "approve" },
  { key: "reject", labelKey: "reject", variant: "destructive", requireReason: true },
  { key: "pause", labelKey: "pause", variant: "outline" },
  { key: "unpause", labelKey: "unpause", variant: "outline" },
  { key: "suspend", labelKey: "suspend", variant: "destructive", requireReason: true },
  { key: "unsuspend", labelKey: "unsuspend", variant: "outline" },
  { key: "archive", labelKey: "archive", variant: "destructive", requireReason: true },
  { key: "restore", labelKey: "restore", variant: "outline" },
  { key: "set_partner", labelKey: "setPartner", variant: "outline" },
  { key: "unset_partner", labelKey: "unsetPartner", variant: "outline" },
  { key: "freeze_payout", labelKey: "freezePayout", variant: "destructive", requireReason: true },
  { key: "unfreeze_payout", labelKey: "unfreezePayout", variant: "outline" },
];

export default function ProviderDetailDrawer({ userId, onClose, onChanged }: Props) {
  const { t } = useTranslation("admin");
  const [pp, setPp] = useState<Pp | null>(null);
  const [trust, setTrust] = useState<any | null>(null);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [scores, setScores] = useState<Score[] | null>(null);
  const [completion, setCompletion] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const [ppRes, trustRes, auditRes, scoreRes, compRes] = await Promise.all([
      supabase.from("provider_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.rpc("admin_get_provider_trust" as any, { _uid: userId }),
      supabase.from("provider_admin_actions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("provider_score_history").select("id, provider_score, provider_tier, reason, created_at, breakdown, metrics_snapshot").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.rpc("calc_provider_completion", { _uid: userId }),
    ]);
    setPp(ppRes.data);
    setTrust(trustRes.data ?? null);
    setAudit((auditRes.data as any) || []);
    setScores((scoreRes.data as any) || []);
    setCompletion(compRes.data ?? null);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function invokeAction(action: string) {
    if (DESTRUCTIVE.has(action) && !reason.trim()) {
      toast.error(t("console.providers.drawer.reasonRequired"));
      return;
    }
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("admin-provider-action", {
      body: { target_user_id: userId, action, reason: reason.trim() || null, idempotency_key: `drawer-${action}-${userId}-${Date.now()}` },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || t("console.providers.drawer.actionFailed"));
      return;
    }
    toast.success(t("console.providers.drawer.actionOk", { action }));
    setReason("");
    await load();
    onChanged();
  }

  async function invokeRefresh(kind: "score" | "reconcile") {
    setBusy(`refresh_${kind}`);
    const { data, error } = await supabase.functions.invoke("admin-provider-refresh", {
      body: { target_user_id: userId, kind },
    });
    setBusy(null);
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || t("console.providers.drawer.updateFailed")); return; }
    toast.success(t("console.providers.drawer.updated", { kind }));
    await load(); onChanged();
  }

  const tierHistory = (scores || []).reduce<{ tier: string; at: string }[]>((acc, s) => {
    if (acc.length === 0 || acc[acc.length - 1].tier !== s.provider_tier) acc.push({ tier: s.provider_tier, at: s.created_at });
    return acc;
  }, []);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{pp?.display_name || t("console.providers.drawer.fallbackName")}</SheetTitle>
          <div className="text-xs opacity-60">{userId}</div>
        </SheetHeader>

        {!pp ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{pp.status}</Badge>
              <Badge variant="outline">{t("console.providers.drawer.visibility", { value: pp.visibility })}</Badge>
              <Badge variant="outline">{t("console.providers.drawer.tier", { value: pp.provider_tier })}</Badge>
              <Badge variant="outline">{t("console.providers.drawer.score", { value: pp.provider_score ?? "—" })}</Badge>
              <Badge variant="outline">{t("console.providers.drawer.completionBadge", { value: pp.completion_pct ?? 0 })}</Badge>
              <Badge variant="outline">{t("console.providers.drawer.identity", { value: pp.identity_status })}</Badge>
              <Badge variant="outline">{pp.stripe_charges_enabled && pp.stripe_payouts_enabled ? t("console.providers.drawer.stripeReady") : t("console.providers.drawer.stripeNotReady")}</Badge>
              {pp.payout_frozen && <Badge variant="destructive">{t("console.providers.drawer.payoutFrozen")}</Badge>}
            </div>

            {/* Trust Score — admin-only, fetched via admin_get_provider_trust RPC */}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> {t("console.providers.drawer.trustTitle")}</div>
              <div className="mt-1">{t("console.providers.drawer.trustScore", { value: trust?.trust_score ?? "—" })} · {t("console.providers.drawer.trustLevel", { value: trust?.trust_level ?? "—" })}</div>
              <div className="mt-1 text-xs">{t("console.providers.drawer.flags", { value: Array.isArray(trust?.trust_flags) && trust.trust_flags.length > 0 ? JSON.stringify(trust.trust_flags) : t("console.providers.drawer.noFlags") })}</div>
              {trust?.risk_reason && <div className="mt-1 text-xs">{t("console.providers.drawer.reasonLabel", { value: trust.risk_reason })}</div>}
            </div>


            <Tabs defaultValue="actions">
              <TabsList className="flex-wrap">
                <TabsTrigger value="actions">{t("console.providers.drawer.tabActions")}</TabsTrigger>
                <TabsTrigger value="timeline">{t("console.providers.drawer.tabTimeline")}</TabsTrigger>
                <TabsTrigger value="score">{t("console.providers.drawer.tabScore")}</TabsTrigger>
                <TabsTrigger value="completion">{t("console.providers.drawer.tabCompletion")}</TabsTrigger>
              </TabsList>

              <TabsContent value="actions" className="space-y-3">
                <div>
                  <label className="text-xs font-medium">{t("console.providers.drawer.reasonInputLabel")}</label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="…" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.map((a) => {
                    const label = t(`console.providers.drawer.actions.${a.labelKey}`);
                    return a.variant === "destructive" ? (
                    <AlertDialog key={a.key}>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" disabled={busy !== null}>{label}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("console.providers.drawer.confirmAction", { action: label.toLowerCase() })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("console.providers.drawer.confirmDescription", { reason: reason.trim() || t("console.providers.drawer.reasonMissing") })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("console.providers.drawer.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => invokeAction(a.key)}>{t("console.providers.drawer.confirm")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button key={a.key} size="sm" variant={a.variant || "default"} disabled={busy !== null} onClick={() => invokeAction(a.key)}>{label}</Button>
                  );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => invokeRefresh("score")}>{t("console.providers.drawer.recalcScore")}</Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => invokeRefresh("reconcile")}>{t("console.providers.drawer.reconcileStatus")}</Button>
                </div>
              </TabsContent>

              <TabsContent value="timeline">
                <ol className="relative border-l pl-4 text-sm space-y-3">
                  {audit === null && <Loader2 className="h-4 w-4 animate-spin" />}
                  {audit && audit.length === 0 && <li className="opacity-60">{t("console.providers.drawer.noHistory")}</li>}
                  {audit?.map((a) => (
                    <li key={a.id}>
                      <div className="absolute -left-1.5 h-3 w-3 rounded-full bg-primary" />
                      <div className="font-medium">{a.action}</div>
                      <div className="text-xs opacity-70">
                        {a.from_status || "—"} → {a.to_status || "—"} · {new Date(a.created_at).toLocaleString("da-DK")}
                      </div>
                      {a.reason && <div className="text-xs">{t("console.providers.drawer.reasonPrefix", { reason: a.reason })}</div>}
                    </li>
                  ))}
                </ol>
              </TabsContent>

              <TabsContent value="score">
                <div className="mb-2 text-xs opacity-70">{t("console.providers.drawer.tierHistoryTitle")}</div>
                <div className="mb-3 flex flex-wrap gap-1">
                  {tierHistory.length === 0 && <span className="text-xs opacity-60">{t("console.providers.drawer.none")}</span>}
                  {tierHistory.map((t, i) => (
                    <Badge key={i} variant="outline">{t.tier} · {new Date(t.at).toLocaleDateString("da-DK")}</Badge>
                  ))}
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left">
                    <tr><th className="p-1">{t("console.providers.drawer.colDate")}</th><th className="p-1">{t("console.providers.drawer.colScore")}</th><th className="p-1">{t("console.providers.drawer.colTier")}</th><th className="p-1">{t("console.providers.drawer.colReason")}</th></tr>
                  </thead>
                  <tbody>
                    {scores?.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="p-1">{new Date(s.created_at).toLocaleString("da-DK")}</td>
                        <td className="p-1">{s.provider_score}</td>
                        <td className="p-1">{s.provider_tier}</td>
                        <td className="p-1">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabsContent>

              <TabsContent value="completion">
                <div className="text-sm">
                  <div className="mb-2">{t("console.providers.drawer.completionLabel", { pct: completion?.pct ?? 0, done: completion?.done ?? 0, total: completion?.total ?? 0 })}</div>
                  <ul className="space-y-1">
                    {(completion?.items || []).map((it: any) => (
                      <li key={it.key} className="flex items-center justify-between border-b py-1">
                        <span>{it.label}</span>
                        <Badge variant={it.done ? "default" : "outline"}>{it.done ? "✓" : t("console.providers.drawer.missing")}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
