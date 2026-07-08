import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Props {
  fallback?: string;
  label?: string;
  className?: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "default" | "icon";
  hideOnPaths?: string[];
  /** Custom handler — overrider standard navigate(-1). Bruges fx til wizard-trin eller lukning af modal. */
  onBack?: () => void;
  /** Skjul knappen (fx når wizard er på første trin uden historik). */
  hidden?: boolean;
  /** Slå Alt+Left / Alt+Backspace genvej til/fra. Default: true. */
  shortcut?: boolean;
  /** Auto-focus knappen ved mount (fx øverst på wizard-step). Default: false. */
  autoFocus?: boolean;
}

/**
 * Tilbage-knap: går ét trin tilbage i historikken.
 * - Tydelig aria-label ("Gå tilbage til forrige side")
 * - Fokus-synligt via shadcn Button focus ring
 * - Keyboard-genvej: Alt+Left (Windows/Linux/Chrome-standard) og Alt+Backspace
 * - Understøtter custom onBack til wizards og modals
 */
export const BackButton = ({
  fallback = "/",
  label = "Tilbage",
  className,
  variant = "ghost",
  size = "sm",
  hideOnPaths = ["/"],
  onBack,
  hidden = false,
  shortcut = true,
  autoFocus = false,
}: Props) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const btnRef = useRef<HTMLButtonElement>(null);

  const skip = hidden || (!onBack && hideOnPaths.includes(pathname));

  const goBack = () => {
    if (onBack) return onBack();
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback);
  };

  // Auto-focus for keyboard users landing on a new step
  useEffect(() => {
    if (!skip && autoFocus) btnRef.current?.focus();
  }, [skip, autoFocus]);

  // Alt+Left / Alt+Backspace shortcut
  useEffect(() => {
    if (skip || !shortcut) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      ) return;
      if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, shortcut, onBack, pathname]);

  if (skip) return null;

  const ariaLabel = onBack ? label : `${label} — forrige side (Alt + venstre pil)`;

  return (
    <Button
      ref={btnRef}
      type="button"
      variant={variant}
      size={size}
      onClick={goBack}
      className={className}
      aria-label={ariaLabel}
      title={ariaLabel}
      aria-keyshortcuts={shortcut ? "Alt+ArrowLeft" : undefined}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      <span className="ml-1 hidden sm:inline">{label}</span>
    </Button>
  );
};

export default BackButton;
