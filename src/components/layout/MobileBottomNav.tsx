/**
 * MobileBottomNav — native-app style bottom tab bar shown only on
 * mobile (<768px) for public/customer marketplace routes. Adapts to
 * role: guests get Home/Search/Login/Menu; customers get Home/Book/
 * Bookings/Profile; providers get Home/Dashboard/Messages/Profile.
 *
 * Desktop and tablet layouts are untouched.
 */
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Search, CalendarCheck, User as UserIcon, LayoutDashboard, MessageCircle, LogIn, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuthGate } from "@/context/AuthGateContext";

type Tab = {
  key: string;
  label: string;
  icon: typeof Home;
  to?: string;
  onClick?: () => void;
  match?: (path: string) => boolean;
};

// Routes where the mobile app-nav should appear. Keep in sync with the
// marketplace surface — omit admin/employee/provider dashboards which
// have their own chrome.
const MOBILE_NAV_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/find-cleaner(\/|$)/,
  /^\/book(\/|$)/,
  /^\/mine-bookinger(\/|$)/,
  /^\/profil(\/|$)/,
  /^\/faq(\/|$)/,
  /^\/regler(\/|$)/,
  /^\/c\/[^/]+(\/|$)/,
  /^\/inbox(\/|$)/,
];

function shouldShow(pathname: string) {
  return MOBILE_NAV_ROUTES.some((re) => re.test(pathname));
}

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { isAdmin, isEmployee, isProvider } = useUserRoles();
  const { openLogin } = useAuthGate();

  if (!shouldShow(pathname)) return null;
  if (isAdmin || isEmployee) return null;

  const tabs: Tab[] = user
    ? isProvider
      ? [
          { key: "home", label: t("mobilenav.home", "Hjem"), icon: Home, to: "/", match: (p) => p === "/" },
          { key: "dashboard", label: t("mobilenav.dashboard", "Dashboard"), icon: LayoutDashboard, to: "/provider-dashboard", match: (p) => p.startsWith("/provider-dashboard") },
          { key: "messages", label: t("mobilenav.messages", "Beskeder"), icon: MessageCircle, to: "/inbox", match: (p) => p.startsWith("/inbox") },
          { key: "profile", label: t("mobilenav.profile", "Profil"), icon: UserIcon, to: "/profil", match: (p) => p.startsWith("/profil") },
        ]
      : [
          { key: "home", label: t("mobilenav.home", "Hjem"), icon: Home, to: "/", match: (p) => p === "/" },
          { key: "search", label: t("mobilenav.search", "Søg"), icon: Search, to: "/find-cleaner", match: (p) => p.startsWith("/find-cleaner") },
          { key: "bookings", label: t("mobilenav.bookings", "Bookinger"), icon: CalendarCheck, to: "/mine-bookinger", match: (p) => p.startsWith("/mine-bookinger") },
          { key: "profile", label: t("mobilenav.profile", "Profil"), icon: UserIcon, to: "/profil", match: (p) => p.startsWith("/profil") },
        ]
    : [
        { key: "home", label: t("mobilenav.home", "Hjem"), icon: Home, to: "/", match: (p) => p === "/" },
        { key: "search", label: t("mobilenav.search", "Søg"), icon: Search, to: "/find-cleaner", match: (p) => p.startsWith("/find-cleaner") },
        { key: "login", label: t("mobilenav.login", "Log ind"), icon: LogIn, onClick: () => openLogin({ reason: "mobile_bottom_nav" }) },
        { key: "menu", label: t("mobilenav.more", "Mere"), icon: Menu, to: "/faq", match: (p) => p.startsWith("/faq") },
      ];

  return (
    <>
      {/* Reserve space so page content isn't hidden behind the fixed bar */}
      <div
        aria-hidden
        className="md:hidden"
        style={{ height: "calc(68px + env(safe-area-inset-bottom, 0px))" }}
      />
      <nav
        data-surface="marketplace"
        aria-label={t("mobilenav.label", "Primær navigation")}
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/95 shadow-[0_-8px_24px_-12px_rgba(6,22,21,0.18)] backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="mx-auto grid max-w-[520px] grid-cols-4 px-1 pt-1.5 pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.match ? tab.match(pathname) : false;
            const cls =
              "tap-target relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10.5px] font-medium transition-colors " +
              (active
                ? "text-[hsl(var(--mkt-brand))]"
                : "text-[hsl(var(--mkt-ink-muted))] active:text-[hsl(var(--mkt-ink))]");
            const content = (
              <>
                <span
                  className={
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors " +
                    (active ? "bg-[hsl(var(--mkt-brand))]/12" : "")
                  }
                >
                  <Icon className={"h-[22px] w-[22px] " + (active ? "stroke-[2.4]" : "stroke-[2]")} aria-hidden />
                </span>
                <span className="leading-none">{tab.label}</span>
              </>
            );
            return (
              <li key={tab.key} className="contents">
                {tab.to ? (
                  <Link to={tab.to} className={cls} aria-current={active ? "page" : undefined}>
                    {content}
                  </Link>
                ) : (
                  <button type="button" onClick={tab.onClick} className={cls}>
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
