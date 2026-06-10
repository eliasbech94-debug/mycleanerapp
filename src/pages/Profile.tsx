import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowDownCircle, ArrowRight, ArrowUpCircle, Calendar, CheckCircle2, Clock, CreditCard, FileText, History, Home, LayoutDashboard, Loader2,
  LogOut, MapPin, Plus, Receipt, Sparkles, Star, Trash2, User as UserIcon, XCircle,
} from "lucide-react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import AddressBook from "@/components/AddressBook";
import { toast } from "sonner";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

type TabKey = "info" | "addresses" | "bookings" | "cards" | "invoices" | "history";

const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
  { key: "info", label: "Info", icon: UserIcon },
  { key: "addresses", label: "Adresser", icon: Home },
  { key: "bookings", label: "Bookinger", icon: Calendar },
  { key: "cards", label: "Betalingskort", icon: CreditCard },
  { key: "invoices", label: "Fakturaer", icon: FileText },
  { key: "history", label: "Betalingshistorik", icon: History },
];

export default function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabKey) || "info";

  useEffect(() => {
    if (!loading && !user) navigate("/login?redirect=/profil");
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center" style={{ background: C.cream }}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen font-editorial" style={{ background: C.cream, color: C.ink }}>
      <ProfileHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap gap-2 border-b-2 pb-3" style={{ borderColor: `${C.ink}22` }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setParams({ tab: t.key })}
                className="inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition"
                style={{
                  background: active ? C.ink : "transparent",
                  color: active ? C.cream : C.ink,
                  borderColor: active ? C.ink : `${C.ink}33`,
                }}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {tab === "info" && <InfoTab />}
          {tab === "addresses" && <AddressesTab />}
          {tab === "bookings" && <BookingsTab />}
          {tab === "cards" && <CardsTab />}
          {tab === "invoices" && <InvoicesTab />}
          {tab === "history" && <HistoryTab />}
        </div>
      </div>
    </main>
  );
}

function ProfileHeader() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <header className="border-b-2" style={{ background: C.ink, color: C.cream, borderColor: C.ink }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]">
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </Link>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] opacity-70">Min profil</div>
          <button
            onClick={() => { signOut(); navigate("/"); }}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] opacity-80 hover:opacity-100"
          >
            <LogOut className="h-3.5 w-3.5" /> Log ud
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.ink})`, color: C.cream }}>
            <UserIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="font-display text-3xl sm:text-4xl">{profile?.full_name || "Din profil"}</h1>
            <p className="text-sm opacity-70">{user?.email}</p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- INFO TAB ---------- */
function InfoTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [providerId, setProviderId] = useState("");
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [addrValid, setAddrValid] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setProviderId(profile.provider_id || "");
      setAddress(profile.address || "");
      setPlaceId(profile.address_place_id);
      setLat(profile.lat);
      setLng(profile.lng);
      setAddrValid(!!profile.address && !!profile.address_place_id);
    }
  }, [profile]);

  async function save() {
    if (!user) return;
    if (address && !addrValid) {
      toast.error("Vælg en gyldig adresse fra listen før du gemmer.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName,
      phone,
      provider_id: providerId.trim() || null,
      address: address || null,
      address_place_id: placeId,
      lat,
      lng,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    toast.success("Profil gemt");
  }

  return (
    <div className="space-y-4">
      <Field label="Fulde navn">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-transparent text-base focus:outline-none" placeholder="Fx Mette Hansen" />
      </Field>
      <Field label="Telefon">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-transparent text-base focus:outline-none" placeholder="+45 12 34 56 78" type="tel" />
      </Field>
      <Field label="Provider-ID (kun hvis du selv er cleaner)">
        <input value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full bg-transparent text-base focus:outline-none" placeholder="Fx p_002" />
        <div className="mt-1 text-[10px] opacity-60">
          Indtast dit provider-ID for at få adgang til <Link to="/provider-dashboard" className="font-bold underline">provider-dashboardet</Link>.
        </div>
      </Field>
      <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Min adresse</div>
        <div className="mt-2">
          <AddressAutocomplete
            value={address}
            onChange={(v) => { setAddress(v); setAddrValid(false); }}
            onSelect={(p) => { setAddress(p.address); setPlaceId(p.placeId); setLat(p.lat ?? null); setLng(p.lng ?? null); setAddrValid(true); }}
            onValidityChange={setAddrValid}
            isValid={addrValid}
            countries={["dk"]}
            placeholder="Vej, nr., etage, by"
          />
        </div>
      </div>
      <button
        disabled={saving}
        onClick={save}
        className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] shadow-[6px_6px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:opacity-50"
        style={{ background: C.orange, color: C.ink }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Gem profil
      </button>
    </div>
  );
}

/* ---------- ADDRESSES TAB ---------- */
function AddressesTab() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl">Mine adresser</h2>
        <p className="text-sm opacity-70">
          Tilføj flere adresser med adgangsinformation, dyr, parkering m.m. Den primære adresse vælges automatisk ved booking.
        </p>
      </div>
      <AddressBook />
    </div>
  );
}


/* ---------- BOOKINGS TAB ---------- */
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
  currency: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  payment_status: "none" | "authorized" | "captured" | "canceled" | "failed" | "refunded" | "partially_refunded";
  created_at: string;
  decided_at: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  refund_id: string | null;
  refund_reason: string | null;
  refund_amount: number | null;
  refunded_at: string | null;
  refunds: RefundEntry[] | null;
};

type RefundEntry = {
  id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  failure_reason: string | null;
  created_at: string | null;
};

const STATUS_LABEL: Record<Booking["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Afventer cleaner", bg: "#ffe9b8", fg: "#8a5a00" },
  accepted: { label: "Accepteret", bg: C.mint, fg: C.ink },
  declined: { label: "Afvist", bg: "#f5c2b8", fg: "#8a2e1c" },
  cancelled: { label: "Annulleret", bg: "#e6e2d2", fg: C.ink },
  completed: { label: "Udført", bg: C.teal, fg: C.cream },
};

function useBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("bookings").select("*").order("created_at", { ascending: false });
      if (!cancelled) setBookings(((data as unknown) as Booking[]) || []);
    }
    load();
    const ch = supabase
      .channel("profile-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user]);

  return bookings;
}

function BookingsTab() {
  const bookings = useBookings();
  const [, setParams] = useSearchParams();
  if (bookings === null) return <div className="opacity-60 text-sm">Henter…</div>;
  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center" style={{ borderColor: `${C.ink}33` }}>
        <div className="font-display text-xl">Ingen bookinger endnu</div>
        <p className="mt-2 text-sm opacity-70">Find en cleaner og book direkte i kalenderen.</p>
        <Link to="/" className="mt-4 inline-flex rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em]" style={{ background: C.orange, color: C.ink }}>
          Find cleaner
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {bookings.map((b) => {
        const s = STATUS_LABEL[b.status];
        const p = PAYMENT_LABEL[b.payment_status];
        const d = new Date(b.booking_date).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
        const hasReceipt = b.payment_status === "captured" || b.status === "completed";
        return (
          <div key={b.id} className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-lg leading-tight">{b.provider_name}</div>
                <div className="mt-1 text-xs opacity-70 inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> {b.service} · {b.hours} t</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ background: s.bg, color: s.fg }}>
                  {s.label}
                </span>
                {p && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: p.fg, color: p.fg, background: p.bg }}>
                    {p.label}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 grid gap-1.5 text-xs">
              <div className="inline-flex items-center gap-2 opacity-80"><Calendar className="h-3.5 w-3.5" /> {d}</div>
              <div className="inline-flex items-center gap-2 opacity-80"><Clock className="h-3.5 w-3.5" /> kl. {b.slot}</div>
              <div className="inline-flex items-start gap-2 opacity-80"><MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {b.address}</div>
              {b.payment_method_last4 && (
                <div className="inline-flex items-center gap-2 opacity-80">
                  <CreditCard className="h-3.5 w-3.5" />
                  {(b.payment_method_brand || "Kort").toUpperCase()} •••• {b.payment_method_last4}
                </div>
              )}
            </div>
            {(() => {
              const isPartial = b.payment_status === "partially_refunded";
              const isFull = b.payment_status === "refunded";
              const remaining = b.customer_pays - (b.refund_amount ?? 0);
              return (
                <>
                  <div className="mt-3 border-t border-dashed pt-3 text-xs space-y-1" style={{ borderColor: `${C.ink}22` }}>
                    <div className="flex items-baseline justify-between">
                      <span className="opacity-60">Total</span>
                      <span className="font-display text-base">{b.customer_pays.toLocaleString("da-DK")} {b.currency}</span>
                    </div>
                    {(isPartial || isFull) && b.refund_amount != null && (
                      <>
                        <div className="flex items-baseline justify-between" style={{ color: "#4a2a8a" }}>
                          <span>Refunderet</span>
                          <span>− {b.refund_amount.toLocaleString("da-DK")} {b.currency}</span>
                        </div>
                        <div className="flex items-baseline justify-between font-bold pt-1 border-t border-dashed" style={{ borderColor: `${C.ink}22` }}>
                          <span>{isFull ? "Du har betalt" : "Du betaler stadig"}</span>
                          <span>{Math.max(0, remaining).toLocaleString("da-DK")} {b.currency}</span>
                        </div>
                      </>
                    )}
                    {!isPartial && !isFull && (
                      <div className="text-[11px] opacity-60 text-right">
                        {b.payment_status === "captured" ? "Betalt" : b.payment_status === "authorized" ? "Reserveret" : "Afventer betaling"}
                      </div>
                    )}
                  </div>
                  {(isPartial || isFull) && (
                    <div className="mt-3 rounded-xl p-3 text-[11px] space-y-2" style={{ background: isPartial ? "#fdf2e2" : "#f4eefb", color: isPartial ? "#8a4a00" : "#4a2a8a" }}>
                      <div className="flex items-center justify-between">
                        <div className="font-black uppercase tracking-[0.16em] text-[10px]">
                          {isPartial ? "Delvis refundering" : "Fuld refundering"}
                        </div>
                        <div className="text-[10px] font-bold opacity-80">
                          {(b.refunds?.length ?? 0)} {(b.refunds?.length ?? 0) === 1 ? "refund" : "refunds"}
                        </div>
                      </div>
                      {(b.refunds && b.refunds.length > 0) ? (
                        <div className="divide-y" style={{ borderColor: "currentColor" }}>
                          {b.refunds.map((r, i) => {
                            const failed = r.status && r.status !== "succeeded";
                            const date = r.created_at ? new Date(r.created_at).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
                            return (
                              <div key={r.id} className="py-1.5 first:pt-0 last:pb-0 space-y-0.5" style={{ borderColor: "currentColor", opacity: failed ? 0.6 : 1 }}>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="font-bold">#{i + 1} · {date}</span>
                                  <span className="font-bold">
                                    {failed ? "—" : "−"} {r.amount.toLocaleString("da-DK")} {(r.currency || b.currency).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2 text-[10px] opacity-80">
                                  <span>{REFUND_REASON_LABEL[r.reason ?? ""] || r.reason || (failed ? `Fejlet${r.failure_reason ? `: ${r.failure_reason}` : ""}` : "Refund")}</span>
                                  <span className="font-mono">{r.id}</span>
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-1.5 flex justify-between font-bold border-t" style={{ borderColor: "currentColor" }}>
                            <span>Refunderet i alt</span>
                            <span>{(b.refund_amount ?? 0).toLocaleString("da-DK")} {b.currency}</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>Resterende</span>
                            <span>{Math.max(0, b.customer_pays - (b.refund_amount ?? 0)).toLocaleString("da-DK")} {b.currency}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          {b.refund_reason && (
                            <div className="flex justify-between"><span className="opacity-70">Årsag</span><span className="font-bold">{REFUND_REASON_LABEL[b.refund_reason] || b.refund_reason}</span></div>
                          )}
                          {b.refund_id && (
                            <div className="flex justify-between"><span className="opacity-70">Refund ID</span><span className="font-mono">{b.refund_id}</span></div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
            {hasReceipt && (
              <button
                onClick={() => setParams({ tab: "invoices" })}
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] hover:underline"
                style={{ color: C.teal }}
              >
                <Receipt className="h-3.5 w-3.5" /> Se kvittering
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PAYMENT_LABEL: Record<Booking["payment_status"], { label: string; bg: string; fg: string } | null> = {
  none: null,
  authorized: { label: "Reserveret", bg: "#fff8e1", fg: "#8a5a00" },
  captured: { label: "Betalt", bg: "#e6f5ec", fg: "#0a5c2e" },
  canceled: { label: "Annulleret", bg: "#e6e2d2", fg: C.ink },
  refunded: { label: "Refunderet", bg: "#ede4f5", fg: "#4a2a8a" },
  partially_refunded: { label: "Delvist refunderet", bg: "#fde9d1", fg: "#8a4a00" },
  failed: { label: "Fejlet", bg: "#f5c2b8", fg: "#8a2e1c" },
};

const REFUND_REASON_LABEL: Record<string, string> = {
  duplicate: "Dobbeltbetaling",
  fraudulent: "Mistanke om svindel",
  requested_by_customer: "Anmodet af kunde",
  expired_uncaptured_charge: "Reservation udløb",
};

/* ---------- CARDS TAB ---------- */
type Card = { id: string; brand: string; last4: string; exp_month: number; exp_year: number };

function CardsTab() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  async function loadCards() {
    const { data, error } = await supabase.functions.invoke("customer-payment-methods", { body: { action: "list" } });
    if (error) return toast.error(error.message);
    setCards(data?.cards || []);
  }

  useEffect(() => { loadCards(); }, []);

  async function startAdd() {
    setAdding(true);
    try {
      const [{ data: pkData }, { data: siData, error: siErr }] = await Promise.all([
        supabase.functions.invoke("stripe-public-key", { body: {} }),
        supabase.functions.invoke("customer-payment-methods", { body: { action: "setup_intent" } }),
      ]);
      if (siErr) throw siErr;
      if (!pkData?.publishable_key) throw new Error("Stripe nøgle mangler");
      setStripePromise(loadStripe(pkData.publishable_key));
      setClientSecret(siData.client_secret);
    } catch (e: any) {
      toast.error(e?.message || "Kunne ikke starte tilføj-kort");
      setAdding(false);
    }
  }

  async function removeCard(id: string) {
    if (!confirm("Fjern dette betalingskort?")) return;
    const { error } = await supabase.functions.invoke("customer-payment-methods", {
      body: { action: "delete", payment_method_id: id },
    });
    if (error) return toast.error(error.message);
    toast.success("Kort fjernet");
    loadCards();
  }

  return (
    <div className="space-y-4">
      {cards === null ? (
        <div className="opacity-60 text-sm">Henter…</div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center" style={{ borderColor: `${C.ink}33` }}>
          <CreditCard className="mx-auto h-8 w-8 opacity-40" />
          <div className="mt-3 font-display text-xl">Ingen gemte kort</div>
          <p className="mt-2 text-sm opacity-70">Tilføj et kort så booking går hurtigere næste gang.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-14 place-items-center rounded-md text-[10px] font-bold uppercase" style={{ background: C.ink, color: C.cream }}>
                  {c.brand}
                </div>
                <div>
                  <div className="text-sm font-bold">•••• {c.last4}</div>
                  <div className="text-[11px] opacity-60">Udløber {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}</div>
                </div>
              </div>
              <button onClick={() => removeCard(c.id)} className="rounded-full p-2 hover:bg-black/5" aria-label="Fjern">
                <Trash2 className="h-4 w-4 opacity-70" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!adding && (
        <button
          onClick={startAdd}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] shadow-[4px_4px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5"
          style={{ background: C.orange, color: C.ink }}
        >
          <Plus className="h-4 w-4" /> Tilføj betalingskort
        </button>
      )}

      {adding && clientSecret && stripePromise && (
        <div className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70 mb-3">Nyt kort</div>
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
            <AddCardForm
              clientSecret={clientSecret}
              onDone={() => { setAdding(false); setClientSecret(null); setStripePromise(null); loadCards(); }}
              onCancel={() => { setAdding(false); setClientSecret(null); setStripePromise(null); }}
            />
          </Elements>
        </div>
      )}
    </div>
  );
}

function AddCardForm({ clientSecret, onDone, onCancel }: { clientSecret: string; onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setBusy(true);
    const { error } = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
    setBusy(false);
    if (error) return toast.error(error.message || "Kunne ikke gemme kort");
    toast.success("Kort gemt");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-xl border-2 p-3" style={{ borderColor: `${C.ink}33` }}>
        <CardElement options={{ style: { base: { fontSize: "15px", color: C.ink } } }} />
      </div>
      <div className="flex gap-2">
        <button
          type="submit" disabled={busy || !stripe}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] disabled:opacity-50"
          style={{ background: C.ink, color: C.cream }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Gem kort
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] opacity-70 hover:opacity-100">
          Annullér
        </button>
      </div>
    </form>
  );
}

/* ---------- INVOICES TAB ---------- */
function InvoicesTab() {
  const bookings = useBookings();
  const invoices = useMemo(
    () => (bookings || []).filter((b) => b.payment_status === "captured" || b.status === "completed"),
    [bookings],
  );

  if (bookings === null) return <div className="opacity-60 text-sm">Henter…</div>;
  if (invoices.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center" style={{ borderColor: `${C.ink}33` }}>
        <Receipt className="mx-auto h-8 w-8 opacity-40" />
        <div className="mt-3 font-display text-xl">Ingen fakturaer endnu</div>
        <p className="mt-2 text-sm opacity-70">Når en booking er gennemført og betalt, vises kvitteringen her.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {invoices.map((b) => {
        const d = new Date(b.booking_date).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" });
        const num = `INV-${b.id.slice(0, 8).toUpperCase()}`;
        return (
          <details key={b.id} className="rounded-2xl border-2 bg-white" style={{ borderColor: `${C.ink}22` }}>
            <summary className="cursor-pointer list-none p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Receipt className="h-5 w-5 opacity-60" />
                <div>
                  <div className="font-bold text-sm">{num}</div>
                  <div className="text-[11px] opacity-60">{d} · {b.provider_name}</div>
                </div>
              </div>
              <div className="font-display text-base">{b.customer_pays.toLocaleString("da-DK")} {b.currency}</div>
            </summary>
            <div className="border-t-2 px-4 py-3 text-xs space-y-1.5" style={{ borderColor: `${C.ink}11` }}>
              <Row k="Service" v={`${b.service} · ${b.hours} t`} />
              <Row k="Dato" v={`${d} kl. ${b.slot}`} />
              <Row k="Adresse" v={b.address} />
              <Row k="Provider" v={b.provider_name} />
              <Row k="Status" v={b.payment_status === "captured" ? "Betalt" : "Gennemført"} />
              <div className="mt-2 border-t pt-2 flex justify-between font-bold" style={{ borderColor: `${C.ink}22` }}>
                <span>Total</span>
                <span>{b.customer_pays.toLocaleString("da-DK")} {b.currency}</span>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="opacity-60">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/* ---------- PAYMENT HISTORY TAB ---------- */
type HistoryEvent = {
  id: string;
  bookingId: string;
  at: string;
  kind: "authorized" | "captured" | "canceled" | "failed" | "refund_succeeded" | "refund_failed" | "refund_pending";
  amount: number;
  currency: string;
  title: string;
  subtitle: string;
  meta?: string;
};

const REFUND_REASON_LABEL_HIST: Record<string, string> = {
  requested_by_customer: "Kundens ønske",
  duplicate: "Dobbeltbetaling",
  fraudulent: "Mistanke om svindel",
  expired_uncaptured_charge: "Reservation udløb",
};

function buildHistory(bookings: Booking[]): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  for (const b of bookings) {
    const cardLabel = b.payment_method_brand && b.payment_method_last4
      ? `${b.payment_method_brand.toUpperCase()} •••• ${b.payment_method_last4}`
      : "Betalingskort";

    // Authorization
    if (b.payment_status !== "none" && b.payment_status !== "failed") {
      events.push({
        id: `${b.id}-auth`,
        bookingId: b.id,
        at: b.created_at,
        kind: "authorized",
        amount: b.customer_pays,
        currency: b.currency,
        title: "Reserveret",
        subtitle: `${b.provider_name} · ${b.service}`,
        meta: cardLabel,
      });
    }
    // Capture
    if (b.payment_status === "captured" || b.payment_status === "refunded" || b.payment_status === "partially_refunded") {
      events.push({
        id: `${b.id}-cap`,
        bookingId: b.id,
        at: b.decided_at || b.created_at,
        kind: "captured",
        amount: b.customer_pays,
        currency: b.currency,
        title: "Trukket fra kort",
        subtitle: `${b.provider_name} · ${b.service}`,
        meta: cardLabel,
      });
    }
    // Canceled auth
    if (b.payment_status === "canceled") {
      events.push({
        id: `${b.id}-cancel`,
        bookingId: b.id,
        at: b.decided_at || b.created_at,
        kind: "canceled",
        amount: b.customer_pays,
        currency: b.currency,
        title: "Reservation frigivet",
        subtitle: `${b.provider_name} · ${b.service}`,
      });
    }
    // Failed
    if (b.payment_status === "failed") {
      events.push({
        id: `${b.id}-fail`,
        bookingId: b.id,
        at: b.decided_at || b.created_at,
        kind: "failed",
        amount: b.customer_pays,
        currency: b.currency,
        title: "Betaling mislykkedes",
        subtitle: `${b.provider_name} · ${b.service}`,
        meta: cardLabel,
      });
    }
    // Refunds
    const refunds = b.refunds || [];
    for (const r of refunds) {
      const reason = r.reason ? (REFUND_REASON_LABEL_HIST[r.reason] || r.reason) : "Refundering";
      const kind: HistoryEvent["kind"] =
        r.status === "succeeded" ? "refund_succeeded"
        : r.status === "failed" ? "refund_failed"
        : "refund_pending";
      events.push({
        id: `${b.id}-r-${r.id}`,
        bookingId: b.id,
        at: r.created_at || b.refunded_at || b.created_at,
        kind,
        amount: r.amount,
        currency: r.currency || b.currency,
        title: r.status === "succeeded" ? "Refunderet til kort" : r.status === "failed" ? "Refundering mislykkedes" : "Refundering afventer",
        subtitle: `${b.provider_name} · ${reason}`,
        meta: `${cardLabel} · ${r.id}`,
      });
    }
  }
  events.sort((a, z) => new Date(z.at).getTime() - new Date(a.at).getTime());
  return events;
}

function HistoryTab() {
  const bookings = useBookings();
  const events = useMemo(() => (bookings ? buildHistory(bookings) : []), [bookings]);

  const totals = useMemo(() => {
    let paid = 0, refunded = 0, reserved = 0;
    for (const e of events) {
      if (e.kind === "captured") paid += e.amount;
      else if (e.kind === "refund_succeeded") refunded += e.amount;
      else if (e.kind === "authorized") reserved += e.amount;
    }
    return { paid, refunded, reserved, net: paid - refunded };
  }, [events]);

  if (bookings === null) return <div className="opacity-60 text-sm">Henter…</div>;
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center" style={{ borderColor: `${C.ink}33` }}>
        <History className="mx-auto h-8 w-8 opacity-40" />
        <div className="mt-3 font-display text-xl">Ingen betalinger endnu</div>
        <p className="mt-2 text-sm opacity-70">Når du gennemfører bookinger, vises hele din betalingshistorik her.</p>
      </div>
    );
  }

  const currency = events[0]?.currency || "DKK";

  // Group by month
  const groups = new Map<string, HistoryEvent[]>();
  for (const e of events) {
    const d = new Date(e.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="space-y-5">
      {/* Totals */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Betalt i alt" value={`${totals.paid.toLocaleString("da-DK")} ${currency}`} tone={C.ink} fg={C.cream} />
        <Stat label="Refunderet" value={`${totals.refunded.toLocaleString("da-DK")} ${currency}`} tone="#fde9d1" fg="#8a4a00" />
        <Stat label="Reserveret nu" value={`${totals.reserved.toLocaleString("da-DK")} ${currency}`} tone={C.mint} fg={C.ink} />
        <Stat label="Netto" value={`${totals.net.toLocaleString("da-DK")} ${currency}`} tone={C.teal} fg={C.cream} />
      </div>

      {/* Timeline */}
      <div className="space-y-5">
        {[...groups.entries()].map(([key, list]) => {
          const sample = new Date(list[0].at);
          const monthLabel = sample.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
          return (
            <div key={key}>
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] opacity-60">{monthLabel}</div>
              <div className="overflow-hidden rounded-2xl border-2 bg-white" style={{ borderColor: `${C.ink}22` }}>
                {list.map((e, i) => (
                  <HistoryRow key={e.id} ev={e} divider={i > 0} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, fg }: { label: string; value: string; tone: string; fg: string }) {
  return (
    <div className="rounded-2xl border-2 p-3" style={{ background: tone, color: fg, borderColor: `${C.ink}22` }}>
      <div className="text-[9px] font-black uppercase tracking-[0.22em] opacity-80">{label}</div>
      <div className="mt-1 font-display text-base leading-tight">{value}</div>
    </div>
  );
}

function HistoryRow({ ev, divider }: { ev: HistoryEvent; divider: boolean }) {
  const cfg = (() => {
    switch (ev.kind) {
      case "authorized": return { Icon: Clock, bg: C.mint, fg: C.ink, sign: "" };
      case "captured": return { Icon: ArrowUpCircle, bg: C.ink, fg: C.cream, sign: "−" };
      case "canceled": return { Icon: XCircle, bg: "#e6e2d2", fg: C.ink, sign: "" };
      case "failed": return { Icon: XCircle, bg: "#f5c2b8", fg: "#8a2e1c", sign: "" };
      case "refund_succeeded": return { Icon: ArrowDownCircle, bg: "#fde9d1", fg: "#8a4a00", sign: "+" };
      case "refund_failed": return { Icon: XCircle, bg: "#f5c2b8", fg: "#8a2e1c", sign: "" };
      case "refund_pending": return { Icon: Clock, bg: "#ffe9b8", fg: "#8a5a00", sign: "" };
    }
  })();
  const d = new Date(ev.at);
  const date = d.toLocaleDateString("da-DK", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  const Icon = cfg.Icon;
  return (
    <div className="flex items-start gap-3 p-3.5" style={divider ? { borderTop: `1px solid ${C.ink}14` } : undefined}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: cfg.bg, color: cfg.fg }}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{ev.title}</div>
            <div className="truncate text-[11px] opacity-70">{ev.subtitle}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-sm leading-tight">{cfg.sign}{ev.amount.toLocaleString("da-DK")} {ev.currency}</div>
            <div className="text-[10px] opacity-60">{date} · {time}</div>
          </div>
        </div>
        {ev.meta && <div className="mt-1 truncate text-[10px] opacity-55">{ev.meta}</div>}
      </div>
    </div>
  );
}
