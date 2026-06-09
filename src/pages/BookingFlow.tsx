import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Calendar as CalendarIcon, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock, MapPin, Shield, Sparkles, Star, User,
} from "lucide-react";
import { getProvider, getCountry, deriveServices, deriveHourlyRate, formatPrice } from "@/lib/providers";
import { toast } from "@/hooks/use-toast";
import AddressAutocomplete from "@/components/AddressAutocomplete";

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
  const [address, setAddress] = useState<string>("");
  const [addressValid, setAddressValid] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

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

  function next() {
    if (step === 3) {
      if (!addressValid) {
        toast({
          title: "Adresse mangler",
          description: "Vælg en gyldig adresse fra listen, så cleaneren ved, hvor hun skal møde op.",
          variant: "destructive",
        });
        return;
      }
      // confirm
      toast({
        title: "Booking bekræftet ✓",
        description: `${provider.name.split(" ")[0]} er booket ${fmtLong(date!)} kl. ${slot}.`,
      });
      setStep(4);
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
                  notes={notes} setNotes={setNotes}
                  provider={provider} date={date} slot={slot}
                  service={service?.subcategory || ""} hours={hours}
                  customerPays={customerPays}
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
                disabled={!canNext}
                onClick={next}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] shadow-[6px_6px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: step === 3 ? C.orange : C.ink, color: step === 3 ? C.ink : C.cream }}
              >
                {step === 3 ? <>Bekræft booking <Check className="h-4 w-4" /></> : <>Næste <ArrowRight className="h-4 w-4" /></>}
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

/* ---------------- Step 3 ---------------- */
function Step3({ address, setAddress, notes, setNotes, provider, date, slot, service, hours, customerPays }: any) {
  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl">Sidste detaljer</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">
        Vi sender oplysningerne direkte til {provider.name.split(" ")[0]}. Du betaler først når hun bekræfter.
      </p>

      <div className="mt-6 space-y-4">
        <div className="block rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Adresse</div>
          <div className="mt-2">
            <AddressAutocomplete
              autoFocus
              value={address}
              onChange={setAddress}
              onSelect={(p) => setAddress(p.address)}
              placeholder="Vej, nr., etage, by"
              countries={["dk"]}
            />
          </div>
          <div className="mt-2 text-[10px] opacity-60">
            Vælg fra listen så vi sikrer, at adressen er korrekt.
          </div>
        </div>

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
