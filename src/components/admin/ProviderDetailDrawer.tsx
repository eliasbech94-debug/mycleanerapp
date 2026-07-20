import { useCallback, useEffect, useState } from "react";
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

const ACTIONS: { key: string; label: string; variant?: "destructive" | "outline" | "default"; requireReason?: boolean }[] = [
  { key: "approve", label: "Godkend" },
  { key: "reject", label: "Afvis", variant: "destructive", requireReason: true },
  { key: "pause", label: "Pause", variant: "outline" },
  { key: "unpause", label: "Genoptag", variant: "outline" },
  { key: "suspend", label: "Suspendér", variant: "destructive", requireReason: true },
  { key: "unsuspend", label: "Ophæv suspension", variant: "outline" },
  { key: "archive", label: "Arkivér", variant: "destructive", requireReason: true },
  { key: "restore", label: "Gendan", variant: "outline" },
  { key: "set_partner", label: "Sæt Partner", variant: "outline" },
  { key: "unset_partner", label: "Fjern Partner", variant: "outline" },
  { key: "freeze_payout", label: "Frys udbetaling", variant: "destructive", requireReason: true },
  { key: "unfreeze_payout", label: "Genoptag udbetaling", variant: "outline" },
];

export default function ProviderDetailDrawer({ userId, onClose, onChanged }: Props) {
  const [pp, setPp] = useState<Pp | null>(null);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [scores, setScores] = useState<Score[] | null>(null);
  const [completion, setCompletion] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const [ppRes, auditRes, scoreRes, compRes] = await Promise.all([
      supabase.from("provider_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("provider_admin_actions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("provider_score_history").select("id, provider_score, provider_tier, reason, created_at, breakdown, metrics_snapshot").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.rpc("calc_provider_completion", { _uid: userId }),
    ]);
    setPp(ppRes.data);
    setAudit((auditRes.data as any) || []);
    setScores((scoreRes.data as any) || []);
    setCompletion(compRes.data ?? null);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function invokeAction(action: string) {
    if (DESTRUCTIVE.has(action) && !reason.trim()) {
      toast.error("Angiv en begrundelse først");
      return;
    }
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("admin-provider-action", {
      body: { target_user_id: userId, action, reason: reason.trim() || null, idempotency_key: `drawer-${action}-${userId}-${Date.now()}` },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Handling fejlet");
      return;
    }
    toast.success(`OK: ${action}`);
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
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Opdatering fejlet"); return; }
    toast.success(`Opdateret: ${kind}`);
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
          <SheetTitle>{pp?.display_name || "Provider"}</SheetTitle>
          <div className="text-xs opacity-60">{userId}</div>
        </SheetHeader>

        {!pp ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{pp.status}</Badge>
              <Badge variant="outline">visibility: {pp.visibility}</Badge>
              <Badge variant="outline">tier: {pp.provider_tier}</Badge>
              <Badge variant="outline">score: {pp.provider_score ?? "—"}</Badge>
              <Badge variant="outline">completion: {pp.completion_pct ?? 0}%</Badge>
              <Badge variant="outline">identity: {pp.identity_status}</Badge>
              <Badge variant="outline">stripe: {pp.stripe_charges_enabled && pp.stripe_payouts_enabled ? "ready" : "not-ready"}</Badge>
              {pp.payout_frozen && <Badge variant="destructive">payout frozen</Badge>}
            </div>

            {/* Trust Score — admin-only visibility (drawer is admin-gated) */}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> Intern Trust Score (kun admin)</div>
              <div className="mt-1">Trust Score: <b>{pp.trust_score ?? 0}</b></div>
              <div className="mt-1 text-xs">Flags: {Array.isArray(pp.trust_flags) && pp.trust_flags.length > 0 ? JSON.stringify(pp.trust_flags) : "ingen"}</div>
            </div>

            <Tabs defaultValue="actions">
              <TabsList className="flex-wrap">
                <TabsTrigger value="actions">Handlinger</TabsTrigger>
                <TabsTrigger value="timeline">Tidslinje</TabsTrigger>
                <TabsTrigger value="score">Score-historik</TabsTrigger>
                <TabsTrigger value="completion">Onboarding</TabsTrigger>
              </TabsList>

              <TabsContent value="actions" className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Begrundelse (påkrævet for destruktive handlinger)</label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="…" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.map((a) => a.variant === "destructive" ? (
                    <AlertDialog key={a.key}>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" disabled={busy !== null}>{a.label}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Bekræft {a.label.toLowerCase()}</AlertDialogTitle>
                          <AlertDialogDescription>
                            Denne handling registreres i audit-log. Begrundelse: <b>{reason.trim() || "(mangler)"}</b>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annullér</AlertDialogCancel>
                          <AlertDialogAction onClick={() => invokeAction(a.key)}>Bekræft</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button key={a.key} size="sm" variant={a.variant || "default"} disabled={busy !== null} onClick={() => invokeAction(a.key)}>{a.label}</Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => invokeRefresh("score")}>Genberegn score/tier</Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => invokeRefresh("reconcile")}>Reconciler status</Button>
                </div>
              </TabsContent>

              <TabsContent value="timeline">
                <ol className="relative border-l pl-4 text-sm space-y-3">
                  {audit === null && <Loader2 className="h-4 w-4 animate-spin" />}
                  {audit && audit.length === 0 && <li className="opacity-60">Ingen historik</li>}
                  {audit?.map((a) => (
                    <li key={a.id}>
                      <div className="absolute -left-1.5 h-3 w-3 rounded-full bg-primary" />
                      <div className="font-medium">{a.action}</div>
                      <div className="text-xs opacity-70">
                        {a.from_status || "—"} → {a.to_status || "—"} · {new Date(a.created_at).toLocaleString("da-DK")}
                      </div>
                      {a.reason && <div className="text-xs">Begrundelse: {a.reason}</div>}
                    </li>
                  ))}
                </ol>
              </TabsContent>

              <TabsContent value="score">
                <div className="mb-2 text-xs opacity-70">Tier-historik (afledt af score-snapshots)</div>
                <div className="mb-3 flex flex-wrap gap-1">
                  {tierHistory.length === 0 && <span className="text-xs opacity-60">Ingen</span>}
                  {tierHistory.map((t, i) => (
                    <Badge key={i} variant="outline">{t.tier} · {new Date(t.at).toLocaleDateString("da-DK")}</Badge>
                  ))}
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left">
                    <tr><th className="p-1">Dato</th><th className="p-1">Score</th><th className="p-1">Tier</th><th className="p-1">Årsag</th></tr>
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
                  <div className="mb-2">Fuldførelse: <b>{completion?.pct ?? 0}%</b> ({completion?.done ?? 0}/{completion?.total ?? 0})</div>
                  <ul className="space-y-1">
                    {(completion?.items || []).map((it: any) => (
                      <li key={it.key} className="flex items-center justify-between border-b py-1">
                        <span>{it.label}</span>
                        <Badge variant={it.done ? "default" : "outline"}>{it.done ? "✓" : "mangler"}</Badge>
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
