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
}

/**
 * Tilbage-knap: går ét trin tilbage i historikken.
 * Skjules på forsiden og på evt. yderligere angivne paths.
 * Understøtter custom onBack til wizards og modals.
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
}: Props) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (hidden) return null;
  if (!onBack && hideOnPaths.includes(pathname)) return null;

  const handleClick = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      aria-label={label}
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline ml-1">{label}</span>
    </Button>
  );
};

export default BackButton;
