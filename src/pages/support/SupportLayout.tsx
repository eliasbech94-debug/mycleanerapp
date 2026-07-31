import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSupportCounters } from "@/hooks/useSupportCounters";
import { LayoutDashboard, Inbox, LifeBuoy, UserSearch, Headphones, ListChecks, AlertTriangle } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

const TABS = [
  { to: "/support/dashboard", label: "Overblik",   icon: LayoutDashboard },
  { to: "/support/inbox",     label: "Indbakke",   icon: Inbox },
  { to: "/support/cases",     label: "Sager",      icon: LifeBuoy },
  { to: "/support/customers", label: "Kunder",     icon: UserSearch },
  { to: "/support/providers", label: "Providere",  icon: Headphones },
  { to: "/support/bookings",  label: "Bookinger",  icon: ListChecks },
];

/**
 * Real support workspace shell.
 * - Renders inside the shared DashboardLayout with role="support" so the
 *   existing role-appropriate sidebar is reused.
 * - Adds a secondary tab bar and a live counters strip fed by the
 *   server-gated `support-counters` edge function.
 * - Purely presentational: no permission checks (RoleGuard handles that
 *   on the route level).
 */
export function SupportLayout({ title, description, headerActions, children }: Props) {
  const { data: counters, isLoading } = useSupportCounters();
  const { pathname } = useLocation();

  const chips: Array<{ label: string; value: number; tone: string }> = counters
    ? [
        { label: "Mine åbne",    value: counters.mine_open,  tone: "bg-primary/10 text-primary" },
        { label: "Ikke tildelte", value: counters.unassigned, tone: "bg-warning/10 text-warning-foreground" },
        { label: "Akut",         value: counters.urgent,     tone: "bg-destructive/10 text-destructive" },
        { label: "Eskaleret",    value: counters.escalated,  tone: "bg-accent/10 text-accent-foreground" },
        { label: "Ulæste",       value: counters.unread,     tone: "bg-muted text-foreground" },
      ]
    : [];

  return (
    <DashboardLayout role="support" title={title} headerActions={headerActions}>
      <div className="p-4 sm:p-6 space-y-4">
        <header className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-serif">{title}</h1>
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>

          <nav
            aria-label="Support-sektioner"
            className="flex gap-1 overflow-x-auto -mx-1 px-1"
          >
            {TABS.map((t) => {
              const active = pathname === t.to || pathname.startsWith(t.to + "/");
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {t.label}
                </NavLink>
              );
            })}
          </nav>

          <div
            className="flex flex-wrap items-center gap-2"
            aria-live="polite"
            aria-busy={isLoading}
          >
            {isLoading && (
              <span className="text-xs text-muted-foreground">Henter statistik…</span>
            )}
            {chips.map((c) => (
              <Badge
                key={c.label}
                variant="secondary"
                className={cn("gap-1 font-normal border-transparent", c.tone)}
              >
                <span>{c.label}</span>
                <span className="font-semibold tabular-nums">{c.value}</span>
                {c.label === "Akut" && c.value > 0 && (
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                )}
              </Badge>
            ))}
          </div>
        </header>

        <div>{children}</div>
      </div>
    </DashboardLayout>
  );
}
