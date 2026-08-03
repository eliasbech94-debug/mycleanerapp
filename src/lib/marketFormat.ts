/**
 * Market-aware formatting layer.
 *
 * Rules enforced here (Launch Market / i18n audit):
 *  - `market_country`, `language`, `currency` and `price` are SEPARATE axes.
 *    Formatting resolves locale from (market, language) — never from a single
 *    global "da-DK" default.
 *  - The frontend NEVER converts money and NEVER picks a currency. The
 *    currency always arrives with the amount from the server. `formatMarketMoney`
 *    refuses to render an amount whose currency contradicts the market's
 *    server-provided currency.
 *  - Money is always integer minor units in transit and storage.
 *
 * VAT labels, postcode and phone formatting are per-market presentation
 * concerns only; they never change an amount.
 */

import { minorDecimals, type MinorUnits } from "@/i18n/money";
import { normalizeCountryCode } from "@/lib/marketStatus";

export type MarketCode = "DK" | "SE" | "GB" | "DE" | "ES";

export interface MarketFormatProfile {
  code: MarketCode;
  /** Default UI language for the market (may be overridden by the user). */
  defaultLanguage: string;
  /** Locales allowed for this market, keyed by language. */
  locales: Record<string, string>;
  /** Expected ISO-4217 currency. Used only to detect server/client mismatch. */
  currency: string;
  timezone: string;
  /** Local VAT designation shown in price breakdowns. */
  vatLabel: string;
  /** Postcode display: digit/letter mask hint + normaliser. */
  postcode: { example: string; pattern: RegExp; format: (raw: string) => string };
  phone: { dialCode: string; example: string };
}

const dkPost = (raw: string) => raw.replace(/\D/g, "").slice(0, 4);
const sePost = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 5);
  return d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
};
const numericPost = (len: number) => (raw: string) => raw.replace(/\D/g, "").slice(0, len);
const gbPost = (raw: string) => {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return s.length > 3 ? `${s.slice(0, s.length - 3)} ${s.slice(-3)}` : s;
};

export const MARKET_FORMATS: Record<MarketCode, MarketFormatProfile> = {
  DK: {
    code: "DK",
    defaultLanguage: "da",
    locales: { da: "da-DK", en: "en-DK" },
    currency: "DKK",
    timezone: "Europe/Copenhagen",
    vatLabel: "moms",
    postcode: { example: "2100", pattern: /^\d{4}$/, format: dkPost },
    phone: { dialCode: "+45", example: "+45 12 34 56 78" },
  },
  SE: {
    code: "SE",
    defaultLanguage: "sv",
    locales: { sv: "sv-SE", en: "en-SE" },
    currency: "SEK",
    timezone: "Europe/Stockholm",
    vatLabel: "moms",
    postcode: { example: "113 30", pattern: /^\d{3} ?\d{2}$/, format: sePost },
    phone: { dialCode: "+46", example: "+46 70 123 45 67" },
  },
  GB: {
    code: "GB",
    defaultLanguage: "en",
    locales: { en: "en-GB" },
    currency: "GBP",
    timezone: "Europe/London",
    vatLabel: "VAT",
    postcode: { example: "EC1R 5HL", pattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, format: gbPost },
    phone: { dialCode: "+44", example: "+44 20 7123 4567" },
  },
  DE: {
    code: "DE",
    defaultLanguage: "de",
    locales: { de: "de-DE", en: "en-DE" },
    currency: "EUR",
    timezone: "Europe/Berlin",
    vatLabel: "MwSt.",
    postcode: { example: "10115", pattern: /^\d{5}$/, format: numericPost(5) },
    phone: { dialCode: "+49", example: "+49 30 123456" },
  },
  ES: {
    code: "ES",
    defaultLanguage: "es",
    locales: { es: "es-ES", en: "en-ES" },
    currency: "EUR",
    timezone: "Europe/Madrid",
    vatLabel: "IVA",
    postcode: { example: "28013", pattern: /^\d{5}$/, format: numericPost(5) },
    phone: { dialCode: "+34", example: "+34 600 123 456" },
  },
};

export function marketFormat(code?: string | null): MarketFormatProfile | null {
  const c = normalizeCountryCode(code);
  return c && c in MARKET_FORMATS ? MARKET_FORMATS[c as MarketCode] : null;
}

/**
 * Resolve the BCP-47 locale for a (market, language) pair.
 * Falls back to the market's default language, never to another market.
 */
export function resolveLocale(market?: string | null, language?: string | null): string {
  const p = marketFormat(market);
  if (!p) return language ? `${language}` : "en";
  const lang = language && p.locales[language] ? language : p.defaultLanguage;
  return p.locales[lang] ?? p.locales[p.defaultLanguage];
}

export class CurrencyMismatchError extends Error {
  constructor(market: string, expected: string, got: string) {
    super(`Currency mismatch for market ${market}: expected ${expected}, got ${got}`);
    this.name = "CurrencyMismatchError";
  }
}

/**
 * Format server-provided minor units. `currency` MUST come from the same
 * server payload as `minor` — this function never selects or converts one.
 */
export function formatMarketMoney(input: {
  minor: MinorUnits;
  currency: string;
  market?: string | null;
  language?: string | null;
}): string {
  const { minor, market, language } = input;
  const currency = String(input.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`formatMarketMoney: missing server currency (got "${input.currency}")`);
  }
  const profile = marketFormat(market);
  if (profile && profile.currency !== currency) {
    throw new CurrencyMismatchError(profile.code, profile.currency, currency);
  }
  const d = minorDecimals(currency);
  return new Intl.NumberFormat(resolveLocale(market, language), {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(minor / 10 ** d);
}

export function formatMarketNumber(
  n: number,
  market?: string | null,
  language?: string | null,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(resolveLocale(market, language), opts).format(n);
}

export function formatMarketDate(
  value: string | number | Date,
  market?: string | null,
  language?: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const p = marketFormat(market);
  return new Intl.DateTimeFormat(resolveLocale(market, language), {
    dateStyle: "medium",
    timeZone: p?.timezone,
    ...opts,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatMarketTime(
  value: string | number | Date,
  market?: string | null,
  language?: string | null,
): string {
  const p = marketFormat(market);
  return new Intl.DateTimeFormat(resolveLocale(market, language), {
    timeStyle: "short",
    timeZone: p?.timezone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** Local VAT designation, e.g. "moms" (DK/SE), "MwSt." (DE), "IVA" (ES), "VAT" (GB). */
export function vatLabel(market?: string | null): string {
  return marketFormat(market)?.vatLabel ?? "VAT";
}

export function formatPostcode(raw: string, market?: string | null): string {
  const p = marketFormat(market);
  return p ? p.postcode.format(raw) : raw.trim();
}

export function isValidPostcode(raw: string, market?: string | null): boolean {
  const p = marketFormat(market);
  if (!p) return false;
  return p.postcode.pattern.test(raw.trim());
}

/** Display-only phone formatting; never used for validation of stored numbers. */
export function formatPhone(raw: string, market?: string | null): string {
  const p = marketFormat(market);
  const digits = raw.replace(/[^\d+]/g, "");
  if (!p) return digits;
  if (digits.startsWith("+")) return digits;
  return `${p.phone.dialCode}${digits.replace(/^0+/, "")}`;
}

/** Address line order differs per market; used by address rendering. */
export function formatAddressLines(input: {
  street: string;
  postcode: string;
  city: string;
  market?: string | null;
}): string[] {
  const { street, city, market } = input;
  const postcode = formatPostcode(input.postcode, market);
  const code = normalizeCountryCode(market);
  // GB puts the postcode on its own line after the city; the rest of our
  // markets use "postcode city".
  if (code === "GB") return [street, city, postcode].filter(Boolean);
  return [street, `${postcode} ${city}`.trim()].filter(Boolean);
}
