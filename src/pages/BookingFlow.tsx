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
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";
import BookingsOpenSoonDialog, { guardFinancialAction, useFinancialActionLock } from "@/components/launch/BookingsOpenSoonDialog";
import { CancellationPolicyNotice } from "@/components/booking/CancellationPolicyNotice";
import { C as BOOKING_COLORS_ALIAS, BOOKING_FOCUS } from "@/lib/bookingTheme";
import { useTranslation } from "react-i18next";
import { useMobileNavOffset } from "@/hooks/useMobileNavOffset";
import { useProviderAvailableSlots, useProviderUserId } from "@/hooks/useProviderAvailableSlots";
import { useProviderLiveStatus } from "@/hooks/useProviderLiveStatus";
import ProviderStatusPill from "@/components/provider/status/ProviderStatusPill";


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

/**
 * Booking palette + focus ring come from the shared booking theme so every
 * step of the funnel renders the same premium navy/blue system.
 */
const C = BOOKING_COLORS_ALIAS;
const FOCUS = BOOKING_FOCUS;



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
function fmtDay(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { weekday: "short" });
}
function fmtLong(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
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
  const { t, i18n } = useTranslation("booking");
  const financialLock = useFinancialActionLock();
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
  // Real (non-demo) providers expose server-derived availability + slot locks.
  const { providerUserId } = useProviderUserId(provider.id);



  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [serviceKey, setServiceKey] = useState<string>(
    params.get("service") || services[0]?.subcategory || "",
  );
  const [hours, setHours] = useState<number>(2.5);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [date, setDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string>(params.get("slot") || "");
  const { profile, user } = useAuth();
  const { providerLock } = useAppContext();
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
  // Cancellation-policy version frozen on the booking by the server. Used so
  // the confirmation quotes the accepted terms even if the global policy
  // switches over (time gate) between creation and render.
  const [acceptedPolicyVersion, setAcceptedPolicyVersion] = useState<string | null>(null);
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
      // Early Access: stop the checkout BEFORE quote / PaymentIntent / capture.
      if (guardFinancialAction(() => financialLock.setOpen(true))) return;
      if (!addressValid) {
        toast({
          title: t("toast.selectAddress.title"),
          description: t("toast.selectAddress.description"),
          variant: "destructive",
        });
        return;
      }
      if (!user) {
        toast({
          title: t("toast.loginRequired.title"),
          description: t("toast.loginRequired.description"),
          variant: "destructive",
        });
        navigate(`/login?redirect=/book/${provider.id}`);
        return;
      }
      if (!stripe || !elements) {
        toast({ title: t("toast.paymentNotReady.title"), description: t("toast.paymentNotReady.description"), variant: "destructive" });
        return;
      }
      const card = elements.getElement(CardElement);
      if (!card) {
        toast({ title: t("toast.enterCard.title"), description: t("toast.enterCard.description"), variant: "destructive" });
        return;
      }

      setSubmitting(true);
      try {
        // 1) Fetch authoritative server-side price quote (P0.1).
        //    The client is never trusted for money values — payment-create-intent
        //    reads customer_pays / provider_gets / currency from the locked quote.
        let secret = clientSecret;
        let bid = bookingId;
        if (!secret) {
          const startAt = new Date(`${fmtISO(date!)}T${slot}:00`).toISOString();

          // 1a) Reserve the slot for this checkout so no other customer can
          //     take it while payment is being authorized. Server-authoritative.
          let slotLockId: string | null = null;
          if (providerUserId) {
            const { data: lockRes, error: lockErr } = await supabase.rpc(
              "acquire_booking_slot_lock_v1",
              {
                _provider_user_id: providerUserId,
                _starts_at: startAt,
                _duration_minutes: Math.round(hours * 60),
                _idempotency_key: `checkout-${user.id}-${provider.id}-${fmtISO(date!)}-${slot}`,
              },
            );
            const lock = lockRes as { ok?: boolean; lock_id?: string; code?: string } | null;
            if (lockErr || !lock?.ok) {
              throw new Error(
                lock?.code === "CALENDAR_SLOT_UNAVAILABLE"
                  ? t("toast.slotTaken", "Tidspunktet blev desværre optaget. Vælg et andet.")
                  : lockErr?.message || t("toast.paymentStartError"),
              );
            }
            slotLockId = lock.lock_id ?? null;
          }

          const { data: quote, error: qErr } = await supabase.functions.invoke("pricing-quote", {
            body: {
              provider_id_text: provider.id,
              service_category: service?.subcategory || "Rengøring",
              currency: country?.currency || "DKK",
              start_at: startAt,
              duration_minutes: Math.round(hours * 60),
              address_place_id: addressPlaceId,
              lat: addressLat,
              lng: addressLng,
              quote_context: "customer_checkout",
            },
          });
          if (qErr || !quote?.quote_id) {
            throw new Error(qErr?.message || quote?.error || t("toast.priceError"));
          }

          const { data, error } = await supabase.functions.invoke("payment-create-intent", {
            body: {
              quote_id: quote.quote_id,
              provider_name: provider.name,
              slot_lock_id: slotLockId,

              booking_date: fmtISO(date!),
              slot,
              address,
              address_place_id: addressPlaceId,
              lat: addressLat,
              lng: addressLng,
              notes: notes || null,
              // Attribution (contractual, retained on the booking row).
              // Slug is authoritative; server re-derives provider from the locked quote and
              // rejects the request if the slug doesn't match that provider.
              acquisition_source: providerLock?.slug ? providerLock.source : "marketplace",
              acquisition_provider_slug: providerLock?.slug ?? null,
            },
          });
          if (error || !data?.client_secret) {
            throw new Error(error?.message || data?.error || t("toast.paymentStartError"));
          }
          secret = data.client_secret;
          bid = data.booking_id;
          setClientSecret(secret);
          setBookingId(bid);
          setAcceptedPolicyVersion(data.cancellation_policy_version ?? null);
        }

        // 2) Confirm card (authorization only — manual capture)
        const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(secret!, {
          payment_method: { card, billing_details: { email: user.email ?? undefined, name: profile?.full_name ?? undefined } },
        });
        if (confirmErr) throw new Error(confirmErr.message || t("toast.confirmError"));
        if (paymentIntent && !["requires_capture", "succeeded"].includes(paymentIntent.status)) {
          throw new Error(t("toast.unexpectedStatus", { status: paymentIntent.status }));
        }

        // 3) Mark authorized in DB
        await supabase.functions.invoke("payment-mark-authorized", { body: { booking_id: bid } });

        toast({
          title: t("toast.bookingSent.title"),
          description: t("toast.bookingSent.description", { name: provider.name.split(" ")[0] }),
        });
        setStep(4);
      } catch (e: any) {
        toast({ title: t("toast.paymentFailed.title"), description: e.message || t("toast.paymentFailed.description"), variant: "destructive" });
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
    <main className="min-h-dvh font-editorial" style={{ background: C.cream, color: C.ink }}>
      <BookingsOpenSoonDialog open={financialLock.open} onOpenChange={financialLock.setOpen} />
      {/* Top */}
      <header className="sticky top-0 z-20 border-b" style={{ background: C.ink, color: "#ffffff", borderColor: "rgba(255,255,255,0.14)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          {/* On mobile the step-back action lives in the sticky action bar, so
              the header stays uncluttered next to the global app bar. */}
          <button
            onClick={back}
            className={`hidden min-h-[44px] items-center gap-2 rounded-full px-3 text-xs font-bold uppercase tracking-[0.18em] transition hover:bg-white/10 sm:inline-flex ${FOCUS} focus-visible:ring-offset-[#0d1b3e]`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {step === 1 ? t("nav.back") : t("nav.previous")}
          </button>
          <div className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.28em] text-white/70">
            {t("header.title")}
          </div>
          <Link
            to="/"
            className={`inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-bold uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10 hover:text-white ${FOCUS} focus-visible:ring-offset-[#0d1b3e]`}
          >
            {t("nav.cancel")}
          </Link>
        </div>
        {/* Stepper */}
        <div className="mx-auto max-w-5xl px-4 pb-3 sm:px-6 sm:pb-4">
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
                  providerName={provider.name}
                  providerUserId={providerUserId}
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
                  providerUserId={providerUserId}
                  durationMinutes={Math.round(hours * 60)}
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
                <Step4 provider={provider} date={date!} slot={slot} customerPays={customerPays} policyVersion={acceptedPolicyVersion} />
              )}
            </motion.div>
          </AnimatePresence>

          {step < 4 && (
            <div className="mt-8 hidden items-center justify-between lg:flex">
              <button
                onClick={back}
                className={`inline-flex min-h-[48px] items-center gap-2 rounded-full border-2 bg-white px-5 text-xs font-bold uppercase tracking-[0.18em] transition hover:bg-[hsl(222_88%_42%/0.06)] ${FOCUS}`}
                style={{ borderColor: `${C.ink}22` }}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {step === 1 ? t("nav.back") : t("nav.previous")}
              </button>
              <button
                disabled={!canNext || submitting}
                onClick={next}
                aria-busy={submitting}
                className={`inline-flex min-h-[48px] items-center gap-2 rounded-full px-7 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_-12px_rgba(13,27,62,0.6)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${FOCUS}`}
                style={{ background: C.orange }}
              >
                {step === 3 ? (submitting ? <>{t("nav.sending")}</> : <>{t("actions.sendRequest")} <Check className="h-4 w-4" aria-hidden="true" /></>) : <>{t("nav.next")} <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
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

      {/* Mobile action bar — keeps the total price and the primary action
          visible at every step without an extra scroll. */}
      {step < 4 && (
        <MobileActionBar
          total={`${customerPays.toLocaleString(i18n.language)} kr`}
          totalLabel={t("summary.total")}
          hint={t("summary.hoursShort", { count: hours })}
          backLabel={step === 1 ? t("nav.back") : t("nav.previous")}
          onBack={back}
          onNext={next}
          nextLabel={step === 3 ? (submitting ? t("nav.sending") : t("actions.sendRequest")) : t("nav.next")}
          disabled={!canNext || submitting}
          submitting={submitting}
          isFinal={step === 3}
        />
      )}
    </main>
  );
}

/* ---------------- Mobile sticky action bar ---------------- */
function MobileActionBar({
  total, totalLabel, hint, backLabel, onBack, onNext, nextLabel, disabled, submitting, isFinal,
}: {
  total: string;
  totalLabel: string;
  hint: string;
  backLabel: string;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled: boolean;
  submitting: boolean;
  isFinal: boolean;
}) {
  const navOffset = useMobileNavOffset();
  return (
    <>
      {/* Spacer so the last card is never hidden behind the fixed bar. */}
      <div aria-hidden="true" className="h-28 lg:hidden" />
      <div
        data-testid="booking-mobile-action-bar"
        className="fixed inset-x-0 z-30 border-t bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:hidden"
        style={{
          borderColor: `${C.ink}1f`,
          bottom: navOffset > 0 ? `${navOffset}px` : "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] opacity-60">{totalLabel}</div>
            <div className="font-display text-xl leading-tight">{total}</div>
            <div className="truncate text-[10px] opacity-60">{hint}</div>
          </div>
          <button
            onClick={onBack}
            aria-label={backLabel}
            className={`ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 bg-white ${FOCUS}`}
            style={{ borderColor: `${C.ink}22` }}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={onNext}
            disabled={disabled}
            aria-busy={submitting}
            className={`inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-full px-5 text-xs font-bold uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
            style={{ background: C.orange }}
          >
            {nextLabel}
            {isFinal ? <Check className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </>
  );
}


/* ---------------- Stepper ---------------- */
function Stepper({ step }: { step: number }) {
  const { t } = useTranslation("booking");
  const steps = [t("stepper.service"), t("stepper.dateTime"), t("stepper.review")];
  const total = steps.length;
  const current = Math.min(step, total);
  return (
    <div>
      {/* Mobile: progress bar + current step label (the full stepper does not
          fit under 400px and used to push the page into horizontal scroll). */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-white">
            {steps[current - 1]}
          </span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
            {current}/{total}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current}
          aria-valuetext={`${steps[current - 1]} — ${current}/${total}`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(current / total) * 100}%`, background: "#ffffff" }}
          />
        </div>
      </div>

      {/* Tablet and up: full labelled stepper. */}
      <ol className="hidden items-center gap-3 sm:flex">
        {steps.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <li key={label} className="flex flex-1 items-center gap-3">
              <span
                className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[11px] font-black transition-colors"
                style={{
                  background: done ? C.mint : active ? "#ffffff" : "transparent",
                  color: done || active ? C.ink : "rgba(255,255,255,0.7)",
                  border: `2px solid ${done ? C.mint : active ? "#ffffff" : "rgba(255,255,255,0.35)"}`,
                }}
                aria-hidden="true"
              >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span
                className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.65)" }}
                aria-current={active ? "step" : undefined}
              >
                {label}
              </span>
              {i < steps.length - 1 && (
                <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.25)" }} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </div>


  );
}

/* ---------------- Step 1 ---------------- */
function Step1({
  services, country, serviceKey, setServiceKey, hours, setHours, providerName, providerUserId,
}: any) {
  const { t } = useTranslation("booking");
  const firstName = providerName ? String(providerName).split(" ")[0] : "";
  const { status: liveStatus } = useProviderLiveStatus({ userId: providerUserId ?? null });
  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl">{t("step1.title", { name: firstName })}</h1>
      {liveStatus && <ProviderStatusPill status={liveStatus} showMessage showPresence useLongLabel className="mt-3" />}

      <p className="mt-2 max-w-xl text-sm opacity-70">
        {t("step1.subtitle")}
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
                  <div className="text-[10px] opacity-60">{t("step1.fromPrice", { price: formatPrice(s.minPrice, country) })}</div>
                </div>
              </div>
              {active && (
                <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: C.orange }}>
                  <Check className="h-3 w-3" /> {t("step1.selected")}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{t("step1.hoursLabel")}</div>
          <div className="font-display text-2xl">{t("summary.hoursShort", { count: hours })}</div>
        </div>
        <input
          type="range" min={1.5} max={8} step={0.5}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-3 w-full cursor-pointer"
          style={{ accentColor: C.orange }}
        />
        <div className="mt-1 flex justify-between text-[10px] opacity-60">
          <span>{t("step1.hoursMin")}</span><span>{t("step1.hoursMid")}</span><span>{t("step1.hoursMax")}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */
function Step2({ weekStart, setWeekStart, weekDays, today, date, setDate, slot, setSlot, providerUserId, durationMinutes }: any) {
  const { t, i18n } = useTranslation("booking");
  const isoDate = date ? fmtISO(date) : null;
  const { slots, loading, error } = useProviderAvailableSlots(providerUserId ?? null, isoDate, durationMinutes);
  // Real providers: server-derived slots. Demo/seed providers: static grid.
  const serverMode = !!providerUserId;
  const times: string[] = serverMode
    ? (slots ?? []).map((s) => s.local_time.slice(0, 5))
    : TIME_SLOTS;
  const timezone = serverMode ? slots?.[0]?.timezone ?? null : null;

  // Morning / afternoon / evening grouping keeps long slot lists scannable.
  const groups: { key: string; label: string; items: string[] }[] = [
    { key: "morning", label: t("step2.morning", "Formiddag"), items: [] },
    { key: "afternoon", label: t("step2.afternoon", "Eftermiddag"), items: [] },
    { key: "evening", label: t("step2.evening", "Aften"), items: [] },
  ];
  for (const s of times) {
    const hour = Number(s.slice(0, 2));
    groups[hour < 12 ? 0 : hour < 17 ? 1 : 2].items.push(s);
  }

  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl">{t("step2.title")}</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">
        {t("step2.subtitle")}
      </p>

      <div className="mt-6 rounded-3xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
        <div className="flex items-center justify-between">
          <div className="font-display text-lg">
            {weekStart.toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className={`grid h-11 w-11 place-items-center rounded-full border-2 ${BOOKING_FOCUS}`}
              style={{ borderColor: `${C.ink}22` }}
              aria-label={t("step2.prevWeekAria")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className={`grid h-11 w-11 place-items-center rounded-full border-2 ${BOOKING_FOCUS}`}
              style={{ borderColor: `${C.ink}22` }}
              aria-label={t("step2.nextWeekAria")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2" role="group" aria-label={t("step2.title")}>
          {weekDays.map((d: Date) => {
            const past = d < today;
            const active = date && fmtISO(date) === fmtISO(d);
            const isToday = fmtISO(d) === fmtISO(today);
            return (
              <button
                key={fmtISO(d)}
                disabled={past}
                aria-pressed={!!active}
                aria-label={fmtLong(d, i18n.language)}
                onClick={() => { setDate(d); setSlot(""); }}
                className={`min-h-[56px] rounded-2xl border-2 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-30 ${BOOKING_FOCUS}`}
                style={{
                  borderColor: active ? C.ink : isToday ? C.orange : `${C.ink}18`,
                  background: active ? C.ink : "white",
                  color: active ? "#ffffff" : C.ink,
                }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{fmtDay(d, i18n.language)}</div>
                <div className="mt-1 font-display text-xl leading-none">{d.getDate()}</div>
              </button>
            );
          })}
        </div>

        {date && (
          <div className="mt-6">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
              {t("step2.availableTimes", { date: fmtLong(date, i18n.language) })}
            </div>
            {timezone && (
              <p className="mt-1 text-xs opacity-60">
                {t("step2.timezoneNote", "Tider vises i {{tz}} (cleanerens tidszone).", { tz: timezone })}
              </p>
            )}

            {serverMode && loading && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-11 animate-pulse rounded-full motion-reduce:animate-none"
                    style={{ background: `${C.ink}12` }}
                  />
                ))}
              </div>
            )}
            <span className="sr-only" aria-live="polite">
              {serverMode && loading
                ? t("step2.loadingTimes", "Henter ledige tider…")
                : t("step2.slotCount", "{{count}} ledige tider", { count: times.length })}
            </span>

            {serverMode && !loading && error && (
              <div
                className="mt-3 rounded-2xl border-2 p-3 text-sm"
                style={{ borderColor: `${C.ink}22`, background: `${C.ink}08` }}
              >
                {t("step2.slotsError", "Ledige tider kunne ikke hentes lige nu. Prøv igen om lidt.")}
              </div>
            )}

            {serverMode && !loading && !error && times.length === 0 && (
              <div
                className="mt-3 rounded-2xl border-2 p-4 text-sm"
                style={{ borderColor: `${C.ink}22`, background: `${C.ink}06` }}
              >
                {t("step2.noTimes", "Ingen ledige tider denne dag — vælg en anden dato.")}
              </div>
            )}

            {!loading && times.length > 0 && (
              <div className="mt-3 space-y-4">
                {groups.filter((g) => g.items.length > 0).map((group) => (
                  <div key={group.key}>
                    <div className="mb-2 text-xs font-bold opacity-60">{group.label}</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {group.items.map((s) => {
                        const busy = serverMode ? false : (BUSY[fmtISO(date)] || []).includes(s);
                        const active = slot === s;
                        return (
                          <button
                            key={s}
                            disabled={busy}
                            aria-pressed={active}
                            onClick={() => setSlot(s)}
                            className={`min-h-[44px] rounded-full border-2 py-2.5 text-sm font-bold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-30 disabled:line-through ${BOOKING_FOCUS}`}
                            style={{
                              borderColor: active ? C.orange : `${C.ink}22`,
                              background: active ? C.orange : "white",
                              color: active ? "#ffffff" : C.ink,
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
  const { t } = useTranslation("booking");
  const [editOpen, setEditOpen] = useState(false);
  if (!addressValid || !address) return null;

  const saved = (savedAddresses || []).find((a: CustomerAddress) => a.id === selectedAddressId);
  const isSaved = !!saved && !usingNewAddress;
  const isProfile = usingProfileAddress && !isSaved;
  const isOneTime = usingNewAddress || (!isSaved && !isProfile);

  const badge = isSaved
    ? saved.is_primary
      ? { text: t("step3.verify.badgePrimary"), bg: C.orange }
      : { text: t("step3.verify.badgeSaved"), bg: C.teal }
    : isProfile
      ? { text: t("step3.verify.badgeProfile"), bg: C.ink }
      : { text: t("step3.verify.badgeOneTime"), bg: `${C.ink}55` };

  return (
    <div
      className="rounded-2xl border-2 bg-white p-4"
      style={{ borderColor: C.orange, background: `${C.orange}08` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: C.ink }}>
          <MapPin className="h-3.5 w-3.5" /> {t("step3.verify.title")}
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
            <div className="font-display text-lg leading-tight">{isSaved ? saved.label : isProfile ? t("step3.verify.profileLabel") : t("step3.verify.manualLabel")}</div>
            <div className="mt-0.5 text-sm opacity-80">{address}</div>
          </div>
          {isSaved && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition hover:bg-white"
              style={{ borderColor: C.orange, color: C.orange }}
            >
              <Pencil className="h-3 w-3" /> {t("step3.verify.edit")}
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
                  {saved.size_sqm} {t("step3.verify.sqm")}
                </span>
              )}
              {saved.rooms && (
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: C.mint, color: C.ink }}>
                  {saved.rooms} {t("step3.verify.rooms")}
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
                  <div className="font-bold">{t("step3.verify.access")}</div>
                  <div className="opacity-80">{ACCESS_METHOD_LABEL[saved.access_method]}</div>
                  {saved.access_code && (
                    <div className="mt-0.5 font-mono text-[11px]" style={{ color: C.orange }}>{t("step3.verify.code")}: {saved.access_code}</div>
                  )}
                </div>
              )}
              {saved.access_instructions && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">{t("step3.verify.instructions")}</div>
                  <div className="opacity-80">{saved.access_instructions}</div>
                </div>
              )}
              {saved.has_pets && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">{t("step3.verify.pets")}</div>
                  <div className="opacity-80">{saved.pet_details || t("step3.verify.petsYes")}</div>
                </div>
              )}
              {saved.has_children && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">{t("step3.verify.children")}</div>
                  <div className="opacity-80">{t("step3.verify.childrenPresent")}</div>
                </div>
              )}
              {saved.parking_info && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">{t("step3.verify.parking")}</div>
                  <div className="opacity-80">{saved.parking_info}</div>
                </div>
              )}
              {saved.cleaning_supplies_available && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">{t("step3.verify.cleaningSupplies")}</div>
                  <div className="opacity-80">{t("step3.verify.cleaningSuppliesReady")}</div>
                </div>
              )}
              {saved.wifi_name && (
                <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                  <div className="font-bold">{t("step3.verify.wifi")}</div>
                  <div className="opacity-80">{saved.wifi_name}</div>
                </div>
              )}
            </div>

            {saved.notes && (
              <div className="rounded-lg border p-2 text-[11px]" style={{ borderColor: `${C.ink}18` }}>
                <div className="font-bold">{t("step3.verify.otherNotes")}</div>
                <div className="opacity-80 whitespace-pre-line">{saved.notes}</div>
              </div>
            )}
          </div>
        )}

        {isProfile && profile?.address && (
          <div className="mt-2 text-[11px] opacity-60">
            {t("step3.verify.profileHint")}
          </div>
        )}
        {isOneTime && (
          <div className="mt-2 text-[11px] opacity-60">
            {t("step3.verify.oneTimeHint")}
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
  const { t } = useTranslation("booking");

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
      toast({ title: t("toast.changesSaved.title"), description: t("toast.changesSaved.description") });
      onSaved(updated);
    } catch (e: any) {
      toast({ title: t("toast.saveFailed.title"), description: t("toast.saveFailed.description"), variant: "destructive" });
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
          <DialogTitle className="font-display text-2xl">{t("editDialog.title")}</DialogTitle>
          <div className="text-xs opacity-70">
            {t("editDialog.description", { label: address.label })}
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className={labelCls}>{t("editDialog.accessMethodLabel")}</label>
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
              <label className={labelCls}>{t("editDialog.codeLabel")}</label>
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder={t("editDialog.codePlaceholder")}
                className={inputCls}
                style={{ borderColor: `${C.ink}22` }}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>{t("editDialog.instructionsLabel")}</label>
            <textarea
              value={accessInstructions}
              onChange={(e) => setAccessInstructions(e.target.value)}
              rows={2}
              placeholder={t("editDialog.instructionsPlaceholder")}
              className={inputCls}
              style={{ borderColor: `${C.ink}22` }}
            />
          </div>

          <div className="rounded-xl border-2 p-3" style={{ borderColor: `${C.ink}22` }}>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={hasPets} onChange={(e) => setHasPets(e.target.checked)} />
              {t("editDialog.petsLabel")}
            </label>
            {hasPets && (
              <input
                value={petDetails}
                onChange={(e) => setPetDetails(e.target.value)}
                placeholder={t("editDialog.petsPlaceholder")}
                className={inputCls}
                style={{ borderColor: `${C.ink}22` }}
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={hasChildren} onChange={(e) => setHasChildren(e.target.checked)} />
            {t("editDialog.childrenLabel")}
          </label>

          <div>
            <label className={labelCls}>{t("editDialog.parkingLabel")}</label>
            <input
              value={parkingInfo}
              onChange={(e) => setParkingInfo(e.target.value)}
              placeholder={t("editDialog.parkingPlaceholder")}
              className={inputCls}
              style={{ borderColor: `${C.ink}22` }}
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={supplies} onChange={(e) => setSupplies(e.target.checked)} />
            {t("editDialog.suppliesLabel")}
          </label>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border-2 px-4 py-2 text-sm font-bold"
            style={{ borderColor: `${C.ink}33` }}
          >
            {t("editDialog.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full px-5 py-2 text-sm font-black uppercase tracking-[0.16em] disabled:opacity-60"
            style={{ background: C.orange, color: C.cream }}
          >
            {saving ? t("editDialog.saving") : t("editDialog.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- Step 3 ---------------- */
function Step3({ address, setAddress, addressValid, setAddressValid, setAddressPlaceId, setAddressLat, setAddressLng, usingProfileAddress, setUsingProfileAddress, profile, notes, setNotes, provider, date, slot, service, hours, customerPays, savedAddresses, selectedAddressId, pickSavedAddress, usingNewAddress, setUsingNewAddress, setSavedAddresses, setNotesAutoFilled }: any) {
  const { t, i18n } = useTranslation("booking");
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
      <h1 className="font-display text-3xl sm:text-4xl">{t("step3.title")}</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">
        {t("step3.subtitle", { name: provider.name.split(" ")[0] })}
      </p>

      <div className="mt-6 space-y-4">
        {/* Saved address picker (address book) */}
        {hasSaved && !usingNewAddress ? (
          <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{t("step3.address.chooseAddress")}</div>
              <button
                type="button"
                onClick={chooseNew}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] hover:underline"
                style={{ color: C.teal }}
              >
                <Pencil className="h-3 w-3" /> {t("step3.address.useAnotherAddress")}
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
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{t("step3.address.addressLabel")}</div>
              {hasSaved && (
                <button
                  type="button"
                  onClick={() => setUsingNewAddress(false)}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] hover:underline"
                  style={{ color: C.teal }}
                >
                  <Home className="h-3 w-3" /> {t("step3.address.useSaved")}
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
                placeholder={t("step3.address.placeholder")}
                countries={[(profile?.country_code || "DK").toLowerCase()]}
              />
            </div>
            {addressValid ? (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold" style={{ color: C.teal }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("step3.address.validated")}
              </div>
            ) : (
              <div className="mt-2 text-[10px] opacity-60">
                {t("step3.address.hint")}
              </div>
            )}
            {!profile && (
              <div className="mt-3 rounded-xl border border-dashed p-2.5 text-[11px]" style={{ borderColor: `${C.ink}33` }}>
                <Link to="/login?redirect=/profil" className="font-bold underline" style={{ color: C.orange }}>{t("step3.address.loginPrompt")}</Link>
                <span className="opacity-70"> {t("step3.address.loginPromptTail")}</span>
              </div>
            )}
            {profile && !hasSaved && (
              <div className="mt-3 rounded-xl border border-dashed p-2.5 text-[11px]" style={{ borderColor: `${C.ink}33` }}>
                <Link to="/profil?tab=addresses" className="font-bold underline" style={{ color: C.orange }}>{t("step3.address.saveAddressPrompt")}</Link>
                <span className="opacity-70"> {t("step3.address.saveAddressPromptTail")}</span>
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
          setNotes={setNotes}
          setNotesAutoFilled={setNotesAutoFilled}
          onSavedUpdated={(updated: CustomerAddress) =>
            setSavedAddresses?.((list: CustomerAddress[]) =>
              list.map((a) => (a.id === updated.id ? updated : a))
            )
          }
        />

        <label className="block rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{t("step3.notes.label")}</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder={t("step3.notes.placeholder")}
            className="mt-2 w-full resize-none bg-transparent text-sm focus:outline-none"
          />
        </label>

        <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
            <CreditCard className="h-3.5 w-3.5" /> {t("step3.payment.label")}
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
            {t("step3.payment.disclaimer")}
          </div>
        </div>


        <div className="rounded-2xl border-2 p-4" style={{ borderColor: C.mint, background: `${C.mint}30` }}>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5" style={{ color: C.ink }} />
            <div className="text-sm">
              <div className="font-bold">{t("step3.paymentHandling.title")}</div>
              <div className="opacity-70">
                {t("step3.paymentHandling.body", { amount: `${customerPays.toLocaleString(i18n.language)} kr` })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 4 — Success ---------------- */
function Step4({ provider, date, slot, customerPays, policyVersion }: any) {
  const { t, i18n } = useTranslation("booking");
  const serviceStart = date && slot ? new Date(`${fmtISO(date)}T${slot}:00`) : null;
  return (
    <div className="rounded-3xl border-2 bg-white p-8 text-center shadow-[8px_8px_0_rgba(10,61,58,0.15)]" style={{ borderColor: C.ink }}>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: C.mint }}>
        <Check className="h-8 w-8" style={{ color: C.ink }} strokeWidth={3} />
      </div>
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">{t("step4.title")}</h1>
      <p className="mt-3 mx-auto max-w-md text-sm opacity-70">
        {t("step4.description", { name: provider.name.split(" ")[0], responseTime: provider.responseTime })}
      </p>

      <div className="mt-6 inline-flex flex-col items-center gap-1 rounded-2xl border-2 px-6 py-4" style={{ borderColor: `${C.ink}22` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{t("step4.yourTime")}</div>
        <div className="font-display text-xl">{fmtLong(date, i18n.language)}</div>
        <div className="font-display text-2xl" style={{ color: C.orange }}>{t("step4.at", { slot })}</div>
      </div>

      {serviceStart && (
        <CancellationPolicyNotice
          serviceStart={serviceStart}
          // The frozen version the customer accepted — not today's policy.
          policyVersion={policyVersion}
          className="mx-auto mt-6 max-w-md rounded-2xl border-2 p-5 text-left"
        />
      )}


      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to={`/provider/${provider.id}`}
          className="inline-flex items-center gap-2 rounded-full border-2 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em]"
          style={{ borderColor: C.ink }}
        >
          {t("step4.viewProfile", { name: provider.name.split(" ")[0] })}
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.18em]"
          style={{ background: C.ink, color: C.cream }}
        >
          {t("step4.home")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Sidebar summary ---------------- */
function Summary({
  provider, country, service, hours, date, slot, base, customerPays, providerGets, effectiveRate,
}: any) {
  const { t, i18n } = useTranslation("booking");
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
        <SummaryRow icon={<Sparkles className="h-4 w-4" />} label={t("summary.service")} value={service || t("summary.notSelected")} />
        <SummaryRow icon={<Clock className="h-4 w-4" />} label={t("summary.duration")} value={t("summary.hoursShort", { count: hours })} />
        <SummaryRow icon={<CalendarIcon className="h-4 w-4" />} label={t("summary.date")} value={date ? fmtLong(date, i18n.language) : t("summary.notSelected")} />
        <SummaryRow icon={<Clock className="h-4 w-4" />} label={t("summary.slot")} value={slot || t("summary.notSelected")} />
      </ul>

      <div className="mt-5 space-y-2 border-t-2 border-dashed pt-4 text-sm" style={{ borderColor: `${C.ink}22` }}>
        <Line label={t("summary.ratePerHour", { rate: effectiveRate, hours })} value={`${base.toLocaleString(i18n.language)} kr`} />
        <Line label={t("summary.platformFee")} value={`+${(customerPays - base).toLocaleString(i18n.language)} kr`} muted />
        <div className="flex items-baseline justify-between pt-2">
          <span className="text-[10px] font-black uppercase tracking-[0.22em]">{t("summary.total")}</span>
          <span className="font-display text-2xl">
            {customerPays.toLocaleString(i18n.language)} <span className="text-sm opacity-70">kr</span>
          </span>
        </div>
        <div className="text-[10px] opacity-60">{t("summary.providerNet", { amount: `${providerGets.toLocaleString(i18n.language)} kr` })}</div>
      </div>

      {date && slot && (
        <p className="mt-4 rounded-2xl border-2 border-dashed p-3 text-xs" style={{ borderColor: `${C.ink}22` }}>
          {t(
            "summary.slotHold",
            "Når du går til betaling, reserverer vi dit tidspunkt i 10 minutter, så ingen andre kan tage det.",
          )}
        </p>
      )}

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
