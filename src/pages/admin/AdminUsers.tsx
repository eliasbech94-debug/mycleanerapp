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

type Row = { user_id: string; full_name: string | null; roles: AppRole[] };

const ALL_ROLES: AppRole[] = ["customer", "provider", "employee", "support", "admin", "super_admin"];

export default function AdminUsers() {
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
      toast.success(pending.op === "grant" ? "Rolle tildelt" : "Rolle fjernet");
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
    <DashboardLayout role="admin" title="Brugere & roller">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-serif">Brugere & roller</h1>
          <p className="text-sm text-muted-foreground">
            Alle rolleændringer skrives i admin_audit_log. Kun admin/super_admin kan ændre roller.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Søg & filtrér</CardTitle></CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Søg efter navn eller bruger-id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle roller</SelectItem>
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
                    <div className="font-medium truncate">{r.full_name ?? "Uden navn"}</div>
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
                      // Non super-admins cannot manage super_admin role
                      if (role === "super_admin" && !isSuperAdmin) return false;
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
                          {has ? `Fjern ${role}` : `Giv ${role}`}
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Ingen brugere matcher.</p>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Bekræft rolleændring
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.op === "grant" ? "Tildel" : "Fjern"} rollen <b>{pending?.role}</b> for bruger <code>{pending?.userId}</code>.
              Dette logges permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Årsag (valgfrit men anbefalet)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={apply} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bekræft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
