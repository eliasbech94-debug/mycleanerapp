import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, MessageCircle, HelpCircle, ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { COMPANY, formatCompanyAddress } from "@/config/company";
import { MarketSeo } from "@/components/seo/MarketSeo";

/**
 * Public contact page.
 *
 * All copy is i18n-driven and all legal entity data comes from
 * `@/config/company`. The "chat with support" action routes to the
 * MyCleaner Support Center, where the embedded Crisp chat lives.
 */
const Contact = () => {
  const { t } = useTranslation("common");

  return (
    <main className="relative min-h-screen bg-background">
      <MarketSeo titleKey="seo.contact.title" descriptionKey="seo.contact.description" />
      <div className="max-w-2xl mx-auto px-6 py-12 sm:py-16">

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("contact.backHome")}
        </Link>

        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-foreground">
          {t("contact.title")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">{t("contact.subtitle")}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            to="/help"
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/50 hover:bg-secondary transition-colors"
          >
            <MessageCircle className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">{t("contact.chatTitle")}</span>
            <span className="text-sm text-muted-foreground">{t("contact.chatBody")}</span>
          </Link>

          <a
            href={`mailto:${COMPANY.supportEmail}`}
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-secondary transition-colors"
          >
            <Mail className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">{t("contact.emailTitle")}</span>
            <span className="text-sm text-muted-foreground break-words">
              {t("contact.emailBody", { email: COMPANY.supportEmail })}
            </span>
          </a>

          <Link
            to="/faq"
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-secondary transition-colors sm:col-span-2"
          >
            <HelpCircle className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">{t("contact.faqTitle")}</span>
            <span className="text-sm text-muted-foreground">{t("contact.faqBody")}</span>
          </Link>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium text-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            {t("contact.companyTitle")}
          </h2>
          <address className="not-italic mt-3 text-sm text-muted-foreground leading-relaxed space-y-1">
            <div className="font-medium text-foreground/90">{COMPANY.legalName}</div>
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
            <div>
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {COMPANY.supportEmail}
              </a>
            </div>
          </address>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-secondary/40 p-5">
          <h2 className="flex items-center gap-2 font-medium text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {t("contact.securityTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {t("contact.securityBody")}
          </p>
        </section>
      </div>
    </main>
  );
};

export default Contact;
