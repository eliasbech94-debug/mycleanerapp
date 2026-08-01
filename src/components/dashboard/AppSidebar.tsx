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
  useSidebar,
} from "@/components/ui/sidebar";
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
    <Sidebar collapsible="icon">
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
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <NavLink to={localize(item.url)} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
};
