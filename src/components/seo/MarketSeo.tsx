/**
 * Applies the market-aware SEO tag set to <head>.
 *
 * Classic SPA: this mutates document.head after hydration, so JS-executing
 * crawlers see per-route metadata while index.html carries the static
 * sitewide fallback for social-preview crawlers.
 *
 * Indexability is SERVER-DRIVEN: only markets reported bookable by
 * `market_launch_status` are passed to buildSeoTags, so a coming-soon market
 * can never be indexed on a page that promises booking.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCountry, type CountryISO } from "@/i18n/CountryContext";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { buildSeoTags, stripCountryPrefix, type SeoTag } from "@/i18n/seo";
import type { SupportedLanguage } from "@/i18n";

const MANAGED = "data-mc-seo";

function applyTags(tags: SeoTag[]) {
  const head = document.head;
  head.querySelectorAll(`[${MANAGED}]`).forEach((n) => n.remove());

  for (const t of tags) {
    if (t.tag === "title") {
      if (t.text) document.title = t.text;
      continue;
    }
    // A per-route tag must replace, not duplicate, the static index.html one.
    if (t.tag === "meta") {
      const key = t.attrs.name ? `meta[name="${t.attrs.name}"]` : `meta[property="${t.attrs.property}"]`;
      head.querySelectorAll(key).forEach((n) => n.remove());
    }
    if (t.tag === "link" && t.attrs.rel === "canonical") {
      head.querySelectorAll('link[rel="canonical"]').forEach((n) => n.remove());
    }
    const el = document.createElement(t.tag);
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    if (t.text) el.textContent = t.text;
    el.setAttribute(MANAGED, "true");
    head.appendChild(el);
  }
}

export interface MarketSeoProps {
  /** i18n key for the page title, resolved in the `seo` section of common. */
  titleKey?: string;
  descriptionKey?: string;
  /** Literal overrides (already localised). */
  title?: string;
  description?: string;
  jsonLd?: Record<string, unknown> | null;
}

export function MarketSeo({ titleKey, descriptionKey, title, description, jsonLd }: MarketSeoProps) {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation("common");
  const { countries, country } = useCountry();
  const { statuses } = useMarketStatus();

  const resolvedTitle = title ?? (titleKey ? t(titleKey) : t("seo.default.title"));
  const resolvedDescription =
    description ?? (descriptionKey ? t(descriptionKey) : t("seo.default.description"));

  useEffect(() => {
    const bookable = countries.filter((c) => statuses[c.iso]?.bookable === true);
    const { iso: urlIso } = stripCountryPrefix(pathname);
    const currentIso = (urlIso ?? country?.iso ?? null) as CountryISO | null;

    applyTags(
      buildSeoTags({
        path: pathname,
        activeCountries: bookable,
        currentIso,
        currentLang: (i18n.language?.slice(0, 2) ?? "en") as SupportedLanguage,
        title: resolvedTitle,
        description: resolvedDescription,
        jsonLd: jsonLd ?? null,
      }),
    );

    document.documentElement.lang = i18n.language?.slice(0, 2) ?? "en";
  }, [pathname, countries, statuses, country?.iso, i18n.language, resolvedTitle, resolvedDescription, jsonLd]);

  return null;
}

export default MarketSeo;
