import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { COMPANY, formatCompanyAddress } from "@/config/company";

const DESKTOP_BREAKPOINT = 1024;

/** True below the desktop breakpoint (mobile + tablet). */
function useBelowDesktop() {
  const [below, setBelow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < DESKTOP_BREAKPOINT,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${DESKTOP_BREAKPOINT - 1}px)`);
    const onChange = () => setBelow(window.innerWidth < DESKTOP_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

/**
 * Global website footer.
 *
 * Footer contract (central):
 *  - The footer is NEVER rendered below 1024px (mobile + tablet). The node is
 *    completely removed from the DOM so no space is reserved and
 *    `MobileBottomNav` is the sole permanent bottom navigation.
 *  - On >=1024px (desktop) the footer always renders on public/document routes.
 *  - Every company detail is read from `@/config/company` — never inline
 *    legal-entity data here, and never render unverified numbers.
 *  - Every label goes through i18n; no hardcoded user-facing text.
 *
 * This is the single source of truth for footer visibility. Do NOT add
 * per-page `hidden md:block` overrides or route-specific CSS hacks.
 */
const Footer = () => {
  const hidden = useBelowDesktop();
  const { t } = useTranslation("common");
  if (hidden) return null;

  return (
    <footer
      className="border-t border-border bg-secondary/50"
      // Reserves room for any fixed mobile CTA bar (0px when none is mounted).
      style={{ paddingBottom: "var(--provider-mobile-cta-height, 0px)" }}
    >
      <div className="container-wide section-padding">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4" aria-label={COMPANY.tradingName}>
              <img src="/mycleaner-logo.png" alt="" className="h-8 w-8 object-contain" />
              <span className="font-heading font-bold text-lg">{COMPANY.tradingName}</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("footer.tagline")}</p>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">{t("footer.platform")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/find-cleaner" className="hover:text-foreground transition-colors">{t("footer.findCleaner")}</Link></li>
              <li><Link to="/faq" className="hover:text-foreground transition-colors">{t("footer.howItWorks")}</Link></li>
              <li><Link to="/regler" className="hover:text-foreground transition-colors">{t("footer.rules")}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">{t("footer.forProviders")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/provider/register" className="hover:text-foreground transition-colors">{t("footer.becomeProvider")}</Link></li>
              <li><Link to="/provider-dashboard" className="hover:text-foreground transition-colors">{t("footer.providerDashboard")}</Link></li>
              <li><Link to="/provider/bilag" className="hover:text-foreground transition-colors">{t("footer.receipts")}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">{t("footer.support")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/faq" className="hover:text-foreground transition-colors">{t("footer.faq")}</Link></li>
              <li><Link to="/regler" className="hover:text-foreground transition-colors">{t("footer.rules")}</Link></li>
              <li><Link to="/kontakt" className="hover:text-foreground transition-colors">{t("footer.contact")}</Link></li>
              <li>
                <a href={`mailto:${COMPANY.supportEmail}`} className="hover:text-foreground transition-colors">
                  {COMPANY.supportEmail}
                </a>
              </li>
              <li><Link to="/legal" className="hover:text-foreground transition-colors">{t("footer.legalCenter")}</Link></li>
              <li><Link to="/legal/privacy-policy" className="hover:text-foreground transition-colors">{t("footer.privacy")}</Link></li>
              <li><Link to="/legal/cookie-policy" className="hover:text-foreground transition-colors">{t("footer.cookies")}</Link></li>
            </ul>
          </div>
        </div>

        {/* Verified legal entity block — company config is the only source. */}
        <div className="mt-12 pt-8 border-t border-border">
          <h4 className="font-heading font-semibold mb-3 text-sm">{t("footer.company")}</h4>
          <address className="not-italic text-xs text-muted-foreground leading-relaxed space-y-1">
            <div className="font-medium text-foreground/80">{COMPANY.legalName}</div>
            <div>{t("footer.companyNumber", { number: COMPANY.companyNumber })}</div>
            <div>{formatCompanyAddress()}</div>
            <div>{t("footer.registeredIn")}</div>
            <div>
              <a
                href={COMPANY.registryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {t("footer.companiesHouse")}
              </a>
            </div>
          </address>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">
            {t("footer.rights", { year: new Date().getFullYear(), name: COMPANY.tradingName })}
          </p>
          <p className="text-xs text-muted-foreground text-center md:text-right max-w-md">
            {t("footer.marketsNotice")}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
