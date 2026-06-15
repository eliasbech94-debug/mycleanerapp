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
} from "lucide-react";

export type DashboardRole = "admin" | "employee" | "provider";

export interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navConfig: Record<DashboardRole, NavGroup[]> = {
  admin: [
    {
      label: "Oversigt",
      items: [
        { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
        { title: "Brugere", url: "/admin/users", icon: Users },
      ],
    },
    {
      label: "Betalinger",
      items: [
        { title: "Payments", url: "/admin/payments", icon: CreditCard },
        { title: "Stripe", url: "/admin/stripe", icon: CreditCard },
        { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
      ],
    },
    {
      label: "Sikkerhed",
      items: [
        { title: "Access logs", url: "/admin/access-logs", icon: Shield },
        { title: "Indstillinger", url: "/admin/settings", icon: Settings },
      ],
    },
  ],
  employee: [
    {
      label: "Arbejde",
      items: [
        { title: "Dashboard", url: "/employee", icon: LayoutDashboard },
        { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
        { title: "Inbox", url: "/employee/inbox", icon: Inbox },
      ],
    },
  ],
  provider: [
    {
      label: "Min forretning",
      items: [
        { title: "Dashboard", url: "/provider-dashboard", icon: LayoutDashboard },
        { title: "Kalender", url: "/provider-dashboard/calendar", icon: Calendar },
        { title: "Bookinger", url: "/provider-dashboard/bookings", icon: ListChecks },
        { title: "Ydelser", url: "/provider-dashboard/services", icon: Briefcase },
      ],
    },
    {
      label: "Konto",
      items: [
        { title: "Profil", url: "/profil", icon: UserCircle },
        { title: "Indstillinger", url: "/provider-dashboard/settings", icon: Settings },
      ],
    },
  ],
};
