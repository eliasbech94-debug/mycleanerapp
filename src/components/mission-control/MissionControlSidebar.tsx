import { NavLink, useLocation } from "react-router-dom";
import { Pin, PinOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCountryPath, countryPrefixFromPathname } from "@/lib/countryPath";
import { filterMissionNav, flattenMissionNav, MISSION_NAV } from "./nav";
import { usePinnedPages } from "./usePinnedPages";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Permanent dark navigation rail for Mission Control.
 *
 * Rendered as a fixed panel on desktop and inside a Sheet on mobile (see
 * MissionControlLayout). Colours come from the `mission` token scope so the
 * navy navigation never leaks into the light content area.
 */
export const MissionControlSidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { hasRole, loading } = useUserRoles();
  const { pathname } = useLocation();
  const localize = useCountryPath();
  const { pinned, toggle, isPinned } = usePinnedPages();

  const prefix = countryPrefixFromPathname(pathname);
  const basePath = prefix ? pathname.slice(prefix.length + 1) || "/" : pathname;
  const isActive = (url: string) => basePath === url || basePath.startsWith(url + "/");

  const groups = loading ? [] : filterMissionNav(hasRole);
  const allItems = flattenMissionNav(MISSION_NAV);
  const pinnedItems = pinned
    .map((url) => allItems.find((i) => i.url === url))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .filter((i) => i.roles.some((r) => hasRole(r)));

  return (
    <nav
      aria-label="Mission Control navigation"
      className="flex h-full min-h-0 w-full flex-col bg-[hsl(var(--mission-nav))] text-[hsl(var(--mission-nav-fg))]"
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-[hsl(var(--mission-nav-border))] px-5">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--mission-nav-accent))] text-white"
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold tracking-tight">Mission Control</span>
          <span className="truncate text-[11px] text-[hsl(var(--mission-nav-muted))]">MyCleaner</span>
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-3 py-5">
          {pinnedItems.length > 0 && (
            <Section label="Favoritter">
              {pinnedItems.map((item) => (
                <Row
                  key={`pin-${item.url}`}
                  to={localize(item.url)}
                  active={isActive(item.url)}
                  icon={<item.icon className="h-4 w-4 shrink-0" aria-hidden />}
                  label={item.title}
                  pinned
                  onTogglePin={() => toggle(item.url)}
                  onNavigate={onNavigate}
                />
              ))}
            </Section>
          )}

          {groups.map((group) => (
            <Section key={group.label} label={group.label}>
              {group.items.map((item) => (
                <Row
                  key={item.url}
                  to={localize(item.url)}
                  active={isActive(item.url)}
                  icon={<item.icon className="h-4 w-4 shrink-0" aria-hidden />}
                  label={item.title}
                  pinned={isPinned(item.url)}
                  onTogglePin={() => toggle(item.url)}
                  onNavigate={onNavigate}
                />
              ))}
            </Section>
          ))}
        </div>
      </ScrollArea>
    </nav>
  );
};

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <h2 className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--mission-nav-muted))]">
      {label}
    </h2>
    <ul className="space-y-0.5">{children}</ul>
  </div>
);

interface RowProps {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  pinned: boolean;
  onTogglePin: () => void;
  onNavigate?: () => void;
}

const Row = ({ to, active, icon, label, pinned, onTogglePin, onNavigate }: RowProps) => (
  <li className="group/row relative">
    <NavLink
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 pr-10 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mission-nav-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--mission-nav))]",
        active
          ? "bg-[hsl(var(--mission-nav-active))] font-medium text-white"
          : "text-[hsl(var(--mission-nav-item))] hover:bg-white/5 hover:text-white",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </NavLink>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onTogglePin}
      aria-label={pinned ? `Fjern ${label} fra favoritter` : `Tilføj ${label} til favoritter`}
      aria-pressed={pinned}
      className={cn(
        "absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-[hsl(var(--mission-nav-muted))] hover:bg-white/10 hover:text-white",
        "focus-visible:opacity-100 group-hover/row:opacity-100 md:opacity-0",
        pinned && "opacity-100",
      )}
    >
      {pinned ? <Pin className="h-3.5 w-3.5" aria-hidden /> : <PinOff className="h-3.5 w-3.5" aria-hidden />}
    </Button>
  </li>
);
