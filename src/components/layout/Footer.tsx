import { Link, useLocation } from "react-router-dom";
import { matchesMobileAppRoute } from "@/hooks/useIsMobileApp";

/**
 * Global website footer. Hidden on mobile (<768px) when the current route
 * renders inside `MobileAppShell` — MobileBottomNav is the sole permanent
 * navigation on those surfaces. Tablet and desktop (>=768px) render the
 * footer unchanged.
 *
 * Implementation notes:
 *  - Uses `md:block hidden` scoped through `data-hide-mobile` so tailwind
 *    can strip it at build time. `md:` breakpoint (768px) matches
 *    `MOBILE_APP_BREAKPOINT` in `useIsMobileApp`.
 *  - Only routes that appear in `matchesMobileAppRoute()` trigger the hide
 *    — footer is never hidden globally on ad-hoc mobile routes that do not
 *    use MobileAppShell.
 */
const Footer = () => {
  const { pathname } = useLocation();
  const hideOnMobile = matchesMobileAppRoute(pathname);
  return (
    <footer
      data-hide-mobile={hideOnMobile ? "true" : undefined}
      className={
        "border-t border-border bg-secondary/50 " +
        (hideOnMobile ? "hidden md:block" : "")
      }
    >
      <div className="container-wide section-padding">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4" aria-label="MyCleaner – forside">
              <img src="/mycleaner-logo.png" alt="" className="h-8 w-8 object-contain" />
              <span className="font-heading font-bold text-lg">MyCleaner</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Europas smarteste platform for hjemmeservice. Find de bedste lokale fagfolk til enhver opgave.
            </p>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/find-cleaner" className="hover:text-foreground transition-colors">Find cleaner</Link></li>
              <li><Link to="/faq" className="hover:text-foreground transition-colors">Sådan virker det</Link></li>
              <li><Link to="/regler" className="hover:text-foreground transition-colors">Priser & regler</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">For providere</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/provider/register" className="hover:text-foreground transition-colors">Bliv provider</Link></li>
              <li><Link to="/provider-dashboard" className="hover:text-foreground transition-colors">Provider dashboard</Link></li>
              <li><Link to="/provider/bilag" className="hover:text-foreground transition-colors">Bilag & udgifter</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link></li>
              <li><Link to="/regler" className="hover:text-foreground transition-colors">Regler</Link></li>
              <li><Link to="/faq" className="hover:text-foreground transition-colors">Hjælpecenter</Link></li>
              <li><a href="mailto:support@mycleaner.app" className="hover:text-foreground transition-colors">Kontakt</a></li>
              <li><Link to="/regler" className="hover:text-foreground transition-colors">Privatlivspolitik</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">© 2026 MyCleaner. Alle rettigheder forbeholdes.</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>🇩🇰 🇸🇪 🇳🇴 🇩🇪 🇳🇱 🇫🇷 🇪🇸 🇮🇹 🇬🇧 🇫🇮 🇵🇱 🇦🇹</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
