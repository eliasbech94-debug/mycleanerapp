/**
 * MarketplaceHeader — light royal-blue navbar used on public customer
 * routes. Delegates:
 *   - authentication         → useAuth
 *   - role detection         → useUserRoles
 *   - country/language       → <MarketMenu />
 *   - login modal            → useAuthGate().openLogin
 *   - registration splitter  → useAuthGate().openRegister
 * No auth or session logic is duplicated here — this is a presentation
 * variant only, mirroring the same primary/account items the classic
 * Header exposes but styled for the marketplace surface.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, X, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuthGate } from "@/context/AuthGateContext";
import { MarketMenu } from "@/components/marketplace/MarketMenu";
import BackButton from "@/components/BackButton";

type NavItem = { to: string; label: string };

export default function MarketplaceHeader() {
  const { t } = useTranslation("common");
  const { user, signOut } = useAuth();
  const { isAdmin, isEmployee, isProvider } = useUserRoles();
  const { openLogin, openRegister } = useAuthGate();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const primary: NavItem[] = user
    ? isAdmin
      ? [{ to: "/admin", label: t("nav.admin", "Admin") }, { to: "/faq", label: t("nav.faq", "FAQ") }]
      : isEmployee
        ? [{ to: "/employee", label: t("nav.employee", "Employee") }, { to: "/faq", label: t("nav.faq", "FAQ") }]
        : isProvider
          ? [
              { to: "/provider-dashboard", label: t("nav.dashboard", "Dashboard") },
              { to: "/provider/bilag", label: t("nav.receipts", "Receipts") },
              { to: "/faq", label: t("nav.faq", "FAQ") },
            ]
          : [
              { to: "/find-cleaner", label: t("nav.find_cleaner", "Find cleaner") },
              { to: "/mine-bookinger", label: t("nav.my_bookings", "My bookings") },
              { to: "/faq", label: t("nav.faq", "FAQ") },
            ]
    : [
        { to: "/find-cleaner", label: t("nav.find_cleaner", "Find cleaner") },
        { to: "/faq", label: t("nav.how", "How it works") },
        { to: "/bliv-cleaner", label: t("nav.become_cleaner", "Become a cleaner") },
      ];

  const account: NavItem[] = isAdmin
    ? [{ to: "/admin", label: t("nav.admin_dashboard", "Admin dashboard") }, { to: "/profil", label: t("nav.profile", "My profile") }]
    : isEmployee
      ? [{ to: "/employee", label: t("nav.employee", "Employee") }, { to: "/profil", label: t("nav.profile", "My profile") }]
      : isProvider
        ? [
            { to: "/provider-dashboard", label: t("nav.provider_dashboard", "Provider dashboard") },
            { to: "/provider/bilag", label: t("nav.receipts_expenses", "Receipts & expenses") },
            { to: "/profil", label: t("nav.profile", "My profile") },
          ]
        : [
            { to: "/profil", label: t("nav.profile", "My profile") },
            { to: "/mine-bookinger", label: t("nav.my_bookings", "My bookings") },
          ];

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header
      data-surface="marketplace"
      className="sticky top-0 z-40 border-b border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/95 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 lg:px-8">
        <div className="flex items-center gap-2">
          <BackButton className="mr-1" />
          <Link to="/" className="flex items-center gap-2" aria-label="MyCleaner">
            <img src="/mycleaner-logo.png" alt="MyCleaner" className="h-9 w-9 object-contain" />
            <span className="font-heading text-[19px] font-semibold text-[hsl(var(--mkt-ink))]">MyCleaner</span>
          </Link>
        </div>

        <nav className="hidden items-center gap-7 md:flex" aria-label={t("nav.primary", "Primary")}>
          {primary.map((l) => (
            <Link
              key={`${l.to}-${l.label}`}
              to={l.to}
              className="text-[13.5px] font-medium text-[hsl(var(--mkt-ink-muted))] transition hover:text-[hsl(var(--mkt-ink))]"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <MarketMenu />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-[hsl(var(--mkt-ink))]">
                  <UserIcon className="h-4 w-4" /> {t("nav.my_account", "My account")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {account.map((l) => (
                  <DropdownMenuItem key={`${l.to}-${l.label}`} asChild>
                    <Link to={l.to}>{l.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" /> {t("nav.sign_out", "Sign out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => openLogin({ reason: "navbar" })}>
                {t("nav.sign_in", "Log in")}
              </Button>
              <Button
                size="sm"
                onClick={openRegister}
                className="bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] hover:bg-[hsl(var(--mkt-brand-hover))]"
              >
                {t("nav.get_started", "Get started")}
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="text-[hsl(var(--mkt-ink))] md:hidden"
          aria-label={t("nav.toggle", "Toggle menu")}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 md:hidden">
          <nav className="space-y-1" aria-label={t("nav.mobile", "Mobile primary")}>
            {primary.map((l) => (
              <Link
                key={`${l.to}-${l.label}`}
                to={l.to}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2 text-[14px] font-medium text-[hsl(var(--mkt-ink))] hover:bg-[hsl(var(--mkt-surface-muted))]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 border-t border-[hsl(var(--mkt-border))] pt-3">
            <MarketMenu align="start" />
          </div>
          <div className="mt-3 space-y-2">
            {user ? (
              <>
                {account.map((l) => (
                  <Link
                    key={`m-${l.to}-${l.label}`}
                    to={l.to}
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-lg px-3 py-2 text-[14px] font-medium text-[hsl(var(--mkt-ink))] hover:bg-[hsl(var(--mkt-surface-muted))]"
                  >
                    {l.label}
                  </Link>
                ))}
                <Button variant="ghost" className="w-full justify-start" onClick={() => { setMobileOpen(false); void handleSignOut(); }}>
                  <LogOut className="mr-2 h-4 w-4" /> {t("nav.sign_out", "Sign out")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" className="w-full" onClick={() => { setMobileOpen(false); openLogin({ reason: "navbar_mobile" }); }}>
                  {t("nav.sign_in", "Log in")}
                </Button>
                <Button
                  className="w-full bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] hover:bg-[hsl(var(--mkt-brand-hover))]"
                  onClick={() => { setMobileOpen(false); openRegister(); }}
                >
                  {t("nav.get_started", "Get started")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
