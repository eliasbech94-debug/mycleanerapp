import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Shield, ShieldCheck, ShieldAlert, ShieldX, ArrowLeft } from "lucide-react";

type AccessAttempt = {
  id: string;
  created_at: string;
  user_id: string | null;
  email: string | null;
  route: string;
  allowed_roles: string[];
  user_roles: string[];
  result: "granted" | "denied" | "unauthenticated" | string;
  reason: string | null;
  user_agent: string | null;
  referrer: string | null;
};

const PAGE_SIZE = 100;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("da-DK", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function AdminAccessLogs() {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<AccessAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<string>("all");
  const [routeFilter, setRouteFilter] = useState<string>("all");

  const resultBadge = (r: string) => {
    if (r === "granted") return <Badge className="bg-success/15 text-success border-success/30"><ShieldCheck className="h-3 w-3 mr-1" />{t("ops.accessLogs.result.granted")}</Badge>;
    if (r === "denied") return <Badge variant="destructive"><ShieldX className="h-3 w-3 mr-1" />{t("ops.accessLogs.result.denied")}</Badge>;
    if (r === "unauthenticated") return <Badge variant="outline" className="border-warning text-warning"><ShieldAlert className="h-3 w-3 mr-1" />{t("ops.accessLogs.result.unauthenticated")}</Badge>;
    return <Badge variant="secondary">{r}</Badge>;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("access_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) setError(error.message);
    setRows((data as AccessAttempt[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("access_attempts_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "access_attempts" }, (payload) => {
        setRows((prev) => [payload.new as AccessAttempt, ...prev].slice(0, PAGE_SIZE));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const routes = useMemo(() => Array.from(new Set(rows.map((r) => r.route))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (resultFilter !== "all" && r.result !== resultFilter) return false;
      if (routeFilter !== "all" && r.route !== routeFilter) return false;
      if (!q) return true;
      return (
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.user_id ?? "").toLowerCase().includes(q) ||
        r.route.toLowerCase().includes(q) ||
        (r.reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, resultFilter, routeFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    granted: rows.filter((r) => r.result === "granted").length,
    denied: rows.filter((r) => r.result === "denied").length,
    unauth: rows.filter((r) => r.result === "unauthenticated").length,
  }), [rows]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost"><Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" />{t("ops.accessLogs.adminLink")}</Link></Button>
            <div>
              <h1 className="font-heading text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> {t("ops.accessLogs.title")}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">{t("ops.accessLogs.subtitle")}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />{t("ops.accessLogs.refresh")}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="glass-card p-4">
            <div className="text-xs text-muted-foreground">{t("ops.accessLogs.stats.total", { count: PAGE_SIZE })}</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-muted-foreground">{t("ops.accessLogs.stats.granted")}</div>
            <div className="text-2xl font-bold text-success">{stats.granted}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-muted-foreground">{t("ops.accessLogs.stats.denied")}</div>
            <div className="text-2xl font-bold text-destructive">{stats.denied}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-muted-foreground">{t("ops.accessLogs.stats.unauthenticated")}</div>
            <div className="text-2xl font-bold text-warning">{stats.unauth}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <Input
            placeholder={t("ops.accessLogs.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:w-80"
          />
          <Select value={resultFilter} onValueChange={setResultFilter}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder={t("ops.accessLogs.filters.resultPlaceholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ops.accessLogs.filters.allResults")}</SelectItem>
              <SelectItem value="granted">{t("ops.accessLogs.result.granted")}</SelectItem>
              <SelectItem value="denied">{t("ops.accessLogs.result.denied")}</SelectItem>
              <SelectItem value="unauthenticated">{t("ops.accessLogs.result.unauthenticated")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={routeFilter} onValueChange={setRouteFilter}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder={t("ops.accessLogs.filters.routePlaceholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ops.accessLogs.filters.allRoutes")}</SelectItem>
              {routes.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="glass-card p-4 mb-4 border border-destructive text-destructive text-sm">
            {t("ops.accessLogs.loadError", { message: error })}
          </div>
        )}

        {/* Table */}
        <div className="glass-card overflow-x-auto">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("ops.accessLogs.noneMatch")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">{t("ops.accessLogs.headers.timestamp")}</th>
                  <th className="px-3 py-2 text-left">{t("ops.accessLogs.headers.result")}</th>
                  <th className="px-3 py-2 text-left">{t("ops.accessLogs.headers.user")}</th>
                  <th className="px-3 py-2 text-left">{t("ops.accessLogs.headers.route")}</th>
                  <th className="px-3 py-2 text-left">{t("ops.accessLogs.headers.allowedRoles")}</th>
                  <th className="px-3 py-2 text-left">{t("ops.accessLogs.headers.userRoles")}</th>
                  <th className="px-3 py-2 text-left">{t("ops.accessLogs.headers.reason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2">{resultBadge(r.result)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.email ?? <span className="text-muted-foreground italic">{t("ops.accessLogs.anonymous")}</span>}</div>
                      {r.user_id && <div className="text-[10px] text-muted-foreground font-mono">{r.user_id.slice(0, 8)}…</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.route}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.allowed_roles.map((x) => <Badge key={x} variant="outline" className="text-[10px]">{x}</Badge>)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.user_roles.length === 0
                          ? <span className="text-xs text-muted-foreground">–</span>
                          : r.user_roles.map((x) => <Badge key={x} variant="secondary" className="text-[10px]">{x}</Badge>)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
