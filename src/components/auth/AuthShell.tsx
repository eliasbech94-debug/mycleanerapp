/**
 * AuthShell — shared visual shell for every MyCleaner auth surface
 * (login, signup, forgot password, reset password, role choice).
 *
 * PRESENTATION ONLY. It contains no auth logic, no Supabase calls and no
 * navigation side effects beyond the plain "back" and logo links.
 */
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import logo from "@/assets/mycleaner-logo.png";
import { EARLY_ACCESS_MODE } from "@/config/launch";

/** Logo-derived palette shared by all auth surfaces. */
export const AUTH_COLORS = {
  navy: "hsl(224 72% 14%)",
  royal: "hsl(222 88% 42%)",
  cyan: "hsl(192 90% 46%)",
} as const;

export const AUTH_PANEL_GRADIENT =
  "linear-gradient(150deg, hsl(224 72% 14%) 0%, hsl(226 78% 26%) 40%, hsl(222 88% 42%) 72%, hsl(192 90% 46%) 100%)";

export function EarlyAccessChip() {
  if (!EARLY_ACCESS_MODE) return null;
  return (
    <span
      data-testid="auth-early-access-chip"
      className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[hsl(222_88%_42%/0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(222_88%_42%)] ring-1 ring-inset ring-[hsl(222_88%_42%/0.2)]"
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      Early Access
    </span>
  );
}

type Props = {
  children: ReactNode;
  /** Optional side-panel headline override (desktop only). */
  panelText?: string;
  /** Max width of the auth card. */
  maxWidth?: string;
};

export function AuthShell({
  children,
  panelText = "Find den rette hjælp. Eller byg din professionelle profil.",
  maxWidth = "max-w-[440px]",
}: Props) {
  const navigate = useNavigate();

  return (
    <main
      data-testid="auth-shell"
      className="min-h-screen w-full bg-[hsl(210_60%_98%)] text-[hsl(224_45%_16%)]"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl">
        {/* Desktop visual panel */}
        <aside
          aria-hidden="true"
          data-testid="auth-side-panel"
          className="relative hidden w-[42%] shrink-0 overflow-hidden lg:block"
          style={{ background: AUTH_PANEL_GRADIENT }}
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-blue-400/25 blur-3xl" />
          <Sparkles className="pointer-events-none absolute right-16 top-24 h-5 w-5 text-white/40" />
          <Sparkles className="pointer-events-none absolute left-14 top-1/2 h-3.5 w-3.5 text-cyan-200/50" />
          <Sparkles className="pointer-events-none absolute right-24 bottom-28 h-4 w-4 text-white/30" />
          <img
            src={logo}
            alt=""
            className="pointer-events-none absolute -bottom-10 -right-14 h-[70%] max-w-none select-none opacity-[0.06]"
          />
          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <img src={logo} alt="MyCleaner" className="h-9 w-auto object-contain" />
            <p className="max-w-xs text-2xl font-semibold leading-snug tracking-tight">
              {panelText}
            </p>
            <p className="text-xs font-medium text-white/70">
              Gratis at oprette · Ingen binding
            </p>
          </div>
        </aside>

        {/* Form column */}
        <div className="flex w-full flex-col px-5 pb-10 pt-4 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Tilbage"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[hsl(224_45%_16%)] transition-colors hover:bg-[hsl(222_88%_42%/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Link to="/" aria-label="MyCleaner forside" className="lg:hidden">
              <img src={logo} alt="MyCleaner" className="h-8 w-auto object-contain" />
            </Link>
            <span className="h-10 w-10" aria-hidden="true" />
          </div>

          <div className="flex flex-1 items-start justify-center pt-4 sm:items-center sm:pt-0">
            <div className={`w-full ${maxWidth}`}>{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** White rounded card used inside the shell. */
export function AuthCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[hsl(222_60%_90%)] bg-white p-5 shadow-[0_18px_40px_-24px_hsl(222_88%_42%/0.45)] sm:p-7 ${className}`}
    >
      {children}
    </div>
  );
}

export default AuthShell;
