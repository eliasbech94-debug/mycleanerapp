import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkle, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EARLY_ACCESS_COPY, EARLY_ACCESS_MODE } from "@/config/launch";
import logoWatermark from "@/assets/mycleaner-logo.png";

/** Where the CTA sends people: the existing signup / role-selection surface. */
export const EARLY_ACCESS_SIGNUP_PATH = "/login?mode=signup";

const BADGE = "Early Access · 1. august";
const HEADLINE = "MyCleaner åbner dørene";
const SUBLINE = "Opret din profil nu, og bliv en af de første på platformen.";
const CTA_LABEL = "Få Early Access";
const SECONDARY_LABEL = "Se hvordan det virker";
const FOOTNOTE = "Gratis at oprette · Ingen binding";
const DIALOG_BODY =
  "MyCleaner åbner som Early Access. Du kan allerede nu oprette din konto, bygge din profil og blive en af de første på platformen. Vi giver dig besked, når bookinger åbner.";

/** Logo-derived palette: deep navy → royal blue → cyan. */
const GRADIENT =
  "linear-gradient(115deg, hsl(224 72% 14%) 0%, hsl(226 78% 26%) 38%, hsl(222 88% 42%) 68%, hsl(192 90% 46%) 100%)";

type Variant = "hero" | "compact";

/**
 * Presentational Early Access banner. Contains no Early Access logic —
 * it only renders when EARLY_ACCESS_MODE is on and links to signup.
 */
export function EarlyAccessBanner({
  className = "",
  variant = "hero",
}: {
  className?: string;
  variant?: Variant;
}) {
  const [open, setOpen] = useState(false);

  if (!EARLY_ACCESS_MODE) return null;

  const compact = variant === "compact";

  const infoDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{EARLY_ACCESS_COPY.bannerTitle}</DialogTitle>
          <DialogDescription>{DIALOG_BODY}</DialogDescription>
        </DialogHeader>
        <Button asChild className="w-full">
          <Link to={EARLY_ACCESS_SIGNUP_PATH} onClick={() => setOpen(false)}>
            {CTA_LABEL}
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );

  const badge = (
    <span
      data-testid="early-access-badge"
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm sm:text-[11px]"
    >
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      {BADGE}
    </span>
  );

  if (compact) {
    return (
      <aside
        role="status"
        aria-label={HEADLINE}
        data-testid="early-access-banner"
        data-variant="compact"
        className={`relative w-full overflow-hidden rounded-xl text-white shadow-md ${className}`}
        style={{ background: GRADIENT }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-300/25 blur-3xl"
        />
        <div className="relative flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {badge}
            <p className="mt-1 text-sm font-medium leading-snug text-white/90">{SUBLINE}</p>
          </div>
          <Button
            asChild
            size="sm"
            className="w-full shrink-0 bg-white text-[hsl(226_78%_26%)] shadow-sm transition-transform hover:bg-white/90 active:scale-[0.98] sm:w-auto"
          >
            <Link to={EARLY_ACCESS_SIGNUP_PATH}>
              {CTA_LABEL}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {infoDialog}
      </aside>
    );
  }

  return (
    <aside
      role="status"
      aria-label={HEADLINE}
      data-testid="early-access-banner"
      data-variant="hero"
      className={`w-full px-4 pt-3 sm:px-6 ${className}`}
    >
      <div
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 relative mx-auto max-w-6xl overflow-hidden rounded-2xl text-white shadow-[0_18px_50px_-18px_hsl(226_78%_26%/0.75)] ring-1 ring-inset ring-white/15"
        style={{ background: GRADIENT }}
      >
        {/* Radial glows */}
        <div
          aria-hidden="true"
          className="motion-safe:animate-pulse pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-blue-400/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-sky-200/20 blur-3xl"
        />

        {/* Curved graphic element for depth */}
        <svg
          aria-hidden="true"
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 opacity-30"
        >
          <path d="M180 0 C 320 60, 300 150, 460 200 L600 200 L600 0 Z" fill="white" fillOpacity="0.06" />
          <path d="M300 0 C 420 70, 400 140, 560 200" stroke="white" strokeOpacity="0.18" strokeWidth="1.5" fill="none" />
        </svg>

        {/* Logo watermark */}
        <img
          src={logoWatermark}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-8 hidden h-[150%] max-w-none select-none opacity-[0.07] md:block"
        />

        {/* Sparkle accents */}
        <Sparkle className="pointer-events-none absolute right-[18%] top-6 h-4 w-4 text-white/50" aria-hidden="true" />
        <Star className="pointer-events-none absolute right-[10%] bottom-8 h-3 w-3 text-cyan-200/60" aria-hidden="true" />
        <Sparkle className="pointer-events-none absolute right-[30%] bottom-5 h-2.5 w-2.5 text-white/35" aria-hidden="true" />

        <div className="relative flex flex-col gap-3 px-4 py-4 sm:gap-4 sm:px-8 sm:py-7 md:max-w-[62%] md:py-9">
          {badge}
          <div>
            <h2 className="text-2xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl">
              {HEADLINE}
            </h2>
            <p className="mt-2 text-sm leading-snug text-white/85 sm:text-base">{SUBLINE}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Button
              asChild
              size="lg"
              className="w-full bg-white text-[hsl(226_78%_26%)] shadow-lg shadow-black/20 transition-transform hover:bg-white/90 active:scale-[0.98] sm:w-auto"
            >
              <Link to={EARLY_ACCESS_SIGNUP_PATH} data-testid="early-access-cta">
                {CTA_LABEL}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              data-testid="early-access-more"
              className="w-fit self-center rounded-md text-sm font-semibold text-white/90 underline underline-offset-4 transition-colors hover:text-white sm:self-auto"
            >
              {SECONDARY_LABEL}
            </button>
          </div>

          <p className="text-xs font-medium text-white/70">{FOOTNOTE}</p>
        </div>
      </div>
      {infoDialog}
    </aside>
  );
}

export default EarlyAccessBanner;
