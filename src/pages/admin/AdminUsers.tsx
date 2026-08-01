import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { Loader2, ShieldPlus, ShieldMinus } from "lucide-react";
import { useTranslation } from "react-i18next";

type Row = { user_id: string; full_name: string | null; roles: AppRole[] };

const ALL_ROLES: AppRole[] = ["customer", "provider", "employee", "support", "admin", "super_admin"];

export default function AdminUsers() {
  const { t } = useTranslation("admin");
  const { isSuperAdmin } = useUserRoles();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AppRole | "all">("all");
  const [pending, setPending] = useState<{
    userId: string; role: AppRole; op: "grant" | "revoke";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: rolesData }, { data: profilesData }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    const nameById = new Map<string, string | null>();
    (profilesData ?? []).forEach((p: any) => nameById.set(p.id, p.full_name));
    const rolesByUser = new Map<string, AppRole[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    const merged: Row[] = Array.from(rolesByUser.entries()).map(([user_id, roles]) => ({
      user_id, roles, full_name: nameById.get(user_id) ?? null,
    }));
    merged.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
    setRows(merged);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && !r.roles.includes(filter)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (r.full_name ?? "").toLowerCase().includes(q) || r.user_id.includes(q);
    });
  }, [rows, search, filter]);

  async function apply() {
    if (!pending) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-user-role", {
        body: {
          op: pending.op,
          target_user_id: pending.userId,
          role: pending.role,
          reason: reason || undefined,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(pending.op === "grant" ? t("pages.adminUsers.roleGranted") : t("pages.adminUsers.roleRevoked"));
      setPending(null);
      setReason("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout role="admin" showBack backTo="/admin" title={t("pages.adminUsers.title")}>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-serif">{t("pages.adminUsers.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("pages.adminUsers.subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>{t("pages.adminUsers.searchAndFilter")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder={t("pages.adminUsers.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages.adminUsers.allRoles")}</SelectItem>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <Card key={r.user_id}>
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.full_name ?? t("pages.adminUsers.noName")}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{r.user_id}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {r.roles.map((role) => (
                        <Badge key={role} variant={role === "super_admin" ? "destructive" : "secondary"}>
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.filter((role) => {
                      // Only super_admin may manage privileged (staff) roles.
                      const privileged: AppRole[] = ["employee", "support", "admin", "super_admin"];
                      if (privileged.includes(role) && !isSuperAdmin) return false;
                      return true;
                    }).map((role) => {
                      const has = r.roles.includes(role);
                      return (
                        <Button
                          key={role}
                          size="sm"
                          variant={has ? "outline" : "secondary"}
                          onClick={() => setPending({ userId: r.user_id, role, op: has ? "revoke" : "grant" })}
                        >
                          {has ? <ShieldMinus className="h-3 w-3 mr-1" /> : <ShieldPlus className="h-3 w-3 mr-1" />}
                          {has ? t("pages.adminUsers.removeRole", { role }) : t("pages.adminUsers.giveRole", { role })}
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">{t("pages.adminUsers.noUsersMatch")}</p>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("pages.adminUsers.confirmRoleChangeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.op === "grant" ? t("pages.adminUsers.grant") : t("pages.adminUsers.remove")} {t("pages.adminUsers.roleForUser")} <b>{pending?.role}</b> <code>{pending?.userId}</code>.
              {t("pages.adminUsers.loggedPermanently")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder={t("pages.adminUsers.reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("pages.adminUsers.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={apply} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pages.adminUsers.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
