/**
 * Canonical marketplace definitions.
 * Single source of truth for country/market metadata used everywhere on the
 * homepage: country strip, provider queries, Europe map, live feed, metrics,
 * currency and locale formatting.
 *
 * Never inline city names, currencies or prices in UI components — derive
 * everything from the active Market resolved via ActiveMarketContext.
 */

export type Market = {
  code: string;         // ISO-3166 alpha-2
  label: string;        // English display name
  flag: string;         // emoji flag
  currency: string;     // ISO-4217
  sym: string;          // short display suffix e.g. "kr./h", "€/h"
  city: string;         // canonical primary city
  cities: string[];     // additional cities for demo/live activity
  locale: string;       // BCP-47 locale used for formatting
  timezone: string;
};

export const MARKETS: Market[] = [
  { code: "DK", label: "Denmark",        flag: "🇩🇰", currency: "DKK", sym: "kr./h", city: "København", cities: ["København","Aarhus","Odense","Aalborg","Esbjerg"],   locale: "da-DK", timezone: "Europe/Copenhagen" },
  { code: "SE", label: "Sweden",         flag: "🇸🇪", currency: "SEK", sym: "kr./h", city: "Stockholm", cities: ["Stockholm","Göteborg","Malmö","Uppsala","Västerås"], locale: "sv-SE", timezone: "Europe/Stockholm" },
  { code: "DE", label: "Germany",        flag: "🇩🇪", currency: "EUR", sym: "€/h",   city: "Berlin",    cities: ["Berlin","München","Hamburg","Köln","Frankfurt"],   locale: "de-DE", timezone: "Europe/Berlin" },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧", currency: "GBP", sym: "£/h",   city: "London",    cities: ["London","Manchester","Birmingham","Leeds","Bristol"], locale: "en-GB", timezone: "Europe/London" },
  { code: "ES", label: "Spain",          flag: "🇪🇸", currency: "EUR", sym: "€/h",   city: "Madrid",    cities: ["Madrid","Barcelona","Valencia","Sevilla","Bilbao"],  locale: "es-ES", timezone: "Europe/Madrid" },
  { code: "NL", label: "Netherlands",    flag: "🇳🇱", currency: "EUR", sym: "€/h",   city: "Amsterdam", cities: ["Amsterdam","Rotterdam","Utrecht","Eindhoven","Den Haag"], locale: "nl-NL", timezone: "Europe/Amsterdam" },
  { code: "FR", label: "France",         flag: "🇫🇷", currency: "EUR", sym: "€/h",   city: "Paris",     cities: ["Paris","Lyon","Marseille","Toulouse","Nice"],       locale: "fr-FR", timezone: "Europe/Paris" },
  { code: "IT", label: "Italy",          flag: "🇮🇹", currency: "EUR", sym: "€/h",   city: "Milano",    cities: ["Milano","Roma","Torino","Napoli","Bologna"],        locale: "it-IT", timezone: "Europe/Rome" },
  { code: "NO", label: "Norway",         flag: "🇳🇴", currency: "NOK", sym: "kr./h", city: "Oslo",      cities: ["Oslo","Bergen","Trondheim","Stavanger","Tromsø"],   locale: "nb-NO", timezone: "Europe/Oslo" },
  { code: "BE", label: "Belgium",        flag: "🇧🇪", currency: "EUR", sym: "€/h",   city: "Brussels",  cities: ["Brussels","Antwerp","Ghent","Bruges","Liège"],      locale: "nl-BE", timezone: "Europe/Brussels" },
  { code: "PL", label: "Poland",         flag: "🇵🇱", currency: "PLN", sym: "zł/h",  city: "Warszawa",  cities: ["Warszawa","Kraków","Gdańsk","Wrocław","Poznań"],    locale: "pl-PL", timezone: "Europe/Warsaw" },
  { code: "PT", label: "Portugal",       flag: "🇵🇹", currency: "EUR", sym: "€/h",   city: "Lisboa",    cities: ["Lisboa","Porto","Braga","Coimbra","Faro"],          locale: "pt-PT", timezone: "Europe/Lisbon" },
];

/** Neutral Europe-wide fallback used when no reliable market is known. */
export const NEUTRAL_MARKET: Market = {
  code: "EU",
  label: "Europe",
  flag: "🇪🇺",
  currency: "EUR",
  sym: "€/h",
  city: "Europe",
  cities: MARKETS.map((m) => m.city),
  locale: typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB",
  timezone: "Europe/Brussels",
};

export function marketByCode(code?: string | null): Market | null {
  if (!code) return null;
  const up = code.toUpperCase();
  return MARKETS.find((m) => m.code === up) ?? null;
}

/** Suggest a market from browser locale (weakest signal). Never returns null unless empty. */
export function marketFromLocale(locale?: string): Market | null {
  if (!locale) return null;
  const region = locale.split(/[-_]/)[1]?.toUpperCase();
  return marketByCode(region);
}

/* -------------------------------------------------------------------------- */
/* Formatters — always derived from the active market's locale/currency.      */
/* -------------------------------------------------------------------------- */
export function formatMoney(amount: number, market: Market): string {
  try {
    return new Intl.NumberFormat(market.locale, {
      style: "currency",
      currency: market.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${market.currency}`;
  }
}

export function formatDate(d: Date | number, market: Market): string {
  try {
    return new Intl.DateTimeFormat(market.locale, { dateStyle: "medium" }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

export function formatTime(d: Date | number, market: Market): string {
  try {
    return new Intl.DateTimeFormat(market.locale, { timeStyle: "short" }).format(d);
  } catch {
    return new Date(d).toISOString().slice(11, 16);
  }
}
