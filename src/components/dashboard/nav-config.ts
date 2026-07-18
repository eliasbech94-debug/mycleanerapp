import {
  LayoutDashboard,
  Users,
  CreditCard,
  Webhook,
  Shield,
  Calendar,
  Inbox,
  UserCircle,
  Briefcase,
  ListChecks,
  Settings,
  Headphones,
  LifeBuoy,
  Wallet,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

import type { AppRole } from "@/hooks/useUserRoles";

export type DashboardRole = "admin" | "employee" | "provider";

export interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  /**
   * Roles allowed to see this item. The user is granted access if they hold
   * AT LEAST ONE of these roles (super_admin always passes via hasRole()).
   * Defaults are applied per-section below so newly added items are
   * automatically protected by the section's role.
   */
  roles: AppRole[];
}

export interface NavGroup {
  label: string;
  /** Default roles applied to items in this group that don't override `roles`. */
  defaultRoles: AppRole[];
  items: Array<Omit<NavItem, "roles"> & { roles?: AppRole[] }>;
}

const rawConfig: Record<DashboardRole, NavGroup[]> = {
  admin: [
    {
      label: "Oversigt",
      defaultRoles: ["admin"],
      items: [
        { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
        { title: "Brugere", url: "/admin/users", icon: Users },
      ],
    },
    {
      label: "Betalinger",
      defaultRoles: ["admin"],
      items: [
        { title: "Payments", url: "/admin/payments", icon: CreditCard },
        { title: "Stripe", url: "/admin/stripe", icon: CreditCard },
        { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
        { title: "Indsigelser", url: "/admin/disputes", icon: AlertTriangle },
      ],
    },
    {
      label: "Økonomi",
      defaultRoles: ["admin"],
      items: [
        { title: "Marketplace finans", url: "/admin/finance", icon: BarChart3 },
      ],
    },
    {
      label: "Sikkerhed",
      defaultRoles: ["super_admin"],
      items: [
        { title: "Access logs", url: "/admin/access-logs", icon: Shield },
        { title: "Indstillinger", url: "/admin/settings", icon: Settings },
      ],
    },
  ],
  employee: [
    {
      label: "Support",
      defaultRoles: ["employee"],
      items: [
        { title: "Dashboard", url: "/employee", icon: LayoutDashboard },
        { title: "Mine sager", url: "/employee#tickets", icon: LifeBuoy },
        { title: "Provider-opfølgning", url: "/employee#providers", icon: Headphones },
        { title: "Inbox", url: "/employee/inbox", icon: Inbox },
      ],
    },
    {
      label: "Konto",
      defaultRoles: ["employee", "admin", "provider", "customer"],
      items: [
        { title: "Profil", url: "/profil", icon: UserCircle },
      ],
    },
  ],
  provider: [
    {
      label: "Min forretning",
      defaultRoles: ["provider"],
      items: [
        { title: "Dashboard", url: "/provider-dashboard", icon: LayoutDashboard },
        { title: "Kalender", url: "/provider-dashboard/calendar", icon: Calendar },
        { title: "Bookinger", url: "/provider-dashboard/bookings", icon: ListChecks },
        { title: "Ydelser", url: "/provider-dashboard/services", icon: Briefcase },
      ],
    },
    {
      label: "Økonomi",
      defaultRoles: ["provider"],
      items: [
        { title: "Indtjening & udbetalinger", url: "/provider/finance", icon: Wallet },
        { title: "Indsigelser", url: "/provider/disputes", icon: AlertTriangle },
      ],
    },
    {
      label: "Konto",
      defaultRoles: ["provider", "admin", "employee", "customer"],
      items: [
        { title: "Profil", url: "/profil", icon: UserCircle },
        { title: "Indstillinger", url: "/provider-dashboard/settings", icon: Settings },
      ],
    },
  ],
};

export interface ResolvedNavGroup {
  label: string;
  items: NavItem[];
}

/** Resolve `roles` on every item (inheriting the group's defaultRoles). */
export function resolveNavGroups(role: DashboardRole): ResolvedNavGroup[] {
  return rawConfig[role].map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({ ...i, roles: i.roles ?? g.defaultRoles })),
  }));
}

/** Filter resolved groups by the user's actual roles. */
export function filterNavGroupsByRoles(
  groups: ResolvedNavGroup[],
  hasRole: (r: AppRole) => boolean,
): ResolvedNavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.roles.some((r) => hasRole(r))),
    }))
    .filter((g) => g.items.length > 0);
}
