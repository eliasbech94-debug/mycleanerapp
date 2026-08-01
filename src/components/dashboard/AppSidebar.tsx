import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Sparkles } from "lucide-react";
import {
  DashboardRole,
  resolveNavGroups,
  filterNavGroupsByRoles,
} from "./nav-config";
import { useUserRoles } from "@/hooks/useUserRoles";
import { countryPrefixFromPathname, useCountryPath } from "@/lib/countryPath";

interface Props {
  role: DashboardRole;
}

export const AppSidebar = ({ role }: Props) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { hasRole, loading } = useUserRoles();

  const groups = loading
    ? []
    : filterNavGroupsByRoles(resolveNavGroups(role), hasRole);

  // Nav URLs are market-agnostic; compare against the path without the
  // /{country} prefix so items stay highlighted on localised URLs.
  const localize = useCountryPath();
  const prefix = countryPrefixFromPathname(pathname);
  const basePath = prefix ? pathname.slice(prefix.length + 1) || "/" : pathname;
  const isActive = (url: string) => basePath === url || basePath.startsWith(url + "/");


  return (
    <Sidebar collapsible="icon" className="top-16 h-[calc(100svh-4rem)]">
      {/* Brand row doubles as an anchor so the collapsed rail reads as a menu
          rather than an unexplained strip of icons. */}
      <SidebarHeader className="h-12 justify-center border-b border-sidebar-border px-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              MyCleaner
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => {
          const hasActive = group.items.some((i) => isActive(i.url));
          return (
            <SidebarGroup key={group.label} data-active={hasActive || undefined}>
              {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      {item.comingSoon ? (
                        <SidebarMenuButton
                          aria-disabled="true"
                          tooltip={`${item.title} — kommer snart`}
                          title={`${item.title} — kommer snart`}
                          className="cursor-default opacity-60 hover:bg-transparent"
                          onClick={(e) => e.preventDefault()}
                        >
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                          {!collapsed && (
                            <span className="flex w-full items-center justify-between gap-2">
                              <span>{item.title}</span>
                              <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                Snart
                              </span>
                            </span>
                          )}
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                          <NavLink to={localize(item.url)} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      {/* Wide, draggable-looking edge target: a second, forgiving way to
          collapse/expand besides the header button. */}
      <SidebarRail aria-label="Skjul eller vis sidemenu" />
    </Sidebar>
  );
};
