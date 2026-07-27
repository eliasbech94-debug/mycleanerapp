import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Globe, ChevronDown, User as UserIcon, LogOut } from "lucide-react";
import { countries } from "@/lib/countries";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BackButton from "@/components/BackButton";
import MarketplaceHeader from "@/components/layout/MarketplaceHeader";
import { normalizePath } from "@/hooks/useIsMobileApp";

/**
 * Routes that render inside MobileAppShell below 768px and already show a
 * MobileAppBar. Hiding the global Header on these routes prevents duplicate
 * headers on mobile without touching desktop/tablet (>=768px) layout.
 * `/` intentionally excluded — Phase 3 MobileHomeGate uses `appBar={false}`,
 * so the global Header remains the sole header on `/`.
 */
const MOBILE_SHELL_HIDE_ROUTES: RegExp[] = [
  /^\/marketplace(\/|$)/,
  /^\/mine-bookinger(\/|$)/,
  /^\/customer\/bookings(\/|$)/,
];
export function isMobileShellHiddenHeaderRoute(pathname: string): boolean {
  const p = normalizePath(pathname);
  return MOBILE_SHELL_HIDE_ROUTES.some((re) => re.test(p));
}
function useBelow768(): boolean {
  const [below, setBelow] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < 768,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => setBelow(window.innerWidth < 768);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

/**
 * Public customer surfaces render the light "marketplace" navbar variant.
 * All other routes (admin, provider back-office, etc.) keep the classic
 * dark navbar below. The switch is presentation-only — auth, roles,
 * and country/market logic are shared via the same hooks.
 */
const MARKETPLACE_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/(dk|gb|se|es)(\/)?$/,
  /^\/marketplace(\/|$)/,
  /^\/find-cleaner(\/|$)/,
  /^\/p\/[^/]+(\/|$)/,
  /^\/c\/[^/]+(\/|$)/,
  /^\/faq(\/|$)/,
  /^\/regler(\/|$)/,
];
function isMarketplaceRoute(pathname: string): boolean {
  return MARKETPLACE_ROUTES.some((re) => re.test(pathname));
}

type NavLinkItem = { to: string; label: string };

function useMenuForRole() {
  const { user } = useAuth();
  const { isAdmin, isEmployee, isProvider } = useUserRoles();

  const publicLinks: NavLinkItem[] = [
    { to: "/book", label: "Book en cleaner" },
    { to: "/find-cleaner", label: "Find cleaner" },
    { to: "/faq", label: "Sådan virker det" },
    { to: "/provider/register", label: "Bliv provider" },
    { to: "/faq", label: "FAQ" },
  ];

  if (!user) return { primary: publicLinks, account: [] as NavLinkItem[] };

  if (isAdmin) {
    return {
      primary: [{ to: "/faq", label: "FAQ" }, { to: "/regler", label: "Regler" }],
      account: [
        { to: "/admin", label: "Admin dashboard" },
        { to: "/profil", label: "Min profil" },
      ],
    };
  }
  if (isEmployee) {
    return {
      primary: [{ to: "/faq", label: "FAQ" }, { to: "/regler", label: "Regler" }],
      account: [
        { to: "/employee", label: "Medarbejder" },
        { to: "/profil", label: "Min profil" },
      ],
    };
  }
  if (isProvider) {
    return {
      primary: [
        { to: "/provider-dashboard", label: "Dashboard" },
        { to: "/provider/bilag", label: "Bilag" },
        { to: "/faq", label: "FAQ" },
        { to: "/regler", label: "Regler" },
      ],
      account: [
        { to: "/provider-dashboard", label: "Provider dashboard" },
        { to: "/provider/bilag", label: "Bilag & udgifter" },
        { to: "/profil", label: "Min profil" },
      ],
    };
  }
  // Customer (default logged-in)
  return {
    primary: [
      { to: "/book", label: "Book en cleaner" },
      { to: "/mine-bookinger", label: "Mine bookinger" },
      { to: "/faq", label: "FAQ" },
      { to: "/regler", label: "Regler" },
    ],
    account: [
      { to: "/profil", label: "Min profil" },
      { to: "/mine-bookinger", label: "Mine bookinger" },
    ],
  };
}

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { primary, account } = useMenuForRole();

  const onAdminRoute = location.pathname.startsWith("/admin");
  const onEmployeeRoute = location.pathname.startsWith("/employee");
  const belowMd = useBelow768();
  if (onAdminRoute || onEmployeeRoute) return null;
  if (belowMd && isMobileShellHiddenHeaderRoute(location.pathname)) return null;
  if (isMarketplaceRoute(location.pathname)) return <MarketplaceHeader />;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container-wide flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <BackButton className="mr-1" />
          <Link to="/" className="flex items-center gap-2" aria-label="MyCleaner – forside">
            <img
              src="/mycleaner-logo.png"
              alt="MyCleaner"
              className="h-9 w-9 object-contain"
            />
            <span className="font-heading font-bold text-xl text-foreground">MyCleaner</span>
          </Link>
        </div>

        <nav className="hidden lg:flex items-center gap-8">
          {primary.map((l) => (
            <Link
              key={`${l.to}-${l.label}`}
              to={l.to}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Globe className="h-4 w-4" />
                <span>{selectedCountry.flag} {selectedCountry.code}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {countries.map((c) => (
                <DropdownMenuItem key={c.code} onClick={() => setSelectedCountry(c)}>
                  <span className="mr-2">{c.flag}</span> {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" /> Min konto
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
                  <LogOut className="h-4 w-4 mr-2" /> Log ud
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">Log ind</Button>
              </Link>
              <Link to="/customer/register">
                <Button size="sm">Kom i gang</Button>
              </Link>
            </>
          )}
        </div>

        <button className="lg:hidden" aria-label="Toggle menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background p-4 space-y-3 animate-fade-up">
          {primary.map((l) => (
            <Link
              key={`${l.to}-${l.label}`}
              to={l.to}
              className="block py-2 text-sm font-medium"
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <hr className="border-border" />
          {user ? (
            <>
              {account.map((l) => (
                <Link
                  key={`${l.to}-${l.label}`}
                  to={l.to}
                  className="block py-2 text-sm font-medium"
                  onClick={() => setMobileOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setMobileOpen(false);
                  handleSignOut();
                }}
              >
                <LogOut className="h-4 w-4 mr-2" /> Log ud
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full">Log ind</Button>
              </Link>
              <Link to="/customer/register" onClick={() => setMobileOpen(false)}>
                <Button className="w-full">Kom i gang</Button>
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
