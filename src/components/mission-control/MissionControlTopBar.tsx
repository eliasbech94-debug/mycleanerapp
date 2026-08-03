import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  Menu,
  Search,
  Plus,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { supabase } from "@/integrations/supabase/client";
import { useCountryPath, countryPrefixFromPathname } from "@/lib/countryPath";
import { findNavItem } from "./nav";
import { useMissionControlData } from "./useMissionControl";
import { cn } from "@/lib/utils";

interface Props {
  onOpenSearch: () => void;
  onOpenNav: () => void;
}

const QUICK_ACTIONS = [
  { label: "Ny bruger-rolle", to: "/admin/users" },
  { label: "Gennemgå providere", to: "/admin/providers" },
  { label: "Åbn supportindbakke", to: "/support/inbox" },
  { label: "Se indsigelser", to: "/admin/disputes" },
];

export const MissionControlTopBar = ({ onOpenSearch, onOpenNav }: Props) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const localize = useCountryPath();
  const { data } = useMissionControlData();
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  const prefix = countryPrefixFromPathname(pathname);
  const basePath = prefix ? pathname.slice(prefix.length + 1) || "/" : pathname;
  const current = findNavItem(basePath);

  const health = data?.health;
  const degraded = health
    ? health.open_alerts > 0 ||
      health.webhooks_failed_24h > 0 ||
      health.errors_24h > 0 ||
      health.notification_backlog > 50
    : false;

  const alerts = data?.alerts ?? [];

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 md:hidden"
        onClick={onOpenNav}
        aria-label="Åbn Mission Control menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      <nav aria-label="Brødkrumme" className="min-w-0 flex-1">
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap whitespace-nowrap">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={localize("/admin")} className="inline-flex min-h-11 items-center sm:min-h-0">
                  Mission Control
                </Link>
              </BreadcrumbLink>

            </BreadcrumbItem>
            {current && current.url !== "/admin" && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">{current.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </nav>


      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden min-h-11 w-72 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Søg alt…</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
          {mac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 lg:hidden"
        onClick={onOpenSearch}
        aria-label="Åbn global søgning"
      >
        <Search className="h-5 w-5" aria-hidden />
      </Button>

      {health && (
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:flex",
            degraded
              ? "border-warning/40 bg-warning/10 text-warning-foreground/90 text-[hsl(var(--warning))]"
              : "border-success/30 bg-success/10 text-[hsl(var(--success))]",
          )}
        >
          <CircleDot className="h-3.5 w-3.5" aria-hidden />
          {degraded ? "Platform: opmærksomhed" : "Platform: normal"}
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Hurtige handlinger">
            <Plus className="h-5 w-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Hurtige handlinger</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {QUICK_ACTIONS.map((a) => (
            <DropdownMenuItem key={a.to} onSelect={() => navigate(localize(a.to))}>
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-11 w-11"
            aria-label={
              alerts.length > 0
                ? `Notifikationer, ${alerts.length} aktive advarsler`
                : "Notifikationer"
            }
          >
            <Bell className="h-5 w-5" aria-hidden />
            {alerts.length > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[hsl(var(--destructive))]" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Systemadvarsler</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {alerts.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Ingen aktive advarsler.</p>
          ) : (
            alerts.slice(0, 6).map((a) => (
              <DropdownMenuItem key={a.id} onSelect={() => navigate(localize("/admin/ops"))} className="flex-col items-start gap-0.5">
                <span className="text-sm font-medium">{a.title}</span>
                <span className="text-xs text-muted-foreground">
                  {a.severity} · {a.source}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        onClick={signOut}
        aria-label="Log ud"
      >
        <LogOut className="h-5 w-5" aria-hidden />
      </Button>
    </header>
  );
};
