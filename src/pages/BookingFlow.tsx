import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Calendar as CalendarIcon, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock, CreditCard, Home, MapPin, Pencil, Shield, Sparkles, Star, User,
} from "lucide-react";
import { getProvider, getCountry, deriveServices, deriveHourlyRate, formatPrice } from "@/lib/providers";
import { toast } from "@/hooks/use-toast";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import AddressBook from "@/components/AddressBook";
import { listAddresses, buildAutoNotes, updateAddressAccess, PLACE_TYPE_LABEL, ACCESS_METHOD_LABEL, type CustomerAddress, type AccessMethod } from "@/lib/customerAddresses";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";

let _stripePromise: Promise<StripeJS | null> | null = null;
function getStripePromise() {
  if (_stripePromise) return _stripePromise;
  _stripePromise = (async () => {
    const { data } = await supabase.functions.invoke("stripe-public-key");
    if (!data?.publishable_key) return null;
    return loadStripe(data.publishable_key);
  })();
  return _stripePromise;
}

const C = {
  ink: "#0a3d3a",
  orange: "#ff6b35",
  cream: "#f5f0e0",
  teal: "#168a7a",
  mint: "#c8e6c0",
  paper: "#fbf6e7",
};

const PLATFORM_FEE = 0.28;

const TIME_SLOTS = ["08:00", "10:00", "12:00", "13:30", "15:00", "16:30"];
const BUSY: Record<string, string[]> = {
  // pseudo-busy times per ISO date — keeps demo realistic
};

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // monday=0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtDay(d: Date) {
  return d.toLocaleDateString("da-DK", { weekday: "short" });
}
function fmtLong(d: Date) {
  return d.toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
}

export default function BookingFlow() {
  const [stripePromise] = useState(() => getStripePromise());
  return (
    <Elements stripe={stripePromise as any}>
      <BookingFlowInner />
    </Elements>
  );
}

function BookingFlowInner() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const provider = getProvider(id || "p_002") || getProvider("p_002")!;
  const country = getCountry(provider.countryCode);
  const services = useMemo(
    () => deriveServices(provider.categories, provider.subcategories, country),
    [provider, country],
  );
  const hourlyRate = provider.hourlyRate ?? deriveHourlyRate(country);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [serviceKey, setServiceKey] = useState<string>(
    params.get("service") || services[0]?.subcategory || "",
  );
  const [hours, setHours] = useState<number>(2.5);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [date, setDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string>(params.get("slot") || "");
  const { profile, user } = useAuth();
  const [address, setAddress] = useState<string>("");
  const [addressPlaceId, setAddressPlaceId] = useState<string | null>(null);
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);
  const [addressValid, setAddressValid] = useState<boolean>(false);
  const [usingProfileAddress, setUsingProfileAddress] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const stripe = useStripe();
  const elements = useElements();

  // Saved customer addresses (address book)
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [usingNewAddress, setUsingNewAddress] = useState(false);
  const [notesAutoFilled, setNotesAutoFilled] = useState(false);

  function pickSavedAddress(a: CustomerAddress) {
    setSelectedAddressId(a.id);
    setAddress(a.address);
    setAddressPlaceId(a.address_place_id);
    setAddressLat(a.lat);
    setAddressLng(a.lng);
    setAddressValid(!!a.address_place_id);
    setUsingNewAddress(false);
    setUsingProfileAddress(false);
    const auto = buildAutoNotes(a);
    setNotes((cur) => (!cur || notesAutoFilled ? auto : cur));
    setNotesAutoFilled(true);
  }

  // Load saved addresses; auto-pick primary
  useEffect(() => {
    if (!user) return;
    listAddresses(user.id)
      .then((list) => {
        setSavedAddresses(list);
        const primary = list.find((a) => a.is_primary) || list[0];
        if (primary) pickSavedAddress(primary);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fallback: auto-fill address from profile when no saved addresses
  useEffect(() => {
    if (savedAddresses.length > 0) return;
    if (profile?.address && !address) {
      setAddress(profile.address);
      setAddressPlaceId(profile.address_place_id);
      setAddressLat(profile.lat);
      setAddressLng(profile.lng);
      setAddressValid(!!profile.address_place_id);
      setUsingProfileAddress(true);
    }
  }, [profile, savedAddresses.length]);


  const service = services.find((s) => s.subcategory === serviceKey) || services[0];
  const effectiveRate = service?.unit === "hour" ? service.price : hourlyRate;
  const base = Math.round(effectiveRate * hours);
  const customerPays = Math.round(base * (1 + PLATFORM_FEE / 2));
  const providerGets = Math.round(base * (1 - PLATFORM_FEE / 2));

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const canNext =
    (step === 1 && !!service) ||
    (step === 2 && !!date && !!slot) ||
    (step === 3 && addressValid);

  async function next() {
    if (step === 3) {
      if (!addressValid) {
        toast({
          title: "Adresse mangler",
          description: "Vælg en gyldig adresse fra listen, så cleaneren ved, hvor hun skal møde op.",
          variant: "destructive",
        });
        return;
      }
      if (!user) {
        toast({
          title: "Log ind for at booke",
          description: "Du skal være logget ind, så cleaneren kan kontakte dig.",
          variant: "destructive",
        });
        navigate(`/login?redirect=/book/${provider.id}`);
        return;
      }
      if (!stripe || !elements) {
        toast({ title: "Betaling ikke klar endnu", description: "Vent et øjeblik og prøv igen.", variant: "destructive" });
        return;
      }
      const card = elements.getElement(CardElement);
      if (!card) {
        toast({ title: "Indtast kortoplysninger", variant: "destructive" });
        return;
      }

      setSubmitting(true);
      try {
        // 1) Create booking + PaymentIntent (or reuse if user clicked again)
        let secret = clientSecret;
        let bid = bookingId;
        if (!secret) {
          const { data, error } = await supabase.functions.invoke("payment-create-intent", {
            body: {
              provider_id: provider.id,
              provider_name: provider.name,
              service: service?.subcategory || "Rengøring",
              hours,
              booking_date: fmtISO(date!),
              slot,
              address,
              address_place_id: addressPlaceId,
              lat: addressLat,
              lng: addressLng,
              notes: notes || null,
              customer_pays: customerPays,
              provider_gets: providerGets,
              currency: country?.currency || "DKK",
            },
          });
          if (error || !data?.client_secret) throw new Error(error?.message || data?.error || "Kunne ikke oprette betaling");
          secret = data.client_secret;
          bid = data.booking_id;
          setClientSecret(secret);
          setBookingId(bid);
        }

        // 2) Confirm card (authorization only — manual capture)
        const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(secret!, {
          payment_method: { card, billing_details: { email: user.email ?? undefined, name: profile?.full_name ?? undefined } },
        });
        if (confirmErr) throw new Error(confirmErr.message || "Betalingen blev afvist");
        if (paymentIntent && !["requires_capture", "succeeded"].includes(paymentIntent.status)) {
          throw new Error(`Uventet status: ${paymentIntent.status}`);
        }

        // 3) Mark authorized in DB
        await supabase.functions.invoke("payment-mark-authorized", { body: { booking_id: bid } });

        toast({
          title: "Booking sendt ✓",
          description: `${provider.name.split(" ")[0]} har 24 timer til at bekræfte. Først da hæves beløbet.`,
        });
        setStep(4);
      } catch (e: any) {
        toast({ title: "Betaling fejlede", description: e.message, variant: "destructive" });
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (step < 3 && canNext) setStep((step + 1) as 1 | 2 | 3 | 4);
  }
  function back() {
    if (step === 1) navigate(-1);
    else setStep((step - 1) as 1 | 2 | 3);
  }

  return (
    <main className="min-h-screen font-editorial" style={{ background: C.cream, color: C.ink }}>
      {/* Top */}
      <header className="sticky top-0 z-20 border-b-2" style={{ background: C.ink, color: C.cream, borderColor: C.ink }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <button onClick={back} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]">
            <ArrowLeft className="h-4 w-4" /> {step === 1 ? "Tilbage" : "Forrige"}
          </button>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] opacity-70">
            Booking · MyCleaner
          </div>
          <Link to="/" className="text-xs font-bold uppercase tracking-[0.18em] opacity-80 hover:opacity-100">
            Annullér
          </Link>
        </div>
        {/* Stepper */}
        <div className="mx-auto max-w-5xl px-4 pb-4 sm:px-6">
          <Stepper step={step} />
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr,360px]">
        {/* Step content */}
        <section>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {step === 1 && (
                <Step1
                  services={services}
                  country={country}
                  serviceKey={serviceKey}
                  setServiceKey={setServiceKey}
                  hours={hours}
                  setHours={setHours}
                />
              )}
              {step === 2 && (
                <Step2
                  weekStart={weekStart}
                  setWeekStart={setWeekStart}
                  weekDays={weekDays}
                  today={today}
                  date={date}
                  setDate={setDate}
                  slot={slot}
                  setSlot={setSlot}
                />
              )}
              {step === 3 && (
                <Step3
                  address={address} setAddress={setAddress}
                  addressValid={addressValid} setAddressValid={setAddressValid}
                  setAddressPlaceId={setAddressPlaceId}
                  setAddressLat={setAddressLat}
                  setAddressLng={setAddressLng}
                  usingProfileAddress={usingProfileAddress}
                  setUsingProfileAddress={setUsingProfileAddress}
                  profile={profile}
                  notes={notes} setNotes={setNotes}
                  provider={provider} date={date} slot={slot}
                  service={service?.subcategory || ""} hours={hours}
                  customerPays={customerPays}
                  savedAddresses={savedAddresses}
                  selectedAddressId={selectedAddressId}
                  pickSavedAddress={pickSavedAddress}
                  usingNewAddress={usingNewAddress}
                  setUsingNewAddress={setUsingNewAddress}
                  setSavedAddresses={setSavedAddresses}
                  setNotesAutoFilled={setNotesAutoFilled}
                />
              )}
              {step === 4 && (
                <Step4 provider={provider} date={date!} slot={slot} customerPays={customerPays} />
              )}
            </motion.div>
          </AnimatePresence>

          {step < 4 && (
            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={back}
                className="inline-flex items-center gap-2 rounded-full border-2 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em]"
                style={{ borderColor: C.ink }}
              >
                <ChevronLeft className="h-4 w-4" /> {step === 1 ? "Tilbage" : "Forrige"}
              </button>
              <button
                disabled={!canNext || submitting}
                onClick={next}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] shadow-[6px_6px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: step === 3 ? C.orange : C.ink, color: step === 3 ? C.ink : C.cream }}
              >
                {step === 3 ? (submitting ? <>Sender…</> : <>Bekræft booking <Check className="h-4 w-4" /></>) : <>Næste <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <Summary
            provider={provider}
            country={country}
            service={service?.subcategory || ""}
            hours={hours}
            date={date}
            slot={slot}
            base={base}
            customerPays={customerPays}
            providerGets={providerGets}
            effectiveRate={effectiveRate}
          />
        </aside>
      </div>
    </main>
  );
}

/* ---------------- Stepper ---------------- */
function Stepper({ step }: { step: number }) {
  const steps = ["Service", "Tidspunkt", "Bekræft"];
  return (
    <div className="flex items-center gap-3">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex flex-1 items-center gap-3">
            <div
              className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[11px] font-black"
              style={{
                background: done ? C.mint : active ? C.orange : "transparent",
                color: done || active ? C.ink : C.cream,
                border: `2px solid ${done ? C.mint : active ? C.orange : `${C.cream}55`}`,
              }}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: active ? C.cream : `${C.cream}99` }}>
              {label}
            </div>
            {i < steps.length - 1 && (
              <div className="h-px flex-1" style={{ background: `${C.cream}33` }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Step 1 ---------------- */
function Step1({
  services, country, serviceKey, setServiceKey, hours, setHours,
}: any) {
  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl">Hvad skal vi tage os af?</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">
        Vælg en service hos din cleaner. Du kan justere varigheden — det påvirker prisen direkte.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {services.map((s: any) => {
          const active = s.subcategory === serviceKey;
          const unit = s.unit === "hour" ? "/t" : s.unit === "m2" ? "/m²" : "";
          return (
            <button
              key={s.subcategory}
              onClick={() => setServiceKey(s.subcategory)}
              className="rounded-2xl border-2 p-4 text-left transition hover:-translate-y-0.5"
              style={{
                borderColor: active ? C.orange : `${C.ink}22`,
                background: active ? `${C.orange}10` : "white",
                boxShadow: active ? `4px 4px 0 ${C.orange}40` : "none",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-lg leading-tight">{s.subcategory}</div>
                  <p className="mt-1 text-xs opacity-70">{s.description}</p>
                </div>
                <div className="text-right">
                  <div className="font-display text-base whitespace-nowrap">
                    {formatPrice(s.price, country)}
                    <span className="text-xs opacity-60">{unit}</span>
                  </div>
                  <div className="text-[10px] opacity-60">fra {formatPrice(s.minPrice, country)}</div>
                </div>
              </div>
              {active && (
                <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: C.orange }}>
                  <Check className="h-3 w-3" /> Valgt
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Antal timer</div>
          <div className="font-display text-2xl">{hours} t</div>
        </div>
        <input
          type="range" min={1.5} max={8} step={0.5}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-3 w-full cursor-pointer"
          style={{ accentColor: C.orange }}
        />
        <div className="mt-1 flex justify-between text-[10px] opacity-60">
          <span>1,5 t</span><span>4 t</span><span>8 t</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */
function Step2({ weekStart, setWeekStart, weekDays, today, date, setDate, slot, setSlot }: any) {
  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl">Vælg dato & tid</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">
        Du booker direkte i cleanerens kalender. Grå tider er optagede.
      </p>

      <div className="mt-6 rounded-3xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
        <div className="flex items-center justify-between">
          <div className="font-display text-lg">
            {weekStart.toLocaleDateString("da-DK", { month: "long", year: "numeric" })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="grid h-9 w-9 place-items-center rounded-full border-2"
              style={{ borderColor: `${C.ink}22` }}
              aria-label="Forrige uge"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="grid h-9 w-9 place-items-center rounded-full border-2"
              style={{ borderColor: `${C.ink}22` }}
              aria-label="Næste uge"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2">
          {weekDays.map((d: Date) => {
            const past = d < today;
            const active = date && fmtISO(date) === fmtISO(d);
            return (
              <button
                key={fmtISO(d)}
                disabled={past}
                onClick={() => { setDate(d); setSlot(""); }}
                className="rounded-2xl border-2 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-30"
                style={{
                  borderColor: active ? C.ink : `${C.ink}18`,
                  background: active ? C.ink : "white",
                  color: active ? C.cream : C.ink,
                }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{fmtDay(d)}</div>
                <div className="mt-1 font-display text-xl leading-none">{d.getDate()}</div>
              </button>
            );
          })}
        </div>

        {date && (
          <div className="mt-6">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
              Ledige tider · {fmtLong(date)}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {TIME_SLOTS.map((s) => {
                const busy = (BUSY[fmtISO(date)] || []).includes(s);
                const active = slot === s;
                return (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => setSlot(s)}
                    className="rounded-full border-2 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-30 disabled:line-through"
                    style={{
                      borderColor: active ? C.orange : `${C.ink}22`,
                      background: active ? C.orange : "white",
                      color: C.ink,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Address Verify Card ---------------- */
function AddressVerifyCard({
  address, addressValid, savedAddresses, selectedAddressId, usingNewAddress, usingProfileAddress, profile,
  onSavedUpdated, setNotes, setNotesAutoFilled,
}: any) {
  const [editOpen, setEditOpen] = useState(false);
  if (!addressValid || !address) return null;

  const saved = (savedAddresses || []).find((a: CustomerAddress) => a.id === selectedAddressId);
  const isSaved = !!saved && !usingNewAddress;
  const isProfile = usingProfileAddress && !isSaved;
  const isOneTime = usingNewAddress || (!isSaved && !isProfile);

  const badge = isSaved
    ? saved.is_primary
      ? { text: "Primær adresse", bg: C.orange }
      : { text: "Gemt adresse", bg: C.teal }
    : isProfile
      ? { text: "Fra profil", bg: C.ink }
      : { text: "Engangsadresse", bg: `${C.ink}55` };

  return (
    <div
      className="rounded-2xl border-2 bg-white p-4"
      style={{ borderColor: C.orange, background: `${C.orange}08` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: C.ink }}>
          <MapPin className="h-3.5 w-3.5" /> Adressebekræftelse
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]"
          style={{ background: badge.bg, color: isOneTime ? C.ink : C.cream }}
        >
          {badge.text}
        </span>
      </div>

      <div className="mt-3 rounded-xl border-2 bg-white p-3" style={{ borderColor: `${C.ink}18` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-lg leading-tight">{isSaved ? saved.label : isProfile ? "Fra din profil" : "Manuel indtastning"}</div>
            <div className="mt-0.5 text-sm opacity-80">{address}</div>
          </div>
          {isSaved && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition hover:bg-white"
              style={{ borderColor: C.orange, color: C.orange }}
            >
              <Pencil className="h-3 w-3" /> Rediger
            </button>
          )}
        </div>

        {isSaved && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: `${C.ink}22` }}>
                {PLACE_TYPE_LABEL[saved.place_type]}
              </span>
              {saved.size_sqm && (
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: C.mint, color: C.ink }}>
                  {saved.size_sqm} m²
                </span>
              )}
              {saved.rooms && (
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: C.mint, color: C.ink }}>
                  {saved.rooms} vær.
                </span>
              )}
              {saved.floor && (
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: C.mint, color: C.ink }}>
                  {saved.floor}
                </span>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {saved.access_method !== "home" && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">Adgang</div>
                  <div className="opacity-80">{ACCESS_METHOD_LABEL[saved.access_method]}</div>
                  {saved.access_code && (
                    <div className="mt-0.5 font-mono text-[11px]" style={{ color: C.orange }}>Kode: {saved.access_code}</div>
                  )}
                </div>
              )}
              {saved.access_instructions && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">Instruktioner</div>
                  <div className="opacity-80">{saved.access_instructions}</div>
                </div>
              )}
              {saved.has_pets && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">Kæledyr</div>
                  <div className="opacity-80">{saved.pet_details || "Ja"}</div>
                </div>
              )}
              {saved.has_children && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">Børn</div>
                  <div className="opacity-80">Børn i hjemmet</div>
                </div>
              )}
              {saved.parking_info && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">Parkering</div>
                  <div className="opacity-80">{saved.parking_info}</div>
                </div>
              )}
              {saved.cleaning_supplies_available && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">Rengøringsmidler</div>
                  <div className="opacity-80">Står klar</div>
                </div>
              )}
              {saved.wifi_name && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">WiFi</div>
                  <div className="opacity-80">{saved.wifi_name}</div>
                </div>
              )}
            </div>

            {saved.notes && (
              <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                <div className="font-bold">Andre bemærkninger</div>
                <div className="opacity-80 whitespace-pre-line">{saved.notes}</div>
              </div>
            )}
          </div>
        )}

        {isProfile && profile?.address && (
          <div className="mt-2 text-[11px] opacity-60">
            Vi bruger adressen fra din profil. Gem den i din adressebog for at tilføje adgangsinfo og kæledyr.
          </div>
        )}
        {isOneTime && (
          <div className="mt-2 text-[11px] opacity-60">
            Du bruger en manuel adresse. Skriv adgangsinfo og kæledyr direkte i beskeden til cleaneren nedenfor.
          </div>
        )}
      </div>

      {isSaved && (
        <EditAccessDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          address={saved}
          onSaved={(updated) => {
            onSavedUpdated?.(updated);
            // Refresh auto-notes so cleaner gets the new info
            setNotes?.(buildAutoNotes(updated));
            setNotesAutoFilled?.(true);
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Edit Access & Pets Dialog ---------------- */
function EditAccessDialog({
  open, onOpenChange, address, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: CustomerAddress;
  onSaved: (a: CustomerAddress) => void;
}) {
  const [accessMethod, setAccessMethod] = useState<AccessMethod>(address.access_method);
  const [accessCode, setAccessCode] = useState(address.access_code || "");
  const [accessInstructions, setAccessInstructions] = useState(address.access_instructions || "");
  const [hasPets, setHasPets] = useState(address.has_pets);
  const [petDetails, setPetDetails] = useState(address.pet_details || "");
  const [hasChildren, setHasChildren] = useState(address.has_children);
  const [parkingInfo, setParkingInfo] = useState(address.parking_info || "");
  const [supplies, setSupplies] = useState(address.cleaning_supplies_available);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAccessMethod(address.access_method);
      setAccessCode(address.access_code || "");
      setAccessInstructions(address.access_instructions || "");
      setHasPets(address.has_pets);
      setPetDetails(address.pet_details || "");
      setHasChildren(address.has_children);
      setParkingInfo(address.parking_info || "");
      setSupplies(address.cleaning_supplies_available);
    }
  }, [open, address]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateAddressAccess(address.id, {
        access_method: accessMethod,
        access_code: accessCode.trim() || null,
        access_instructions: accessInstructions.trim() || null,
        has_pets: hasPets,
        pet_details: hasPets ? (petDetails.trim() || null) : null,
        has_children: hasChildren,
        parking_info: parkingInfo.trim() || null,
        cleaning_supplies_available: supplies,
      });
      toast({ title: "Opdateret", description: "Adgang og kæledyr er gemt på adressen." });
      onSaved(updated);
    } catch (e: any) {
      toast({ title: "Kunne ikke gemme", description: e?.message || "Prøv igen", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border-2 bg-white px-3 py-2 text-sm focus:outline-none";
  const labelCls = "text-[10px] font-black uppercase tracking-[0.18em] opacity-70";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Rediger adgang & kæledyr</DialogTitle>
          <div className="text-xs opacity-70">Ændringer gemmes på "{address.label}" i din adressebog.</div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className={labelCls}>Sådan kommer cleaneren ind</label>
            <select
              value={accessMethod}
              onChange={(e) => setAccessMethod(e.target.value as AccessMethod)}
              className={inputCls}
              style={{ borderColor: `${C.ink}22` }}
            >
              {(Object.keys(ACCESS_METHOD_LABEL) as AccessMethod[]).map((k) => (
                <option key={k} value={k}>{ACCESS_METHOD_LABEL[k]}</option>
              ))}
            </select>
          </div>

          {(accessMethod === "key_box" || accessMethod === "code") && (
            <div>
              <label className={labelCls}>Kode</label>
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Fx 1234"
                className={inputCls}
                style={{ borderColor: `${C.ink}22` }}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Instruktioner</label>
            <textarea
              value={accessInstructions}
              onChange={(e) => setAccessInstructions(e.target.value)}
              rows={2}
              placeholder="Fx nøgleboks ved postkasse, ring på 3. sal…"
              className={inputCls}
              style={{ borderColor: `${C.ink}22` }}
            />
          </div>

          <div className="rounded-xl border-2 p-3" style={{ borderColor: `${C.ink}22` }}>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={hasPets} onChange={(e) => setHasPets(e.target.checked)} />
              Kæledyr i hjemmet
            </label>
            {hasPets && (
              <input
                value={petDetails}
                onChange={(e) => setPetDetails(e.target.value)}
                placeholder="Fx 1 hund (venlig), 2 katte"
                className={inputCls}
                style={{ borderColor: `${C.ink}22` }}
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={hasChildren} onChange={(e) => setHasChildren(e.target.checked)} />
            Børn i hjemmet
          </label>

          <div>
            <label className={labelCls}>Parkering</label>
            <input
              value={parkingInfo}
              onChange={(e) => setParkingInfo(e.target.value)}
              placeholder="Fx gratis på vejen, p-licens påkrævet"
              className={inputCls}
              style={{ borderColor: `${C.ink}22` }}
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={supplies} onChange={(e) => setSupplies(e.target.checked)} />
            Rengøringsmidler står klar
          </label>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border-2 px-4 py-2 text-sm font-bold"
            style={{ borderColor: `${C.ink}33` }}
          >
            Annullér
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full px-5 py-2 text-sm font-black uppercase tracking-[0.16em] disabled:opacity-60"
            style={{ background: C.orange, color: C.cream }}
          >
            {saving ? "Gemmer…" : "Gem ændringer"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- Step 3 ---------------- */
function Step3({ address, setAddress, addressValid, setAddressValid, setAddressPlaceId, setAddressLat, setAddressLng, usingProfileAddress, setUsingProfileAddress, profile, notes, setNotes, provider, date, slot, service, hours, customerPays, savedAddresses, selectedAddressId, pickSavedAddress, usingNewAddress, setUsingNewAddress }: any) {
  const hasProfileAddress = !!profile?.address;
  const hasSaved = (savedAddresses?.length ?? 0) > 0;

  function chooseNew() {
    setAddress("");
    setAddressPlaceId(null);
    setAddressLat(null);
    setAddressLng(null);
    setAddressValid(false);
    setUsingProfileAddress(false);
    setUsingNewAddress(true);
  }

  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl">Sidste detaljer</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">
        Vi sender oplysningerne direkte til {provider.name.split(" ")[0]}. Du betaler først når hun bekræfter.
      </p>

      <div className="mt-6 space-y-4">
        {/* Saved address picker (address book) */}
        {hasSaved && !usingNewAddress ? (
          <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Vælg adresse</div>
              <button
                type="button"
                onClick={chooseNew}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] hover:underline"
                style={{ color: C.teal }}
              >
                <Pencil className="h-3 w-3" /> Brug en anden adresse
              </button>
            </div>
            <AddressBook
              selectable
              compact
              selectedId={selectedAddressId}
              onSelect={(a) => pickSavedAddress(a)}
            />
          </div>
        ) : (
          <div className="block rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Adresse</div>
              {hasSaved && (
                <button
                  type="button"
                  onClick={() => setUsingNewAddress(false)}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] hover:underline"
                  style={{ color: C.teal }}
                >
                  <Home className="h-3 w-3" /> Brug en gemt
                </button>
              )}
            </div>
            <div className="mt-2">
              <AddressAutocomplete
                autoFocus
                value={address}
                onChange={(v: string) => { setAddress(v); setAddressValid(false); setAddressPlaceId(null); }}
                onSelect={(p: any) => {
                  setAddress(p.address);
                  setAddressPlaceId(p.placeId ?? null);
                  setAddressLat(p.lat ?? null);
                  setAddressLng(p.lng ?? null);
                  setAddressValid(true);
                }}
                onValidityChange={setAddressValid}
                isValid={addressValid}
                placeholder="Vej, nr., etage, by"
                countries={["dk"]}
              />
            </div>
            {addressValid ? (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold" style={{ color: C.teal }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Adresse valideret — cleaneren kan finde stedet
              </div>
            ) : (
              <div className="mt-2 text-[10px] opacity-60">
                Begynd at skrive og vælg din adresse fra listen. Vi tjekker, at den er reel.
              </div>
            )}
            {!profile && (
              <div className="mt-3 rounded-xl border border-dashed p-2.5 text-[11px]" style={{ borderColor: `${C.ink}33` }}>
                <Link to="/login?redirect=/profil" className="font-bold underline" style={{ color: C.orange }}>Log ind</Link>
                <span className="opacity-70"> og gem dine adresser med adgangsinfo, så cleaneren får alt at vide automatisk.</span>
              </div>
            )}
            {profile && !hasSaved && (
              <div className="mt-3 rounded-xl border border-dashed p-2.5 text-[11px]" style={{ borderColor: `${C.ink}33` }}>
                <Link to="/profil?tab=addresses" className="font-bold underline" style={{ color: C.orange }}>Gem denne adresse</Link>
                <span className="opacity-70"> i din adressebog med dyr, parkering og adgangsinfo — så er det auto-udfyldt næste gang.</span>
              </div>
            )}
          </div>
        )}

        {/* Address verification card */}
        <AddressVerifyCard
          address={address}
          addressValid={addressValid}
          savedAddresses={savedAddresses}
          selectedAddressId={selectedAddressId}
          usingNewAddress={usingNewAddress}
          usingProfileAddress={usingProfileAddress}
          profile={profile}
        />

        <label className="block rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Besked til cleaneren (valgfri)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Fx kæledyr, allergi, hvor nøglen ligger…"
            className="mt-2 w-full resize-none bg-transparent text-sm focus:outline-none"
          />
        </label>

        <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
            <CreditCard className="h-3.5 w-3.5" /> Betalingskort
          </div>
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `${C.ink}22` }}>
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: "16px",
                    color: C.ink,
                    fontFamily: "inherit",
                    "::placeholder": { color: "#94a3a0" },
                  },
                  invalid: { color: "#c2412c" },
                },
              }}
            />
          </div>
          <div className="mt-2 text-[10px] opacity-60">
            Vi reserverer beløbet nu. Det hæves først, når cleaneren bekræfter (max 24 timer).
          </div>
        </div>


        <div className="rounded-2xl border-2 p-4" style={{ borderColor: C.mint, background: `${C.mint}30` }}>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5" style={{ color: C.ink }} />
            <div className="text-sm">
              <div className="font-bold">Beskyttet betaling</div>
              <div className="opacity-70">
                Vi reserverer {customerPays.toLocaleString("da-DK")} kr på dit kort. Pengene frigives først til cleaneren efter opgaven er udført.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 4 — Success ---------------- */
function Step4({ provider, date, slot, customerPays }: any) {
  return (
    <div className="rounded-3xl border-2 bg-white p-8 text-center shadow-[8px_8px_0_rgba(10,61,58,0.15)]" style={{ borderColor: C.ink }}>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: C.mint }}>
        <Check className="h-8 w-8" style={{ color: C.ink }} strokeWidth={3} />
      </div>
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">Booking bekræftet</h1>
      <p className="mt-3 mx-auto max-w-md text-sm opacity-70">
        {provider.name.split(" ")[0]} har modtaget din anmodning og bekræfter typisk inden for {provider.responseTime}.
        Du får en notifikation så snart hun siger ja.
      </p>

      <div className="mt-6 inline-flex flex-col items-center gap-1 rounded-2xl border-2 px-6 py-4" style={{ borderColor: `${C.ink}22` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Din tid</div>
        <div className="font-display text-xl">{fmtLong(date)}</div>
        <div className="font-display text-2xl" style={{ color: C.orange }}>kl. {slot}</div>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to={`/provider/${provider.id}`}
          className="inline-flex items-center gap-2 rounded-full border-2 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em]"
          style={{ borderColor: C.ink }}
        >
          Se {provider.name.split(" ")[0]}s profil
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.18em]"
          style={{ background: C.ink, color: C.cream }}
        >
          Til forsiden <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Sidebar summary ---------------- */
function Summary({
  provider, country, service, hours, date, slot, base, customerPays, providerGets, effectiveRate,
}: any) {
  const initials = provider.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2);
  return (
    <div className="rounded-3xl border-2 bg-white p-5 shadow-[6px_6px_0_rgba(10,61,58,0.12)]" style={{ borderColor: C.ink }}>
      <div className="flex items-center gap-3 border-b-2 border-dashed pb-4" style={{ borderColor: `${C.ink}22` }}>
        <div
          className="grid h-12 w-12 place-items-center rounded-2xl font-display text-lg"
          style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.ink})`, color: C.cream }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg leading-tight truncate">{provider.name}</div>
          <div className="flex items-center gap-2 text-xs opacity-70">
            <Star className="h-3 w-3" style={{ color: C.orange }} fill={C.orange} />
            {provider.rating} · {provider.city}
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5 text-sm">
        <SummaryRow icon={<Sparkles className="h-4 w-4" />} label="Service" value={service || "—"} />
        <SummaryRow icon={<Clock className="h-4 w-4" />} label="Varighed" value={`${hours} t`} />
        <SummaryRow icon={<CalendarIcon className="h-4 w-4" />} label="Dato" value={date ? fmtLong(date) : "—"} />
        <SummaryRow icon={<Clock className="h-4 w-4" />} label="Tidspunkt" value={slot || "—"} />
      </ul>

      <div className="mt-5 space-y-2 border-t-2 border-dashed pt-4 text-sm" style={{ borderColor: `${C.ink}22` }}>
        <Line label={`${effectiveRate} kr/t × ${hours} t`} value={`${base.toLocaleString("da-DK")} kr`} />
        <Line label="Platformsgebyr 14%" value={`+${(customerPays - base).toLocaleString("da-DK")} kr`} muted />
        <div className="flex items-baseline justify-between pt-2">
          <span className="text-[10px] font-black uppercase tracking-[0.22em]">Du betaler</span>
          <span className="font-display text-2xl">
            {customerPays.toLocaleString("da-DK")} <span className="text-sm opacity-70">kr</span>
          </span>
        </div>
        <div className="text-[10px] opacity-60">Cleaneren får {providerGets.toLocaleString("da-DK")} kr efter gebyr</div>
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-xs opacity-70">{icon}{label}</span>
      <span className="text-right font-bold">{value}</span>
    </li>
  );
}
function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-xs ${muted ? "opacity-60" : "opacity-80"}`}>{label}</span>
      <span className="font-display text-sm">{value}</span>
    </div>
  );
}
