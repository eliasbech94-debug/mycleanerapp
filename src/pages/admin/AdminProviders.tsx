import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import ProviderDetailDrawer from "@/components/admin/ProviderDetailDrawer";
import { useUserRoles } from "@/hooks/useUserRoles";

type ProviderRow = {
  user_id: string;
  display_name: string | null;
  status: string;
  visibility: string;
  identity_status: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  provider_score: number | null;
  provider_tier: string | null;
  completion_pct: number | null;
  payout_frozen: boolean | null;
  submitted_at: string | null;
  updated_at: string;
};

const STATUS = ["draft", "pending_identity", "pending_stripe", "pending_review", "active", "paused", "suspended", "rejected", "archived"];
const TIERS = ["new", "verified", "experienced", "top_rated", "elite", "partner"];
const PAGE = 25;

const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  pending_review: "bg-amber-100 text-amber-800",
  pending_identity: "bg-blue-100 text-blue-800",
  pending_stripe: "bg-blue-100 text-blue-800",
  draft: "bg-gray-100 text-gray-800",
  paused: "bg-yellow-100 text-yellow-800",
  suspended: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
  archived: "bg-gray-200 text-gray-700",
};

export default function AdminProviders() {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [identityFilter, setIdentityFilter] = useState<string>("all");
  const [reviewQueue, setReviewQueue] = useState(false);
  const [riskOnly, setRiskOnly] = useState(false);
  const [minScore, setMinScore] = useState<string>("");

  const load = useCallback(async () => {
    setRows(null);

    // Trust flags live in admin-only provider_trust. Fetch flagged IDs via RPC
    // when the risk filter is on, then combine with payout_frozen.
    let flaggedIds: string[] = [];
    if (riskOnly) {
      const { data: fids } = await supabase.rpc("admin_list_flagged_provider_ids" as any);
      flaggedIds = Array.isArray(fids) ? (fids as string[]) : [];
    }

    let q = supabase
      .from("provider_profiles")
      .select(
        "user_id, display_name, status, visibility, identity_status, stripe_charges_enabled, stripe_payouts_enabled, provider_score, provider_tier, completion_pct, payout_frozen, submitted_at, updated_at",
        { count: "exact" },
      )
      .order(reviewQueue ? "submitted_at" : "updated_at", { ascending: reviewQueue })
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (reviewQueue) q = q.eq("status", "pending_review");
    else if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    if (tierFilter !== "all") q = q.eq("provider_tier", tierFilter as any);
    if (identityFilter !== "all") q = q.eq("identity_status", identityFilter);
    if (minScore !== "") q = q.gte("provider_score", Number(minScore) || 0);
    if (riskOnly) {
      const idList = flaggedIds.map((v) => `"${v}"`).join(",");
      const orExpr = idList.length > 0
        ? `payout_frozen.eq.true,user_id.in.(${idList})`
        : `payout_frozen.eq.true`;
      q = q.or(orExpr);
    }
    if (search.trim()) q = q.ilike("display_name", `%${search.trim()}%`);

    const { data, count, error } = await q;
    if (error) { toast.error(error.message); return; }
    setRows((data as any) || []);
    setTotal(count ?? 0);
    setSelectedIds(new Set());
  }, [page, search, statusFilter, tierFilter, identityFilter, reviewQueue, riskOnly, minScore]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const toggle = (id: string) => setSelectedIds((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleAll = () => setSelectedIds((s) => {
    if (!rows) return s;
    if (s.size === rows.length) return new Set();
    return new Set(rows.map((r) => r.user_id));
  });

  async function bulkAction(action: "approve" | "suspend" | "archive" | "refresh_score") {
    if (selectedIds.size === 0) return;
    if (!confirm(`Bekræft: ${action} på ${selectedIds.size} providere?`)) return;
    setBulkBusy(true);
    const ids = [...selectedIds];
    let ok = 0, fail = 0;
    for (const id of ids) {
      const fn = action === "refresh_score" ? "admin-provider-refresh" : "admin-provider-action";
      const body = action === "refresh_score"
        ? { target_user_id: id, kind: "score" }
        : { target_user_id: id, action, idempotency_key: `bulk-${action}-${id}-${Date.now()}` };
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error || (data as any)?.error) fail++; else ok++;
    }
    setBulkBusy(false);
    toast[fail === 0 ? "success" : "error"](`${ok} ok, ${fail} fejlet`);
    await load();
  }

  if (rolesLoading) {
    return <main className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></main>;
  }
  if (!isAdmin) {
    return <main className="grid min-h-screen place-items-center"><Card><CardContent className="p-6">Adgang nægtet (403)</CardContent></Card></main>;
  }

  return (
    <DashboardLayout role="admin" title="Providere">
      <main className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 opacity-50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setPage(0), load())}
              placeholder="Søg navn…"
              className="w-56 pl-8"
              aria-label="Søg efter provider"
            />
          </div>
          <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(0); }} placeholder="Status" options={STATUS} disabled={reviewQueue} />
          <FilterSelect value={tierFilter} onChange={(v) => { setTierFilter(v); setPage(0); }} placeholder="Tier" options={TIERS} />
          <FilterSelect value={identityFilter} onChange={(v) => { setIdentityFilter(v); setPage(0); }} placeholder="Identitet" options={["not_started", "pending", "approved", "rejected"]} />
          <Input type="number" placeholder="Min. score" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(0); }} className="w-28" aria-label="Minimum score" />
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox checked={reviewQueue} onCheckedChange={(v) => { setReviewQueue(!!v); setPage(0); }} /> Review-kø
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox checked={riskOnly} onCheckedChange={(v) => { setRiskOnly(!!v); setPage(0); }} /> Risiko
          </label>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            <span className="text-sm">{selectedIds.size} valgt</span>
            <Button size="sm" disabled={bulkBusy} onClick={() => bulkAction("approve")}>Godkend</Button>
            <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => bulkAction("suspend")}>Suspendér</Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkAction("archive")}>Arkivér</Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkAction("refresh_score")}>Opdater score</Button>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 w-10"><Checkbox checked={!!rows && rows.length > 0 && selectedIds.size === rows.length} onCheckedChange={toggleAll} aria-label="Vælg alle" /></th>
                    <th className="p-2">Navn</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Tier</th>
                    <th className="p-2">Score</th>
                    <th className="p-2">Compl.</th>
                    <th className="p-2">Identitet</th>
                    <th className="p-2">Stripe</th>
                    <th className="p-2">Risiko</th>
                  </tr>
                </thead>
                <tbody>
                  {rows === null && (
                    <tr><td colSpan={9} className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                  )}
                  {rows && rows.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center opacity-60">Ingen providere matcher</td></tr>
                  )}
                  {rows?.map((r) => {
                    const stripeOk = r.stripe_charges_enabled && r.stripe_payouts_enabled;
                    return (
                      <tr key={r.user_id} className="border-t hover:bg-muted/30">
                        <td className="p-2"><Checkbox checked={selectedIds.has(r.user_id)} onCheckedChange={() => toggle(r.user_id)} aria-label={`Vælg ${r.display_name}`} /></td>
                        <td className="p-2">
                          <button onClick={() => setOpenId(r.user_id)} className="text-left font-medium hover:underline">
                            {r.display_name || "(uden navn)"}
                          </button>
                          <div className="text-xs opacity-50">{r.user_id.slice(0, 8)}…</div>
                        </td>
                        <td className="p-2"><Badge className={statusColor[r.status] || ""} variant="secondary">{r.status}</Badge></td>
                        <td className="p-2"><Badge variant="outline">{r.provider_tier}</Badge></td>
                        <td className="p-2">{r.provider_score ?? "—"}</td>
                        <td className="p-2">{r.completion_pct ?? 0}%</td>
                        <td className="p-2">{r.identity_status || "—"}</td>
                        <td className="p-2">{stripeOk ? "✓" : "—"}</td>
                        <td className="p-2">
                          {r.payout_frozen && <Badge variant="destructive" className="mr-1">frozen</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm">
          <div>Viser {rows?.length ?? 0} af {total}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Forrige side"><ChevronLeft className="h-4 w-4" /></Button>
            <span>Side {page + 1} / {Math.max(1, Math.ceil(total / PAGE))}</span>
            <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} aria-label="Næste side"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        {openId && (
          <ProviderDetailDrawer userId={openId} onClose={() => setOpenId(null)} onChanged={load} />
        )}
      </main>
    </DashboardLayout>
  );
}

function FilterSelect({ value, onChange, placeholder, options, disabled }: { value: string; onChange: (v: string) => void; placeholder: string; options: string[]; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-40"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Alle {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
