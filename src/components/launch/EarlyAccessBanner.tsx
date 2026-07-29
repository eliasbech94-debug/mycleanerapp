import { useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EARLY_ACCESS_COPY, EARLY_ACCESS_MODE } from "@/config/launch";

/** Where the CTA sends people: the existing signup / role-selection surface. */
export const EARLY_ACCESS_SIGNUP_PATH = "/login?mode=signup";

const HEADLINE = "Vær blandt de første på MyCleaner";
const SUBLINE = "Opret din profil allerede nu. Bookinger åbner snart.";
const CTA_LABEL = "Opret profil";
const SECONDARY_LABEL = "Læs mere";
const DIALOG_BODY =
  "MyCleaner åbner som Early Access. Du kan allerede nu oprette din konto, bygge din profil og blive en af de første på platformen. Vi giver dig besked, når bookinger åbner.";

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
      className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground ring-1 ring-inset ring-primary-foreground/25"
    >
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      Early Access
    </span>
  );

  if (compact) {
    return (
      <aside
        role="status"
        aria-label={HEADLINE}
        data-testid="early-access-banner"
        data-variant="compact"
        className={`motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-[hsl(174_72%_14%)] via-[hsl(176_68%_22%)] to-[hsl(186_70%_28%)] text-primary-foreground shadow-sm ${className}`}
      >
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            <Rocket className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
            <div className="min-w-0">
              {badge}
              <p className="mt-1 text-sm font-medium leading-snug">{SUBLINE}</p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="w-full shrink-0 sm:w-auto"
          >
            <Link to={EARLY_ACCESS_SIGNUP_PATH}>{CTA_LABEL}</Link>
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
      className={`w-full px-3 pt-3 sm:px-6 ${className}`}
    >
      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-500 relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(174_72%_13%)] via-[hsl(176_68%_20%)] to-[hsl(186_70%_26%)] text-primary-foreground shadow-lg ring-1 ring-inset ring-primary-foreground/10">
        {/* Very subtle decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[hsl(176_80%_60%)] opacity-20 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 px-5 py-5 sm:px-8 sm:py-6 md:flex-row md:items-center md:justify-between md:gap-8">
          <div className="min-w-0">
            {badge}
            <h2 className="mt-2 flex items-center gap-2 text-lg font-bold leading-tight sm:text-2xl">
              <Rocket className="hidden h-5 w-5 shrink-0 opacity-90 sm:inline-block" aria-hidden="true" />
              {HEADLINE}
            </h2>
            <p className="mt-1 text-sm leading-snug text-primary-foreground/85 sm:text-base">
              {SUBLINE}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
            <Button asChild size="lg" variant="secondary" className="w-full md:w-auto">
              <Link to={EARLY_ACCESS_SIGNUP_PATH} data-testid="early-access-cta">
                {CTA_LABEL}
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(true)}
              data-testid="early-access-more"
              className="w-full text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground md:w-auto"
            >
              {SECONDARY_LABEL}
            </Button>
          </div>
        </div>
      </div>
      {infoDialog}
    </aside>
  );
}

export default EarlyAccessBanner;
