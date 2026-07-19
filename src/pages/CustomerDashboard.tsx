import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Bell,
  Calendar,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Sparkles,
  UserCircle,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/components/Inbox";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

type Booking = {
  id: string;
  provider_name: string;
  service: string;
  hours: number;
  booking_date: string;
  slot: string;
  address: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  customer_pays: number;
  currency: string;
};

type Addr = { id: string; label: string | null; address: string | null; is_primary: boolean };

/* ---------- Isolated widgets (each wrapped by AppErrorBoundary in the parent) ---------- */

function WelcomeCard() {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [completion, setCompletion] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name,phone,address,country_code")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        const first = (data.full_name || "").split(" ")[0] || null;
        setName(first);
        const fields = [data.full_name, data.phone, data.address, data.country_code];
        const filled = fields.filter(Boolean).length;
        setCompletion(Math.round((filled / fields.length) * 100));
      }
    })();
  }, [user]);
  return (
    <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">Velkommen</div>
      <h2 className="mt-1 font-display text-2xl" style={{ color: C.ink }}>
        Hej {name ?? "der"} 👋
      </h2>
      <p className="mt-2 text-sm opacity-70">
        Her er et hurtigt overblik over dine bookinger og din konto.
      </p>
      {completion !== null && completion < 100 && (
        <div className="mt-4">
          <div className="text-xs opacity-70">Profil er {completion}% udfyldt</div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div className="h-full" style={{ width: `${completion}%`, background: C.teal }} />
          </div>
          <Link
            to="/customer/profile"
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: C.teal }}
          >
            Færdiggør profil <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<Booking["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Afventer cleaner", bg: "#ffe9b8", fg: "#8a5a00" },
  accepted: { label: "Accepteret", bg: C.mint, fg: C.ink },
  declined: { label: "Afvist", bg: "#f5c2b8", fg: "#8a2e1c" },
  cancelled: { label: "Annulleret", bg: "#e6e2d2", fg: C.ink },
  completed: { label: "Udført", bg: C.teal, fg: C.cream },
};

function BookingsWidget() {
  const { user } = useAuth();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [bookings, setBookings] = useState<Booking[]>([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,provider_name,service,hours,booking_date,slot,address,status,customer_pays,currency")
        .eq("customer_user_id", user.id)
        .order("booking_date", { ascending: true });
      if (cancelled) return;
      if (error) setState("error");
      else {
        setBookings((data ?? []) as Booking[]);
        setState("ready");
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = bookings.filter(
    (b) => new Date(b.booking_date) >= today && b.status !== "cancelled" && b.status !== "declined",
  );
  const nearest = upcoming[0];
  const active = upcoming.slice(0, 3);

  return (
    <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">Kommende booking</div>
        <Link to="/customer/bookings" className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: C.teal }}>
          Se alle
        </Link>
      </div>
      {state === "loading" && (
        <div className="mt-4 flex items-center gap-2 text-xs opacity-60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter bookinger…
        </div>
      )}
      {state === "error" && (
        <div className="mt-4 text-xs opacity-70">Kunne ikke hente bookinger. Prøv igen senere.</div>
      )}
      {state === "ready" && !nearest && (
        <div className="mt-4 rounded-xl border-2 border-dashed p-5 text-center" style={{ borderColor: `${C.ink}22` }}>
          <div className="font-display text-lg" style={{ color: C.ink }}>Ingen kommende bookinger</div>
          <p className="mt-1 text-xs opacity-70">Find en cleaner og book direkte i kalenderen.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link to="/book" className="rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em]" style={{ background: C.orange, color: C.ink }}>
              Book rengøring
            </Link>
            <Link to="/find-cleaner" className="rounded-full border-2 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em]" style={{ borderColor: C.ink, color: C.ink }}>
              Find cleaner
            </Link>
          </div>
        </div>
      )}
      {state === "ready" && nearest && (
        <>
          <BookingCard b={nearest} highlight />
          {active.length > 1 && (
            <div className="mt-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">Aktive bookinger</div>
              <div className="mt-2 space-y-2">
                {active.slice(1).map((b) => <BookingCard key={b.id} b={b} compact />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BookingCard({ b, highlight, compact }: { b: Booking; highlight?: boolean; compact?: boolean }) {
  const s = STATUS_LABEL[b.status];
  const d = new Date(b.booking_date).toLocaleDateString("da-DK", {
    weekday: "short", day: "numeric", month: "short",
  });
  return (
    <Link
      to={`/booking/${b.id}/plan`}
      className="mt-3 block rounded-xl border-2 p-4 transition hover:shadow-sm"
      style={{ borderColor: `${C.ink}22`, background: highlight ? C.cream : "white" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-base leading-tight" style={{ color: C.ink }}>{b.provider_name}</div>
          <div className="mt-1 text-xs opacity-70 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> {b.service} · {b.hours} t
          </div>
        </div>
        <span className="inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ background: s.bg, color: s.fg }}>
          {s.label}
        </span>
      </div>
      {!compact && (
        <div className="mt-3 grid gap-1.5 text-xs">
          <div className="inline-flex items-center gap-2 opacity-80"><Calendar className="h-3.5 w-3.5" /> {d}</div>
          <div className="inline-flex items-center gap-2 opacity-80"><Clock className="h-3.5 w-3.5" /> kl. {b.slot}</div>
          <div className="inline-flex items-start gap-2 opacity-80"><MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {b.address}</div>
        </div>
      )}
    </Link>
  );
}

function NotificationsWidget() {
  const { items, unread, loading } = useNotifications();
  const latest = items.slice(0, 3);
  return (
    <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">Notifikationer</div>
        <Link to="/customer/notifications" className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: C.teal }}>
          Åbn inbox {unread > 0 ? `(${unread})` : ""}
        </Link>
      </div>
      {loading && (
        <div className="mt-4 flex items-center gap-2 text-xs opacity-60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter…
        </div>
      )}
      {!loading && latest.length === 0 && (
        <div className="mt-4 text-sm opacity-70">Ingen nye notifikationer.</div>
      )}
      {!loading && latest.length > 0 && (
        <ul className="mt-3 space-y-2">
          {latest.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: `${C.ink}22` }}>
              <Bell className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: C.teal }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: C.ink }}>{n.title}</div>
                <div className="text-xs opacity-70 line-clamp-2">{n.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvoicesWidget() {
  const { user } = useAuth();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: b, error: be } = await supabase
        .from("bookings")
        .select("id")
        .eq("customer_user_id", user.id);
      if (cancelled) return;
      if (be) { setState("error"); return; }
      const ids = (b ?? []).map((x: any) => x.id);
      if (ids.length === 0) { setCount(0); setState("ready"); return; }
      const { count: c, error } = await supabase
        .from("platform_fee_invoices")
        .select("id", { count: "exact", head: true })
        .in("booking_id", ids);
      if (cancelled) return;
      if (error) setState("error");
      else { setCount(c ?? 0); setState("ready"); }
    })();
    return () => { cancelled = true; };
  }, [user]);
  return (
    <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">Fakturaer</div>
        <Link to="/customer/invoices" className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: C.teal }}>
          Se alle
        </Link>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <FileText className="h-6 w-6" style={{ color: C.teal }} />
        <div className="min-w-0">
          {state === "loading" && <div className="text-xs opacity-60">Henter…</div>}
          {state === "error" && <div className="text-xs opacity-70">Kunne ikke hente fakturaer.</div>}
          {state === "ready" && (
            <div className="text-sm">
              <span className="font-display text-xl" style={{ color: C.ink }}>{count}</span>{" "}
              <span className="opacity-70">{count === 1 ? "faktura tilgængelig" : "fakturaer tilgængelige"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddressesWidget() {
  const { user } = useAuth();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<Addr[]>([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("id,label,address,is_primary")
        .eq("user_id", user.id);
      if (cancelled) return;
      if (error) setState("error");
      else { setRows((data ?? []) as Addr[]); setState("ready"); }
    })();
    return () => { cancelled = true; };
  }, [user]);
  const primary = rows.find((r) => r.is_primary) ?? rows[0];
  return (
    <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">Adresser</div>
        <Link to="/customer/addresses" className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: C.teal }}>
          Administrér
        </Link>
      </div>
      {state === "loading" && <div className="mt-3 text-xs opacity-60">Henter…</div>}
      {state === "error" && <div className="mt-3 text-xs opacity-70">Kunne ikke hente adresser.</div>}
      {state === "ready" && !primary && (
        <div className="mt-3 text-sm opacity-70">Ingen gemte adresser endnu.</div>
      )}
      {state === "ready" && primary && (
        <div className="mt-3">
          <div className="text-sm font-semibold" style={{ color: C.ink }}>{primary.label || "Primær adresse"}</div>
          <div className="text-xs opacity-70">{primary.address}</div>
          <div className="mt-2 text-xs opacity-60">{rows.length} gemt{rows.length === 1 ? "" : "e"}</div>
        </div>
      )}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">Genveje</div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { to: "/book", label: "Book rengøring", icon: Sparkles, bg: C.orange, fg: C.ink },
          { to: "/find-cleaner", label: "Find cleaner", icon: MapPin, bg: C.teal, fg: C.cream },
          { to: "/customer/bookings", label: "Mine bookinger", icon: Calendar, bg: C.mint, fg: C.ink },
          { to: "/customer/profile", label: "Min profil", icon: UserCircle, bg: C.cream, fg: C.ink },
          { to: "/customer/invoices", label: "Fakturaer", icon: Wallet, bg: C.cream, fg: C.ink },
          { to: "/faq", label: "Support & FAQ", icon: Bell, bg: C.cream, fg: C.ink },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ background: a.bg, color: a.fg, borderColor: C.ink }}
          >
            <a.icon className="h-3.5 w-3.5" /> {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function IsolatedWidget({ children }: { children: React.ReactNode }) {
  return (
    <AppErrorBoundary
      fallback={
        <div className="rounded-2xl border-2 border-dashed bg-white p-4 text-xs opacity-70" style={{ borderColor: `${C.ink}22` }}>
          Kunne ikke indlæse dette afsnit. Prøv at genindlæse siden.
        </div>
      }
    >
      {children}
    </AppErrorBoundary>
  );
}

/* ---------- Page ---------- */

export default function CustomerDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { country } = useParams();
  useEffect(() => {
    if (!loading && !user) {
      const returnUrl = country ? `/${country}/customer` : "/customer";
      navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`, { replace: true });
    }
  }, [user, loading, navigate, country]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center" style={{ background: C.cream }}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }
  if (!user) return null;

  return (
    <DashboardLayout role="customer" title="Min konto">
      <DashboardPage title="Oversigt" description="Dine bookinger, notifikationer og konto på ét sted.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <IsolatedWidget><WelcomeCard /></IsolatedWidget>
            <IsolatedWidget><BookingsWidget /></IsolatedWidget>
            <IsolatedWidget><QuickActions /></IsolatedWidget>
          </div>
          <div className="space-y-4">
            <IsolatedWidget><NotificationsWidget /></IsolatedWidget>
            <IsolatedWidget><InvoicesWidget /></IsolatedWidget>
            <IsolatedWidget><AddressesWidget /></IsolatedWidget>
          </div>
        </div>
      </DashboardPage>
    </DashboardLayout>
  );
}

/** Simple route target that renders <Navigate> — keeps declaration in App.tsx tidy. */
export function CustomerRedirect({ to }: { to: string }) {
  return <Navigate to={to} replace />;
}
