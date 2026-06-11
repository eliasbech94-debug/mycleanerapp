import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useUserRoles } from "@/hooks/useUserRoles";
import { ArrowLeft, Home, LayoutDashboard, Briefcase, Store, User } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const { isAdmin, isEmployee, isProvider, loading } = useUserRoles();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const homeRoute = isAdmin ? "/admin" : isEmployee ? "/employee" : isProvider ? "/provider-dashboard" : "/";
  const homeLabel = isAdmin ? "Admin dashboard" : isEmployee ? "Medarbejder dashboard" : isProvider ? "Provider dashboard" : "Forside";
  const HomeIcon = isAdmin ? LayoutDashboard : isEmployee ? Briefcase : isProvider ? Store : Home;
  const roleLabel = isAdmin ? "Administrator" : isEmployee ? "Medarbejder" : isProvider ? "Provider" : "Kunde";

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Decorative background blobs */}
      <div
        className="mesh-blob w-[500px] h-[500px] -top-40 -right-40"
        style={{ background: "hsl(168 65% 38% / 0.12)" }}
      />
      <div
        className="mesh-blob w-[400px] h-[400px] -bottom-32 -left-32"
        style={{ background: "hsl(32 95% 55% / 0.10)" }}
      />

      <div className="relative z-10 max-w-lg mx-auto px-6 text-center">
        {/* 404 Number */}
        <h1
          className="font-heading text-[7rem] leading-none font-bold tracking-tighter text-gradient select-none"
          aria-hidden="true"
        >
          404
        </h1>

        {/* Message */}
        <h2 className="font-heading text-2xl font-semibold text-foreground mt-2">
          Siden blev ikke fundet
        </h2>
        <p className="text-muted-foreground mt-3 max-w-sm mx-auto leading-relaxed">
          Den side du leder efter, findes ikke eller er blevet flyttet.
        </p>

        {/* Role context */}
        {!loading && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm text-secondary-foreground">
            <User className="h-4 w-4 text-primary" />
            <span>
              Logget ind som <strong className="text-foreground">{roleLabel}</strong>
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to={homeRoute}
            className="inline-flex items-center gap-2 rounded-lg gradient-hero px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
          >
            <HomeIcon className="h-4 w-4" />
            {homeLabel}
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <Home className="h-4 w-4" />
            Forside
          </Link>
        </div>

        {/* Back */}
        <button
          onClick={() => history.back()}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Gå tilbage
        </button>
      </div>
    </main>
  );
};

export default NotFound;
