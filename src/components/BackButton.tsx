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
}

/**
 * Tilbage-knap: går ét trin tilbage i historikken.
 * Skjules på forsiden og på evt. yderligere angivne paths.
 */
export const BackButton = ({
  fallback = "/",
  label = "Tilbage",
  className,
  variant = "ghost",
  size = "sm",
  hideOnPaths = ["/"],
}: Props) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (hideOnPaths.includes(pathname)) return null;

  const handleClick = () => {
    // Gå ét trin tilbage hvis muligt, ellers fallback.
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
