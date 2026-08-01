import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, Loader2, MapPin, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import CleaningPlanPanel from "@/components/booking/CleaningPlanPanel";
import { useTranslation } from "react-i18next";
import { useCountryPath, loginPathWithRedirect } from "@/lib/countryPath";

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
  address_place_id: string | null;
  notes: string | null;
  customer_pays: number;
  currency: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  created_at: string;
  decided_at: string | null;
};

type TabKey = "overview" | "plan";

const STATUS_LABEL: Record<
  Booking["status"],
  { label: string; help: string; bg: string; fg: string }
> = {
  pending: {
    label: "Afventer provider",
    help: "Din bookingforespørgsel er sendt. Provideren svarer hurtigst muligt — du får besked her og i din indbakke.",
    bg: "#ffe9b8",
    fg: "#8a5a00",
  },
  accepted: {
    label: "Accepteret",
    help: "Provideren har accepteret din booking. Du behøver ikke gøre mere før dagen.",
    bg: C.mint,
    fg: C.ink,
  },
  declined: {
    label: "Afvist",
    help: "Provideren kunne ikke tage denne tid. Du kan vælge et andet tidspunkt eller finde en anden provider.",
    bg: "#f5c2b8",
    fg: "#8a2e1c",
  },
  cancelled: {
    label: "Annulleret",
    help: "Bookingen er annulleret. Er der reserveret et beløb på dit kort, frigives reservationen. Hvor lang tid det tager at se beløbet igen, afhænger af din bank og betalingsmetode.",
    bg: "#e6e2d2",
    fg: C.ink,
  },
  completed: {
    label: "Udført",
    help: "Bookingen er markeret som udført. Passer noget ikke, kan du oprette en supportsag.",
    bg: C.teal,
    fg: C.cream,
  },
};

export default function MyBookings() {
  const { t } = useTranslation("common");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const localize = useCountryPath();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [tabs, setTabs] = useState<Record<string, TabKey>>({});

  useEffect(() => {
    if (!loading && !user) navigate(loginPathWithRedirect(localize, "/mine-bookinger"));
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled) setBookings((data as Booking[]) || []);
    }
    load();
    const ch = supabase
      .channel("my-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user]);

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center" style={{ background: C.cream }}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen font-editorial" style={{ background: C.cream, color: C.ink }}>
      <header className="border-b-2" style={{ background: C.ink, color: C.cream, borderColor: C.ink }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]">
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </Link>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] opacity-70">{t("ui.myBookings.headerTitle")}</div>
          <div className="w-16" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl sm:text-4xl">{t("ui.myBookings.pageTitle")}</h1>
        <p className="mt-2 text-sm opacity-70">{t("ui.myBookings.pageSubtitle")}</p>

        <div className="mt-8 space-y-3">
          {bookings === null && <div className="opacity-60 text-sm">Henter dine bookinger…</div>}
          {bookings && bookings.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center" style={{ borderColor: `${C.ink}33` }}>
              <div className="font-display text-xl">{t("ui.myBookings.emptyTitle")}</div>
              <p className="mt-2 text-sm opacity-70">{t("ui.myBookings.emptyBody")}</p>
              <Link to="/" className="mt-4 inline-flex rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em]" style={{ background: C.orange, color: C.ink }}>
                Find en cleaner
              </Link>
            </div>
          )}
          {bookings?.map((b) => {
            const s = STATUS_LABEL[b.status];
            const d = new Date(b.booking_date).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
            const activeTab: TabKey = tabs[b.id] ?? "overview";
            const setTab = (t: TabKey) => setTabs(prev => ({ ...prev, [b.id]: t }));
            const canPlan = b.status === "accepted" || b.status === "pending" || b.status === "completed";
            return (
              <div key={b.id} className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg leading-tight">{b.provider_name}</div>
                    <div className="mt-1 text-xs opacity-70 inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> {b.service} · {b.hours} t</div>
                  </div>
                  <span className="inline-flex flex-shrink-0 items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ background: s.bg, color: s.fg }}>
                    {s.label}
                  </span>
                </div>

                {/* Tabs */}
                <div role="tablist" aria-label="Booking-visning" className="mt-4 inline-flex rounded-full border-2 p-1" style={{ borderColor: `${C.ink}22` }}>
                  {[
                    { key: "overview" as const, label: "Oversigt" },
                    { key: "plan" as const, label: "Rengøringsplan" },
                  ].map(t => {
                    const isActive = activeTab === t.key;
                    return (
                      <button
                        key={t.key}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setTab(t.key)}
                        className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-colors"
                        style={isActive
                          ? { background: C.ink, color: C.cream }
                          : { background: "transparent", color: C.ink }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {activeTab === "overview" && (
                  <>
                    <p className="mt-3 text-xs opacity-70">{s.help}</p>
                    <div className="mt-3 grid gap-1.5 text-xs">
                      <div className="inline-flex items-center gap-2 opacity-80"><Calendar className="h-3.5 w-3.5" /> {d}</div>
                      <div className="inline-flex items-center gap-2 opacity-80"><Clock className="h-3.5 w-3.5" /> kl. {b.slot}</div>
                      <div className="inline-flex items-start gap-2 opacity-80"><MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {b.address}</div>
                    </div>
                    <div className="mt-3 border-t border-dashed pt-3 text-xs flex items-baseline justify-between" style={{ borderColor: `${C.ink}22` }}>
                      <span className="opacity-60">{t("ui.myBookings.totalWithFee")}</span>
                      <span className="font-display text-base">{b.customer_pays.toLocaleString("da-DK")} {b.currency}</span>
                    </div>
                  </>
                )}

                {activeTab === "plan" && (
                  <div className="mt-4">
                    {canPlan ? (
                      <CleaningPlanPanel
                        bookingId={b.id}
                        userId={user!.id}
                        addressPlaceId={b.address_place_id}
                      />
                    ) : (
                      <div className="text-xs opacity-70">{t("ui.myBookings.planUnavailable")}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
