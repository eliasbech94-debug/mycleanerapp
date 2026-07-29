import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useAppContext } from "@/context/AppContext";

const C = {
  ink: "#0a3d3a",
  orange: "#ff6b35",
  cream: "#f5f0e0",
  paper: "#fbf6e7",
  teal: "#168a7a",
  mint: "#c8e6c0",
};

/**
 * Customer booking entry point.
 *
 * Provider links keep their provider lock and continue directly to the locked
 * booking flow. Everyone else chooses between a guided match and browsing the
 * marketplace themselves.
 */
const BookingEntry = () => {
  const navigate = useNavigate();
  const { providerLock } = useAppContext();

  useEffect(() => {
    if (providerLock?.slug) {
      navigate(
        `/book?provider=${encodeURIComponent(providerLock.slug)}&src=${encodeURIComponent(providerLock.source)}`,
        { replace: true },
      );
    }
  }, [providerLock, navigate]);

  const options = [
    {
      eyebrow: "Hurtigste vej",
      title: "Find et godt match til mig",
      description:
        "Fortæl hvor og hvornår du ønsker rengøring. Vi viser relevante, verificerede cleaners, som passer til opgaven.",
      action: "Start din booking",
      note: "Ca. 2 minutter · gratis at starte",
      icon: Sparkles,
      accent: C.orange,
      onClick: () => navigate("/task/create"),
      features: [
        [ShieldCheck, "Verificerede cleaners i dit område"],
        [Clock, "Match efter kalender, service og afstand"],
        [CheckCircle2, "Se pris og detaljer før du bekræfter"],
      ],
    },
    {
      eyebrow: "Vælg selv",
      title: "Se og sammenlign cleaners",
      description:
        "Gå på opdagelse i profiler, anmeldelser, priser og ledige tider — og book den cleaner, du foretrækker.",
      action: "Se alle cleaners",
      note: "Profiler, kort og ledige tider",
      icon: MapIcon,
      accent: C.teal,
      onClick: () => navigate("/find-cleaner"),
      features: [
        [MapIcon, "Cleaners og serviceområder nær dig"],
        [Star, "Profiler, erfaring og anmeldelser"],
        [Users, "Book direkte hos udvalgte cleaners"],
      ],
    },
  ] as const;

  return (
    <main
      className="min-h-screen font-editorial"
      style={{ background: C.cream, color: C.ink }}
    >
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <div className="grid items-end gap-8 border-b-2 pb-8 sm:pb-10 lg:grid-cols-[1.25fr_.75fr]" style={{ borderColor: C.ink }}>
          <div>
            <p className="mb-4 text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: C.orange }}>
              Book rengøring
            </p>
            <h1 className="max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Et rent hjem starter med det rigtige match.
            </h1>
          </div>
          <p className="max-w-md text-base leading-relaxed sm:text-lg lg:justify-self-end">
            Vælg den vej, der passer dig. Du kan få hjælp til at finde relevante cleaners eller sammenligne profiler selv.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:mt-8 lg:grid-cols-2 lg:gap-6">
          {options.map((option, index) => {
            const Icon = option.icon;
            return (
              <button
                key={option.title}
                type="button"
                onClick={option.onClick}
                className="group flex min-h-[430px] flex-col rounded-[1.75rem] border-2 p-6 text-left transition-transform duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-4 sm:p-8"
                style={{ background: index === 0 ? C.paper : C.mint, borderColor: C.ink }}
                aria-label={option.action}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em]">
                    {option.eyebrow}
                  </span>
                  <span
                    className="grid h-12 w-12 place-items-center rounded-full border-2 transition-transform group-hover:rotate-6"
                    style={{ background: option.accent, borderColor: C.ink, color: C.paper }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                </div>

                <h2 className="mt-10 max-w-lg text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">
                  {option.title}
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-80 sm:text-base">
                  {option.description}
                </p>

                <ul className="mt-8 space-y-3 border-t-2 pt-6" style={{ borderColor: C.ink }}>
                  {option.features.map(([FeatureIcon, label]) => (
                    <li key={label} className="flex items-center gap-3 text-sm font-semibold">
                      <FeatureIcon className="h-4 w-4 shrink-0" style={{ color: option.accent }} />
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex items-end justify-between gap-4 pt-8">
                  <span className="max-w-[13rem] text-xs font-semibold opacity-60">{option.note}</span>
                  <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em]">
                    {option.action}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border-2 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: C.ink }}>
          <span className="font-bold">Trygt fra første klik til færdig rengøring.</span>
          <span className="opacity-70">Sikker betaling via Stripe · Du ser prisen før godkendelse</span>
        </div>
      </section>
    </main>
  );
};

export default BookingEntry;
