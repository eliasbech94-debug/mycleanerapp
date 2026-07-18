import { useState } from "react";
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

type NavLinkItem = { to: string; label: string };

function useMenuForRole() {
  const { user } = useAuth();
  const { isAdmin, isEmployee, isProvider } = useUserRoles();

  const publicLinks: NavLinkItem[] = [
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
      { to: "/task/create", label: "Ny opgave" },
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
  if (onAdminRoute || onEmployeeRoute) return null;

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

        <nav className="hidden md:flex items-center gap-8">
          {primary.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
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
                  <DropdownMenuItem key={l.to} asChild>
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

        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background p-4 space-y-3 animate-fade-up">
          {primary.map((l) => (
            <Link
              key={l.to}
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
                  key={l.to}
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
