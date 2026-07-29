/** Formatting helpers for the public provider profile. All input is DB data. */
import type { PublicProviderService } from "./types";

const SERVICE_LABELS: Record<string, string> = {
  cleaning: "Standardrengøring",
  standard_cleaning: "Standardrengøring",
  deep_cleaning: "Hovedrengøring",
  moveout_cleaning: "Flytterengøring",
  move_out: "Flytterengøring",
  office_cleaning: "Erhvervsrengøring",
  window_cleaning: "Vinduespudsning",
  ironing: "Strygning",
  laundry: "Vasketøj",
  handyman: "Handyman",
  garden: "Havearbejde",
  moving: "Flyttehjælp",
};

export function serviceLabel(code: string): string {
  return (
    SERVICE_LABELS[code] ??
    code.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

const LANGUAGE_LABELS: Record<string, string> = {
  da: "Dansk", en: "Engelsk", sv: "Svensk", no: "Norsk", de: "Tysk",
  es: "Spansk", fr: "Fransk", pl: "Polsk", ro: "Rumænsk", ar: "Arabisk",
};

export function languageLabel(code: string): string {
  const k = code.toLowerCase();
  return LANGUAGE_LABELS[k] ?? code;
}

export function formatMoney(amountMinor: number, currency: string, locale = "da-DK"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor / 100);
  } catch {
    return `${Math.round(amountMinor / 100)} ${currency}`;
  }
}

export function servicePriceLabel(s: PublicProviderService, locale = "da-DK"): string {
  const money = formatMoney(s.amount_minor, s.currency, locale);
  return s.unit === "job" ? `Fra ${money}` : `${money}/time`;
}

export function formatDistance(km: number | null): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.max(0.1, Math.round(km * 10) / 10)} km væk`;
  return `${km < 10 ? (Math.round(km * 10) / 10).toFixed(1) : Math.round(km)} km væk`;
}

export function formatPeriod(from: string | null, to: string | null, current: boolean | null): string {
  const y = (d: string | null) => (d ? new Date(d).getFullYear() : null);
  const a = y(from);
  const b = current ? "nu" : y(to);
  if (!a && !b) return "";
  return `${a ?? "?"}–${b ?? "?"}`;
}
