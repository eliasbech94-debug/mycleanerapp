import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Cookie,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

export const COOKIE_CONSENT_KEY = "mycleaner_cookie_consent";
export const COOKIE_CONSENT_VERSION = 1 as const;

export type CookiePreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  version: typeof COOKIE_CONSENT_VERSION;
  updatedAt: string;
};

export function createCookieConsent(
  analytics = false,
  marketing = false,
  updatedAt = new Date().toISOString(),
): CookiePreferences {
  return {
    necessary: true,
    analytics,
    marketing,
    version: COOKIE_CONSENT_VERSION,
    updatedAt,
  };
}

export function parseStoredConsent(value: string | null): CookiePreferences | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<CookiePreferences>;

    if (
      parsed.version !== COOKIE_CONSENT_VERSION ||
      parsed.necessary !== true ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return parsed as CookiePreferences;
  } catch {
    return null;
  }
}

function PreferenceSwitch({
  checked,
  disabled = false,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-[#123c3a] ${
          checked
            ? "border-primary-foreground/20 bg-primary-foreground"
            : "border-white/30 bg-white/10"
        } ${disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-1 h-[18px] w-[18px] rounded-full transition ${
            checked
              ? "left-6 bg-[#123c3a]"
              : "left-1 bg-white/70"
          }`}
        />
      </button>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-white">{label}</p>
          {disabled && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
              Altid aktiv
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-white/65">{description}</p>
      </div>
    </div>
  );
}

export default function CookieConsent() {
  const [storedConsent, setStoredConsent] = useState<CookiePreferences | null>(() => {
    if (typeof window === "undefined") return null;
    return parseStoredConsent(window.localStorage.getItem(COOKIE_CONSENT_KEY));
  });
  const [isOpen, setIsOpen] = useState(() => storedConsent === null);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(storedConsent?.analytics ?? false);
  const [marketing, setMarketing] = useState(storedConsent?.marketing ?? false);

  const saveConsent = (nextAnalytics: boolean, nextMarketing: boolean) => {
    const consent = createCookieConsent(nextAnalytics, nextMarketing);

    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    window.dispatchEvent(
      new CustomEvent<CookiePreferences>("mycleaner:cookie-consent", {
        detail: consent,
      }),
    );

    setStoredConsent(consent);
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setIsOpen(false);
    setShowSettings(false);
  };

  const reopen = () => {
    setAnalytics(storedConsent?.analytics ?? false);
    setMarketing(storedConsent?.marketing ?? false);
    setShowSettings(true);
    setIsOpen(true);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={reopen}
        className="fixed bottom-20 right-4 z-[70] inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/95 px-3.5 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:bottom-5 md:right-5"
      >
        <Cookie className="h-4 w-4" aria-hidden="true" />
        Cookievalg
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#071d1c]/45 p-3 backdrop-blur-[2px] sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-consent-title"
        className="relative w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/15 bg-[#123c3a] text-white shadow-[0_28px_90px_rgba(7,29,28,0.45)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/30 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/4 h-40 w-40 rounded-full bg-[#f2c879]/15 blur-2xl"
          aria-hidden="true"
        />

        <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80">
              <Sparkles className="h-3.5 w-3.5 text-[#f2c879]" aria-hidden="true" />
              Dit valg. Ingen skjulte tricks.
            </div>

            <div className="flex items-start gap-4">
              <div className="hidden h-14 w-14 shrink-0 rotate-[-5deg] items-center justify-center rounded-2xl bg-primary-foreground text-[#123c3a] shadow-lg sm:flex">
                <Cookie className="h-7 w-7" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="cookie-consent-title"
                  className="font-heading text-4xl leading-[0.95] sm:text-5xl"
                >
                  Må vi lige gøre rent bord?
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
                  Du bestemmer, hvilke digitale krummer vi må samle op. Nødvendige
                  cookies holder siden kørende; resten bruger vi kun, hvis du siger ja.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:w-52 lg:flex-col">
            <button
              type="button"
              onClick={() => saveConsent(true, true)}
              className="min-h-11 rounded-full bg-primary-foreground px-5 py-2.5 text-sm font-bold text-[#123c3a] shadow-lg transition hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Accepter alle
            </button>
            <button
              type="button"
              onClick={() => saveConsent(false, false)}
              className="min-h-11 rounded-full border border-white/25 bg-white/[0.08] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Kun nødvendige
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="relative grid gap-3 border-t border-white/10 bg-black/10 px-5 py-5 sm:px-7 lg:grid-cols-3">
            <PreferenceSwitch
              checked
              disabled
              label="Nødvendige"
              description="Login, sikkerhed og de grundlæggende funktioner. Dem kan siden ikke undvære."
            />
            <PreferenceSwitch
              checked={analytics}
              label="Statistik"
              description="Hjælper os med at forstå, hvad der virker, så MyCleaner bliver lettere at bruge."
              onChange={setAnalytics}
            />
            <PreferenceSwitch
              checked={marketing}
              label="Marketing"
              description="Gør vores budskaber mere relevante. Vi tænder aldrig denne kategori på forhånd."
              onChange={setMarketing}
            />
          </div>
        )}

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3.5 text-xs text-white/60 sm:px-7">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
            <span>Du kan ændre dit valg når som helst.</span>
            <Link
              to="/privatliv"
              className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
            >
              Privatliv
            </Link>
          </div>

          {showSettings ? (
            <button
              type="button"
              onClick={() => saveConsent(analytics, marketing)}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 font-bold text-white transition hover:bg-white/[0.15] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Gem mine valg
            </button>
          ) : (
            <button
