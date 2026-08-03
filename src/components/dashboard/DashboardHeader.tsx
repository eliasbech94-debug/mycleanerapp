import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useCountryPath } from "@/lib/countryPath";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  title?: string;
  actions?: ReactNode;
  /** Render the in-dashboard back control (sub-sections only). */
  showBack?: boolean;
  /** Explicit parent route. Falls back to browser history when omitted. */
  backTo?: string;
}

/**
 * Sidebar toggle with a real label, tooltip and a 40px hit area.
 * The bare 28px icon-only trigger was too easy to miss, which forced users to
 * hunt for a way to reclaim the 16rem the sidebar reserves.
 */
const SidebarToggle = () => {
  const { state, isMobile } = useSidebar();
  const expanded = state === "expanded";
  const label = isMobile
    ? "Åbn menu"
    : expanded
      ? "Skjul sidemenu"
      : "Vis sidemenu";
  const Icon = isMobile || !expanded ? PanelLeftOpen : PanelLeftClose;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger
          aria-label={label}
          aria-expanded={isMobile ? undefined : expanded}
          className="h-10 w-10 shrink-0 text-foreground hover:bg-muted"
        >
          <Icon className="h-5 w-5" aria-hidden />
          <span className="sr-only">{label}</span>
        </SidebarTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
};

export const DashboardHeader = ({ title, actions, showBack = false, backTo }: Props) => {
  const navigate = useNavigate();
  // Keep the market prefix (/dk, /se, ...) when jumping to an explicit parent.
  const localize = useCountryPath();

  return (
    <header className="sticky top-16 z-30 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur sm:px-4">
      <SidebarToggle />
      {showBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => (backTo ? navigate(localize(backTo)) : navigate(-1))}
          aria-label="Tilbage til forrige side"
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="ml-1 hidden sm:inline">Tilbage</span>
        </Button>
      )}
      {title && (
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">{title}</h1>
      )}
      {actions && (
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      )}
    </header>
  );
};
