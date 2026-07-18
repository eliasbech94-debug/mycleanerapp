// Money is always integer minor units in storage; formatting NEVER mutates
// the stored value. No FX conversion. Booking currency is immutable.
export type MinorUnits = number;

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND"]); // future expansion

export function minorDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** Format integer minor units in the given locale/currency. Read-only. */
export function formatMoney(minor: MinorUnits, currency: string, locale = "da-DK"): string {
  const d = minorDecimals(currency);
  const value = minor / Math.pow(10, d);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(value);
}

/** Round half-away-from-zero — VAT calculations must use this consistently. */
export function roundMinor(x: number): MinorUnits {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

export function formatDate(iso: string | Date, locale = "da-DK", opts?: Intl.DateTimeFormatOptions) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, opts ?? { dateStyle: "medium" }).format(d);
}

export function formatNumber(n: number, locale = "da-DK", opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, opts).format(n);
}
