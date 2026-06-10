import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle2, ChevronRight, Inbox, Info, Loader2, RefreshCw, ShieldAlert, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a" };

export type Notification = {
  id: string;
  kind: "setup" | "reminder" | "cleaner_message" | "tip" | "alert" | "update";
  severity: "info" | "warning" | "error" | "success";
  title: string;
  body: string;
  action_label: string | null;
  action_url: string | null;
  related_booking_id: string | null;
  related_thread_id: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("customer_notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_notifications", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    await supabase.from("customer_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  };
  const dismiss = async (id: string) => {
    await supabase.from("customer_notifications").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
    setItems((p) => p.filter((n) => n.id !== id));
  };
  const markAllRead = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase
      .from("customer_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    setItems((p) => p.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
  };

  return { items, unread, loading, refresh, markRead, dismiss, markAllRead };
}

function severityStyle(s: Notification["severity"]) {
  switch (s) {
    case "error":
      return { bg: "#fdecea", fg: "#b91c1c", icon: ShieldAlert };
    case "warning":
      return { bg: "#fff4e5", fg: C.orange, icon: ShieldAlert };
    case "success":
      return { bg: "#e6f7ec", fg: "#16a34a", icon: CheckCircle2 };
    default:
      return { bg: `${C.teal}1a`, fg: C.teal, icon: Info };
  }
}

export function NotificationBell({ onOpen }: { onOpen: () => void }) {
  const { unread } = useNotifications();
  return (
    <button
      onClick={onOpen}
      className="relative inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5"
      style={{ color: C.cream }}
      aria-label="Indbakke"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span
          className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-black"
          style={{ background: C.orange, color: "#fff" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

export function InboxPanel({
  onOpenThread,
}: {
  onOpenThread?: (threadId: string) => void;
}) {
  const { items, loading, markRead, dismiss, markAllRead, refresh } = useNotifications();
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  const runCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("account-check");
      if (error) throw error;
      const created = (data as any)?.created ?? 0;
      toast.success(
        created > 0
          ? `${created} ny${created === 1 ? "" : "e"} besked${created === 1 ? "" : "er"} i din indbakke`
          : "Alt ser fint ud — ingen nye beskeder",
      );
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke køre tjek");
    } finally {
      setChecking(false);
    }
  };

  const handleClick = (n: Notification) => {
    if (!n.read_at) markRead(n.id);
    if (n.related_thread_id && onOpenThread) {
      onOpenThread(n.related_thread_id);
    } else if (n.action_url) {
      navigate(n.action_url);
    }
  };

  return (
    <div className="rounded-2xl border-2 p-5" style={{ borderColor: `${C.ink}14`, background: C.cream }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: C.ink, color: C.cream }}>
            <Inbox className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-xl">Indbakke</h2>
            <p className="text-[11px] opacity-60">AI- og system-beskeder · realtime</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runCheck}
            disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-50"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
          >
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Tjek konto
          </button>
          {items.some((n) => !n.read_at) && (
            <button
              onClick={markAllRead}
              className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-70 hover:opacity-100"
              style={{ color: C.ink }}
            >
              Markér alt læst
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-10 opacity-60">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed px-4 py-10 text-center" style={{ borderColor: `${C.ink}22` }}>
          <Sparkles className="mx-auto mb-2 h-5 w-5 opacity-60" />
          <p className="text-sm opacity-70">Din indbakke er tom. Tryk "Tjek konto" for at lade AI-assistenten gennemgå din opsætning.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const sty = severityStyle(n.severity);
            const Icon = sty.icon;
            const unread = !n.read_at;
            return (
              <li
                key={n.id}
                className="group flex items-start gap-3 rounded-xl border-2 p-3 transition hover:shadow-sm"
                style={{
                  borderColor: unread ? sty.fg + "55" : `${C.ink}14`,
                  background: unread ? sty.bg : "#fff",
                }}
              >
                <span
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg"
                  style={{ background: sty.bg, color: sty.fg }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <button
                  onClick={() => handleClick(n)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold leading-tight">{n.title}</h3>
                    {unread && (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: sty.fg }} />
                    )}
                  </div>
                  {n.body && <p className="mt-0.5 text-[13px] opacity-80">{n.body}</p>}
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] opacity-60">
                    <span>{new Date(n.created_at).toLocaleString("da-DK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {(n.action_label || n.related_thread_id) && (
                      <span className="inline-flex items-center gap-1 font-bold" style={{ color: sty.fg }}>
                        {n.action_label || "Åbn samtale"} <ChevronRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => dismiss(n.id)}
                  className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                  aria-label="Afvis"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
