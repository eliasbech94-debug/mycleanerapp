import {
  LayoutDashboard,
  Users,
  UserCog,
  MapPin,
  Activity,
  Webhook,
  Inbox,
  LifeBuoy,
  ListChecks,
  UserSearch,
  CreditCard,
  Banknote,
  AlertTriangle,
  BarChart3,
  Tags,
  FileSpreadsheet,
  Scale,
  BookOpen,
  Megaphone,
  BadgeCheck,
  Gavel,
  Shield,
  Palette,
} from "lucide-react";

import type { AppRole } from "@/hooks/useUserRoles";

export interface MissionNavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  /** At least one role is required. `super_admin` always passes via hasRole(). */
  roles: AppRole[];
  /** Short description used by the command palette. */
  hint?: string;
}

export interface MissionNavGroup {
  label: string;
  items: MissionNavItem[];
}

const ADMIN: AppRole[] = ["admin"];
const SUPPORT: AppRole[] = ["admin", "support"];

/**
 * Mission Control navigation.
 *
 * Every entry maps to a route that already exists in App.tsx — no placeholder
 * or "coming soon" surfaces are allowed in the admin shell.
 */
export const MISSION_NAV: MissionNavGroup[] = [
  {
    label: "Oversigt",
    items: [
      { title: "Mission Control", url: "/admin", icon: LayoutDashboard, roles: ADMIN, hint: "Live platformstatus" },
      { title: "Brugere & roller", url: "/admin/users", icon: Users, roles: ADMIN },
      { title: "Providere", url: "/admin/providers", icon: UserCog, roles: ADMIN },
      { title: "Lande", url: "/admin/countries", icon: MapPin, roles: ADMIN },
    ],
  },
  {
    label: "Drift",
    items: [
      { title: "Ops & health", url: "/admin/ops", icon: Activity, roles: ADMIN },
      { title: "Live status", url: "/admin/live-status", icon: Activity, roles: SUPPORT, hint: "Providerstatus & tilstedeværelse" },
      { title: "Webhooks", url: "/admin/webhooks", icon: Webhook, roles: ADMIN },
      { title: "Bookinger", url: "/support/bookings", icon: ListChecks, roles: SUPPORT },
      { title: "Kunder", url: "/support/customers", icon: UserSearch, roles: SUPPORT },
    ],
  },
  {
    label: "Support",
    items: [
      { title: "Indbakke", url: "/support/inbox", icon: Inbox, roles: SUPPORT },
      { title: "Sager", url: "/support/cases", icon: LifeBuoy, roles: SUPPORT },
      { title: "Support-providere", url: "/support/providers", icon: UserSearch, roles: SUPPORT },
    ],
  },
  {
    label: "Betalinger & finans",
    items: [
      { title: "Payments", url: "/admin/payments", icon: CreditCard, roles: ADMIN },
      { title: "Stripe", url: "/admin/stripe", icon: Banknote, roles: ADMIN },
      { title: "Indsigelser", url: "/admin/disputes", icon: AlertTriangle, roles: ADMIN },
      { title: "Marketplace finans", url: "/admin/finance", icon: BarChart3, roles: ADMIN },
      { title: "Priser", url: "/admin/pricing", icon: Tags, roles: ADMIN },
      { title: "Regnskabsrapporter", url: "/admin/accounting-reports", icon: FileSpreadsheet, roles: ADMIN },
      { title: "Regnskabsregler", url: "/admin/accounting-rules", icon: Scale, roles: ADMIN },
    ],
  },
  {
    label: "Verifikation",
    items: [
      { title: "Karriereverifikation", url: "/admin/career-verification", icon: BadgeCheck, roles: ADMIN },
      { title: "Appeller", url: "/admin/appeals", icon: Gavel, roles: SUPPORT },
    ],
  },
  {
    label: "Vækst & indhold",
    items: [
      { title: "Kampagner", url: "/admin/campaigns", icon: Megaphone, roles: ADMIN },
      { title: "Knowledge Center", url: "/admin/knowledge", icon: BookOpen, roles: ADMIN },
      { title: "Legal", url: "/admin/legal", icon: Scale, roles: ADMIN },
      { title: "Designsystem", url: "/admin/design-system", icon: Palette, roles: ADMIN },
    ],
  },
  {
    label: "Sikkerhed",
    items: [
      { title: "Access logs", url: "/admin/access-logs", icon: Shield, roles: ["admin"] },
    ],
  },
];

export function filterMissionNav(
  hasRole: (r: AppRole) => boolean,
): MissionNavGroup[] {
  return MISSION_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles.some((r) => hasRole(r))),
  })).filter((g) => g.items.length > 0);
}

/** Flat lookup used by breadcrumbs and the command palette. */
export function flattenMissionNav(groups = MISSION_NAV): MissionNavItem[] {
  return groups.flatMap((g) => g.items);
}

export function findNavItem(pathname: string, groups = MISSION_NAV): MissionNavItem | null {
  const flat = flattenMissionNav(groups);
  const exact = flat.find((i) => i.url === pathname);
  if (exact) return exact;
  return (
    flat
      .filter((i) => pathname.startsWith(i.url + "/"))
      .sort((a, b) => b.url.length - a.url.length)[0] ?? null
  );
}
