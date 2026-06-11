import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Globe, ChevronDown, User as UserIcon } from "lucide-react";
import { countries } from "@/lib/countries";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const location = useLocation();
  const { user } = useAuth();
  const { isAdmin, isEmployee, isProvider } = useUserRoles();

  const onAdminRoute = location.pathname.startsWith("/admin");
  const onEmployeeRoute = location.pathname.startsWith("/employee");

  if (onAdminRoute || onEmployeeRoute) return null;

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container-wide flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="gradient-hero rounded-xl w-9 h-9 flex items-center justify-center">
            <span className="text-primary-foreground font-heading font-bold text-lg">H</span>
          </div>
          <span className="font-heading font-bold text-xl text-foreground">HomeHero</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link to="/services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Services
          </Link>
          <Link to="/how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sådan virker det
          </Link>
          <Link to="/provider/register" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Bliv provider
          </Link>
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
                {isAdmin && <DropdownMenuItem asChild><Link to="/admin">Admin dashboard</Link></DropdownMenuItem>}
                {isEmployee && !isAdmin && <DropdownMenuItem asChild><Link to="/employee">Medarbejder</Link></DropdownMenuItem>}
                {!isAdmin && !isEmployee && <DropdownMenuItem asChild><Link to="/profil">Min profil</Link></DropdownMenuItem>}
                {!isAdmin && !isEmployee && <DropdownMenuItem asChild><Link to="/mine-bookinger">Mine bookinger</Link></DropdownMenuItem>}
                {isProvider && <DropdownMenuItem asChild><Link to="/provider-dashboard">Provider dashboard</Link></DropdownMenuItem>}
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
          <Link to="/services" className="block py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>Services</Link>
          <Link to="/how-it-works" className="block py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>Sådan virker det</Link>
          <Link to="/provider/register" className="block py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>Bliv provider</Link>
          <hr className="border-border" />
          <Link to="/login" onClick={() => setMobileOpen(false)}>
            <Button variant="ghost" className="w-full">Log ind</Button>
          </Link>
          <Link to="/customer/register" onClick={() => setMobileOpen(false)}>
            <Button className="w-full">Kom i gang</Button>
          </Link>
        </div>
      )}
    </header>
  );
};

export default Header;
