import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Check, Clock, Loader2, MapPin, MessageSquare, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

type Booking = {
  id: string;
  provider_id: string;
  provider_name: string;
  service: string;
  hours: number;
  booking_date: string;
  slot: string;
  address: string;
  notes: string | null;
  customer_pays: number;
  provider_gets: number;
  currency: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  created_at: string;
};

const STATUS_LABEL: Record<Booking["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Ny anmodning", bg: "#ffe9b8", fg: "#8a5a00" },
  accepted: { label: "Accepteret", bg: C.mint, fg: C.ink },
  declined: { label: "Afvist", bg: "#f5c2b8", fg: "#8a2e1c" },
  cancelled: { label: "Annulleret", bg: "#e6e2d2", fg: C.ink },
  completed: { label: "Udført", bg: C.teal, fg: C.cream },
};

export default function ProviderDashboard() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "all">("pending");

  useEffect(() => {
    if (!loading && !user) navigate("/login?redirect=/provider-dashboard");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user || !profile?.provider_id) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("provider_id", profile!.provider_id!)
        .order("created_at", { ascending: false });
      if (!cancelled) setBookings((data as Booking[]) || []);
    }
    load();
    const ch = supabase
      .channel("provider-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user, profile?.provider_id]);

  async function decide(id: string, status: "accepted" | "declined") {
    setActing(id);
    const { error } = await supabase
      .from("bookings")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", id);
    setActing(null);
    if (error) toast.error(error.message);
    else toast.success(status === "accepted" ? "Booking accepteret" : "Booking afvist");
  }

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center" style={{ background: C.cream }}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (!profile?.provider_id) {
    return (
      <main className="min-h-screen grid place-items-center font-editorial" style={{ background: C.cream, color: C.ink }}>
        <div className="mx-auto max-w-md rounded-3xl border-2 bg-white p-8 text-center" style={{ borderColor: C.ink }}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: C.mint }}>
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl">Du er ikke knyttet til en provider</h1>
          <p className="mt-2 text-sm opacity-70">Gå til din profil og indtast dit provider-ID for at få adgang til dashboardet.</p>
          <Link to="/profil" className="mt-5 inline-flex rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em]" style={{ background: C.orange, color: C.ink }}>
            Til min profil
          </Link>
        </div>
      </main>
    );
  }

  const filtered = bookings?.filter((b) => (tab === "pending" ? b.status === "pending" : true)) || [];

  return (
    <main className="min-h-screen font-editorial" style={{ background: C.cream, color: C.ink }}>
      <header className="border-b-2" style={{ background: C.ink, color: C.cream, borderColor: C.ink }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]">
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </Link>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] opacity-70">Provider dashboard</div>
          <div className="text-[10px] opacity-70">{profile.provider_id}</div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl sm:text-4xl">Dine bookinger</h1>
        <p className="mt-2 text-sm opacity-70">Accepter eller afvis nye anmodninger.</p>

        <div className="mt-6 inline-flex rounded-full border-2 p-1" style={{ borderColor: `${C.ink}22`, background: "white" }}>
          {(["pending", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition"
              style={{ background: tab === t ? C.ink : "transparent", color: tab === t ? C.cream : C.ink }}
            >
              {t === "pending" ? `Afventer (${bookings?.filter((b) => b.status === "pending").length ?? 0})` : "Alle"}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {bookings === null && <div className="opacity-60 text-sm">Henter…</div>}
          {bookings && filtered.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center" style={{ borderColor: `${C.ink}33` }}>
              <div className="font-display text-xl">Ingen {tab === "pending" ? "afventende" : ""} bookinger</div>
            </div>
          )}
          {filtered.map((b) => {
            const s = STATUS_LABEL[b.status];
            const d = new Date(b.booking_date).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
            return (
              <div key={b.id} className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg leading-tight">{b.service} · {b.hours} t</div>
                    <div className="mt-1 text-xs opacity-70">Modtaget {new Date(b.created_at).toLocaleString("da-DK")}</div>
                  </div>
                  <span className="inline-flex flex-shrink-0 items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ background: s.bg, color: s.fg }}>
                    {s.label}
                  </span>
                </div>

                <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                  <div className="inline-flex items-center gap-2 opacity-80"><Calendar className="h-3.5 w-3.5" /> {d}</div>
                  <div className="inline-flex items-center gap-2 opacity-80"><Clock className="h-3.5 w-3.5" /> kl. {b.slot}</div>
                  <div className="inline-flex items-start gap-2 opacity-80 sm:col-span-2"><MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {b.address}</div>
                  {b.notes && (
                    <div className="inline-flex items-start gap-2 opacity-80 sm:col-span-2"><MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {b.notes}</div>
                  )}
                </div>

                <div className="mt-4 flex items-end justify-between border-t border-dashed pt-3" style={{ borderColor: `${C.ink}22` }}>
                  <div className="text-xs">
                    <div className="opacity-60">Du tjener</div>
                    <div className="font-display text-xl">{b.provider_gets.toLocaleString("da-DK")} {b.currency}</div>
                  </div>
                  {b.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        disabled={acting === b.id}
                        onClick={() => decide(b.id, "declined")}
                        className="inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] disabled:opacity-40"
                        style={{ borderColor: "#c2412c", color: "#c2412c" }}
                      >
                        <X className="h-3.5 w-3.5" /> Afvis
                      </button>
                      <button
                        disabled={acting === b.id}
                        onClick={() => decide(b.id, "accepted")}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 shadow-[4px_4px_0_rgba(10,61,58,0.18)]"
                        style={{ background: C.orange, color: C.ink }}
                      >
                        <Check className="h-3.5 w-3.5" /> Accepter
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
