import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Check, Clock, Loader2, MapPin, MessageSquare, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import OnboardingChecklist, { ChecklistItem } from "@/components/OnboardingChecklist";
import { validateContact, statusFrom } from "@/lib/onboarding-validation";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard";
import { StripeConnectStatusWidget } from "@/components/provider/StripeConnectStatusWidget";
import { IdentityVerificationCard } from "@/components/identity/IdentityVerificationCard";
import { ProviderCompletionCard, CompletionRow } from "@/components/provider/ProviderCompletionCard";
import { ProviderScorePreview } from "@/components/provider/ProviderScorePreview";
import BackButton from "@/components/BackButton";



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

  async function decide(id: string, decision: "accepted" | "declined") {
    setActing(id);
    const { data, error } = await supabase.functions.invoke("booking-decide", {
      body: { booking_id: id, decision },
    });
    setActing(null);
    if (error || data?.error) {
      toast.error(error?.message || data?.error || "Noget gik galt");
    } else {
      toast.success(decision === "accepted" ? "Booking accepteret — beløb hævet" : "Booking afvist — beløb frigivet");
    }
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
    <DashboardLayout role="provider" title="Provider dashboard">
      <main className="font-editorial" style={{ background: C.cream, color: C.ink }}>
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <ProviderOnboardingChecklist
            profile={profile}
            user={user}
            bookings={bookings}
          />

          <StripeConnectStatusWidget />
          <IdentityVerificationCard />





          <h1 className="mt-10 font-display text-3xl sm:text-4xl">Dine bookinger</h1>
          <p className="mt-2 text-sm opacity-70">Accepter eller afvis nye anmodninger. Beløbet hæves først, når du accepterer.</p>


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
    </DashboardLayout>
  );
}


function ConnectCard() {
  const [status, setStatus] = useState<null | {
    connected: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
  }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.functions.invoke("stripe-connect-status").then(({ data }) => {
      if (data && !data.error) setStatus(data);
      else setStatus({ connected: false });
    });
  }, []);

  async function startOnboarding() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("stripe-connect-onboard", {
      body: { return_url: window.location.href },
    });
    setBusy(false);
    if (error || !data?.url) {
      toast.error(error?.message || data?.error || "Kunne ikke starte onboarding");
      return;
    }
    window.location.href = data.url;
  }

  if (!status) return null;
  const ok = status.connected && status.charges_enabled && status.payouts_enabled;

  return (
    <div
      className="rounded-2xl border-2 p-5"
      style={{
        borderColor: ok ? C.teal : C.orange,
        background: ok ? `${C.mint}40` : "#fff7f0",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: ok ? C.teal : C.orange }}>
            Udbetalingskonto · Stripe Connect
          </div>
          <div className="mt-1 font-display text-lg leading-tight">
            {ok ? "Klar til at modtage betalinger" : status.connected ? "Onboarding ikke færdig" : "Opret din udbetalingskonto"}
          </div>
          <div className="mt-1 text-xs opacity-70">
            {ok
              ? "Du får automatisk udbetalt din andel, når en booking accepteres og hæves."
              : "For at kunne acceptere bookinger og modtage penge skal du gennemføre Stripes onboarding."}
          </div>
        </div>
        {!ok && (
          <button
            onClick={startOnboarding}
            disabled={busy}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] disabled:opacity-50"
            style={{ background: C.orange, color: C.ink }}
          >
            {busy ? "Åbner…" : status.connected ? "Fortsæt onboarding" : "Start onboarding"}
          </button>
        )}
      </div>
    </div>
  );
}

type StripeStatus = {
  connected: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
};

function ProviderOnboardingChecklist({
  profile,
  user,
  bookings,
}: {
  profile: any;
  user: any;
  bookings: Booking[] | null;
}) {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.functions.invoke("stripe-connect-status").then(({ data }) => {
      if (data && !data.error) setStatus(data as StripeStatus);
      else setStatus({ connected: false });
    });
  }, []);

  async function startOnboarding() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("stripe-connect-onboard", {
      body: { return_url: window.location.href },
    });
    setBusy(false);
    if (error || !data?.url) {
      toast.error(error?.message || data?.error || "Kunne ikke starte onboarding");
      return;
    }
    window.location.href = data.url;
  }

  const items: ChecklistItem[] = useMemo(() => {
    const contactV = validateContact({
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      country_code: profile?.country_code ?? "",
    });
    const profileLinked = !!profile?.provider_id;
    const emailVerified = !!user?.email_confirmed_at || !!user?.confirmed_at;
    const acceptedAny = (bookings || []).some((b) => b.status === "accepted" || b.status === "completed");

    let stripeStatus: ChecklistItem["status"] = "incomplete";
    let stripeDesc = "Opret en Stripe Connect-konto for at modtage betalinger.";
    if (status === null) { stripeStatus = "pending"; stripeDesc = "Henter status…"; }
    else if (status.connected && status.charges_enabled && status.payouts_enabled) {
      stripeStatus = "complete"; stripeDesc = "Klar til at modtage betalinger.";
    } else if (status.connected) {
      stripeStatus = "pending"; stripeDesc = "Stripe mangler at færdiggøre verificering.";
    }

    return [
      {
        key: "profile",
        title: "Kontaktoplysninger",
        description: contactV.ok && profileLinked
          ? "Navn, telefon og provider-ID er valideret."
          : !profileLinked
            ? "Provider-ID mangler på din profil."
            : (contactV.error || "Udfyld navn, telefon og land."),
        status: statusFrom({ ok: contactV.ok && profileLinked, error: contactV.error }),
        actionLabel: "Til profil",
        onAction: () => { window.location.href = "/profil"; },
      },
      {
        key: "email",
        title: "Bekræft email",
        description: emailVerified ? "Din email er bekræftet." : "Vi har sendt et bekræftelses-link til din indbakke.",
        status: emailVerified ? "complete" : "pending",
      },
      {
        key: "approval",
        title: "Manuel godkendelse",
        description: "Vores team gennemgår din ansøgning inden for 24–48 timer.",
        status: "pending",
      },
      {
        key: "stripe",
        title: "Udbetalingskonto (Stripe Connect)",
        description: stripeDesc,
        status: stripeStatus,
        actionLabel: status?.connected ? "Fortsæt" : "Start",
        onAction: startOnboarding,
      },
      {
        key: "first-booking",
        title: "Første accepterede booking",
        description: acceptedAny ? "Du har accepteret din første booking." : "Du modtager besked, så snart en kunde anmoder om dig.",
        status: acceptedAny ? "complete" : "pending",
      },
    ];
  }, [profile, user, bookings, status, busy]);

  return (
    <OnboardingChecklist
      title="Færdiggør din opsætning"
      subtitle="Få alle trin på plads, så du kan modtage og acceptere bookinger."
      items={items}
    />
  );
}


