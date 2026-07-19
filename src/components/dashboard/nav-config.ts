import {
  LayoutDashboard,
  Users,
  CreditCard,
  Webhook,
  Shield,
  Inbox,
  UserCircle,
  ListChecks,
  Headphones,
  LifeBuoy,
  Wallet,
  BarChart3,
  AlertTriangle,
  Bell,
  FileText,
  MapPin,
  HelpCircle,
  UserSearch,
  Briefcase,
  Settings,
} from "lucide-react";

import type { AppRole } from "@/hooks/useUserRoles";

export type DashboardRole = "admin" | "employee" | "provider" | "customer" | "support";

export interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  /**
   * Roles allowed to see this item. User needs AT LEAST ONE (super_admin bypass
   * handled by hasRole()). Defaults inherit from the group.
   */
  roles: AppRole[];
}

export interface NavGroup {
  label: string;
  defaultRoles: AppRole[];
  items: Array<Omit<NavItem, "roles"> & { roles?: AppRole[] }>;
}

// NOTE: Only routes that actually exist in App.tsx may appear here. Broken
// sidebar links (calendar/services/settings/etc.) were removed in Phase 1 —
// they will return once the underlying pages are implemented.
const rawConfig: Record<DashboardRole, NavGroup[]> = {
  admin: [
    {
      label: "Oversigt",
      defaultRoles: ["admin"],
      items: [
        { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
        { title: "Brugere & roller", url: "/admin/users", icon: Users },
        { title: "Lande", url: "/admin/countries", icon: MapPin },
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
      label: "Drift & sikkerhed",
      defaultRoles: ["admin"],
      items: [
        { title: "Ops", url: "/admin/ops", icon: BarChart3 },
        { title: "Access logs", url: "/admin/access-logs", icon: Shield, roles: ["super_admin"] },
      ],
    },
  ],
  employee: [
    {
      label: "Drift",
      defaultRoles: ["employee"],
      items: [
        { title: "Dashboard", url: "/employee", icon: LayoutDashboard },
      ],
    },
    {
      label: "Konto",
      defaultRoles: ["employee", "admin", "provider", "customer", "support"],
      items: [
        { title: "Profil", url: "/profil", icon: UserCircle },
      ],
    },
  ],
  support: [
    {
      label: "Support",
      defaultRoles: ["support", "admin"],
      items: [
        { title: "Oversigt", url: "/support", icon: LayoutDashboard },
        { title: "Indbakke", url: "/support/inbox", icon: Inbox },
        { title: "Sager", url: "/support/cases", icon: LifeBuoy },
        { title: "Kunder", url: "/support/customers", icon: UserSearch },
        { title: "Providers", url: "/support/providers", icon: Headphones },
        { title: "Bookinger", url: "/support/bookings", icon: ListChecks },
      ],
    },
    {
      label: "Konto",
      defaultRoles: ["support", "admin", "employee", "provider", "customer"],
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
        { title: "Bilag", url: "/provider/bilag", icon: Briefcase },
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
      defaultRoles: ["provider", "admin", "employee", "customer", "support"],
      items: [
        { title: "Profil", url: "/profil", icon: UserCircle },
      ],
    },
  ],
  customer: [
    {
      label: "Min konto",
      defaultRoles: ["customer"],
      items: [
        { title: "Oversigt", url: "/customer", icon: LayoutDashboard },
        { title: "Mine bookinger", url: "/customer/bookings", icon: ListChecks },
        { title: "Notifikationer", url: "/customer/notifications", icon: Bell },
        { title: "Fakturaer", url: "/customer/invoices", icon: FileText },
        { title: "Adresser", url: "/customer/addresses", icon: MapPin },
      ],
    },
    {
      label: "Konto",
      defaultRoles: ["customer"],
      items: [
        { title: "Profil", url: "/customer/profile", icon: UserCircle },
        { title: "Indstillinger", url: "/customer/settings", icon: Settings },
        { title: "Support", url: "/faq", icon: HelpCircle },
      ],
    },
  ],
};

export interface ResolvedNavGroup {
  label: string;
  items: NavItem[];
}

export function resolveNavGroups(role: DashboardRole): ResolvedNavGroup[] {
  return rawConfig[role].map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({ ...i, roles: i.roles ?? g.defaultRoles })),
  }));
}

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
