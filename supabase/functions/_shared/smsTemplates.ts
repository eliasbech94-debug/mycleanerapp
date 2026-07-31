// Central MyCleaner SMS copy layer.
//
// RULES (enforced by tests in src/i18n/smsTemplates.test.ts):
//  - No SMS text may be hardcoded inside an edge function; everything lives here.
//  - Languages: en, da, sv, de, es. Recipient language = profiles.ui_language,
//    English fallback (resolution reused from notifyI18n.ts).
//  - Warm, personal, clear MyCleaner tone.
//  - Max ONE emoji per SMS. No jokes/playful copy in security, payment,
//    complaint/dispute or cancellation messages.
//  - Keep messages short; GSM-7 / Unicode segments are computed here so callers
//    can log or budget delivery cost.
//
// Where a notification already exists in notifyI18n.ts, the SMS body reuses that
// catalogue (renderNotification) instead of introducing conflicting copy.

import {
  formatDate,
  formatDateTime,
  formatMoneyMinor,
  interpolate,
  NOTIFY_FALLBACK_LANG,
  NOTIFY_LANGS,
  type NotifyLang,
  normalizeLang,
  renderNotification,
  resolveUserLang,
} from "./notifyI18n.ts";

export {
  NOTIFY_FALLBACK_LANG as SMS_FALLBACK_LANG,
  NOTIFY_LANGS as SMS_LANGS,
  normalizeLang,
  resolveUserLang,
};
export type SmsLang = NotifyLang;

/* ------------------------------ segmentation ------------------------------ */

// GSM 03.38 basic character set.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Characters that require an escape (count as 2 septets).
const GSM7_EXTENDED = "^{}\\[~]|€";

export type SmsEncoding = "GSM-7" | "UCS-2";

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  /** Billable units: septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  segments: number;
  /** Number of characters (code points), useful for copy review. */
  characters: number;
}

/** Computes GSM-7 vs UCS-2 encoding and the number of SMS segments. */
export function calculateSegments(text: string): SmsSegmentInfo {
  const chars = Array.from(text);
  let gsm = true;
  let units = 0;
  for (const ch of chars) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXTENDED.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }

  if (gsm) {
    const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
    return { encoding: "GSM-7", units, segments, characters: chars.length };
  }

  // UCS-2 is billed per UTF-16 code unit (surrogate pairs count as 2).
  const ucsUnits = text.length;
  const segments = ucsUnits === 0 ? 0 : ucsUnits <= 70 ? 1 : Math.ceil(ucsUnits / 67);
  return { encoding: "UCS-2", units: ucsUnits, segments, characters: chars.length };
}

/* --------------------------------- emoji ---------------------------------- */

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** Counts emoji (pictographic) characters, ignoring variation selectors/ZWJ. */
export function countEmoji(text: string): number {
  return (text.match(EMOJI_RE) ?? []).length;
}

/* -------------------------------- catalogue -------------------------------- */

/**
 * Sensitive categories must never contain jokes or playful copy.
 * Emoji are still allowed at most once and only when they add clarity
 * (e.g. the lock on a verification code).
 */
export type SmsCategory =
  | "security"
  | "payment"
  | "complaint"
  | "cancellation"
  | "operational";

export const SENSITIVE_CATEGORIES: readonly SmsCategory[] = [
  "security",
  "payment",
  "complaint",
  "cancellation",
];

export interface SmsTemplateDef {
  category: SmsCategory;
  /** Optional notifyI18n catalogue key reused for the body (no conflicting copy). */
  reuseNotificationKey?: string;
  text: Record<SmsLang, string>;
}

export const SMS_TEMPLATES: Record<string, SmsTemplateDef> = {
  /* ------------------------------- security ------------------------------- */
  "verification.code": {
    category: "security",
    text: {
      da: "Din MyCleaner-kode er {{code}} 🔐 Den udløber om {{minutes}} minutter.",
      en: "Your MyCleaner code is {{code}} 🔐 It expires in {{minutes}} minutes.",
      sv: "Din MyCleaner-kod är {{code}} 🔐 Den upphör om {{minutes}} minuter.",
      de: "Dein MyCleaner-Code lautet {{code}} 🔐 Er läuft in {{minutes}} Minuten ab.",
      es: "Tu código de MyCleaner es {{code}} 🔐 Caduca en {{minutes}} minutos.",
    },
  },
  "security.password_changed": {
    category: "security",
    text: {
      da: "Din MyCleaner-adgangskode er ændret. Var det ikke dig? Kontakt os med det samme.",
      en: "Your MyCleaner password was changed. Wasn't you? Contact us right away.",
      sv: "Ditt MyCleaner-lösenord har ändrats. Var det inte du? Kontakta oss direkt.",
      de: "Dein MyCleaner-Passwort wurde geändert. Warst du das nicht? Melde dich sofort bei uns.",
      es: "Tu contraseña de MyCleaner ha cambiado. ¿No fuiste tú? Contáctanos enseguida.",
    },
  },

  /* ------------------------------ operational ----------------------------- */
  "booking.confirmed": {
    category: "operational",
    text: {
      da: "Din booking er bekræftet ✅ {{service}} den {{datetime}}. Vi glæder os til at hjælpe dig.",
      en: "Your booking is confirmed ✅ {{service}} on {{datetime}}. We look forward to helping you.",
      sv: "Din bokning är bekräftad ✅ {{service}} den {{datetime}}. Vi ser fram emot att hjälpa dig.",
      de: "Deine Buchung ist bestätigt ✅ {{service}} am {{datetime}}. Wir freuen uns auf dich.",
      es: "Tu reserva está confirmada ✅ {{service}} el {{datetime}}. Estamos deseando ayudarte.",
    },
  },
  "booking.reminder": {
    category: "operational",
    text: {
      da: "Lille påmindelse 👋 {{service}} er på vej til dig {{datetime}}.",
      en: "A quick reminder 👋 {{service}} is coming your way {{datetime}}.",
      sv: "En liten påminnelse 👋 {{service}} kommer till dig {{datetime}}.",
      de: "Kurze Erinnerung 👋 {{service}} kommt zu dir am {{datetime}}.",
      es: "Un recordatorio 👋 {{service}} llegará el {{datetime}}.",
    },
  },
  "booking.provider_on_the_way": {
    category: "operational",
    text: {
      da: "{{name}} er på vej til dig nu 🚗 Vi ses om lidt.",
      en: "{{name}} is on the way to you now 🚗 See you shortly.",
      sv: "{{name}} är på väg till dig nu 🚗 Vi ses snart.",
      de: "{{name}} ist jetzt auf dem Weg zu dir 🚗 Bis gleich.",
      es: "{{name}} ya está de camino 🚗 Nos vemos en un rato.",
    },
  },
  "provider.new_offer": {
    category: "operational",
    text: {
      da: "Ny opgave til dig: {{service}} den {{datetime}}. Åbn MyCleaner for at svare.",
      en: "New job for you: {{service}} on {{datetime}}. Open MyCleaner to reply.",
      sv: "Nytt uppdrag till dig: {{service}} den {{datetime}}. Öppna MyCleaner för att svara.",
      de: "Neuer Auftrag für dich: {{service}} am {{datetime}}. Öffne MyCleaner zum Antworten.",
      es: "Nuevo trabajo para ti: {{service}} el {{datetime}}. Abre MyCleaner para responder.",
    },
  },

  /* ------------------------------ cancellation ---------------------------- */
  "booking.cancelled": {
    category: "cancellation",
    reuseNotificationKey: "booking.cancelled",
    text: {
      da: "Din booking af {{service}} er aflyst af {{actor}}. Se detaljerne i MyCleaner.",
      en: "Your booking of {{service}} has been cancelled by {{actor}}. See the details in MyCleaner.",
      sv: "Din bokning av {{service}} har avbokats av {{actor}}. Se detaljerna i MyCleaner.",
      de: "Deine Buchung von {{service}} wurde von {{actor}} storniert. Details findest du in MyCleaner.",
      es: "Tu reserva de {{service}} ha sido cancelada por {{actor}}. Consulta los detalles en MyCleaner.",
    },
  },
  "booking.cancelled.provider": {
    category: "cancellation",
    reuseNotificationKey: "booking.cancelled.provider",
    text: {
      da: "Bookingen af {{service}} den {{date}} er aflyst af {{actor}}.",
      en: "The booking of {{service}} on {{date}} has been cancelled by {{actor}}.",
      sv: "Bokningen av {{service}} den {{date}} har avbokats av {{actor}}.",
      de: "Die Buchung von {{service}} am {{date}} wurde von {{actor}} storniert.",
      es: "La reserva de {{service}} del {{date}} ha sido cancelada por {{actor}}.",
    },
  },

  /* -------------------------------- payment ------------------------------- */
  "refund.initiated": {
    category: "payment",
    reuseNotificationKey: "refund.initiated",
    text: {
      da: "Vi har igangsat en refundering på {{amount}}. Beløbet er på kortet inden for 5-10 hverdage.",
      en: "We have started a refund of {{amount}}. The money is back on your card within 5-10 business days.",
      sv: "Vi har påbörjat en återbetalning på {{amount}}. Pengarna är tillbaka inom 5-10 bankdagar.",
      de: "Wir haben eine Rückerstattung von {{amount}} eingeleitet. Der Betrag ist in 5-10 Werktagen zurück.",
      es: "Hemos iniciado un reembolso de {{amount}}. Volverá a tu tarjeta en 5-10 días laborables.",
    },
  },
  "refund.completed": {
    category: "payment",
    reuseNotificationKey: "refund.completed",
    text: {
      da: "Din refundering på {{amount}} er gennemført.",
      en: "Your refund of {{amount}} has been completed.",
      sv: "Din återbetalning på {{amount}} är genomförd.",
      de: "Deine Rückerstattung von {{amount}} wurde abgeschlossen.",
      es: "Tu reembolso de {{amount}} se ha completado.",
    },
  },
  "payout.sent": {
    category: "payment",
    text: {
      da: "Din udbetaling på {{amount}} er sendt til din konto.",
      en: "Your payout of {{amount}} is on its way to your account.",
      sv: "Din utbetalning på {{amount}} är på väg till ditt konto.",
      de: "Deine Auszahlung von {{amount}} ist auf dem Weg zu deinem Konto.",
      es: "Tu pago de {{amount}} está en camino a tu cuenta.",
    },
  },

  /* ------------------------------- complaint ------------------------------ */
  "dispute.opened.provider": {
    category: "complaint",
    reuseNotificationKey: "dispute.opened.provider",
    text: {
      da: "Der er åbnet en betalingsindsigelse på {{amount}}. Send din dokumentation inden fristen.",
      en: "A payment dispute of {{amount}} has been opened. Submit your documentation before the deadline.",
      sv: "En betalningstvist på {{amount}} har öppnats. Skicka in din dokumentation före deadline.",
      de: "Eine Zahlungsreklamation über {{amount}} wurde eröffnet. Reiche deine Nachweise fristgerecht ein.",
      es: "Se ha abierto una disputa de pago de {{amount}}. Envía tu documentación antes de la fecha límite.",
    },
  },
  "dispute.evidence_required": {
    category: "complaint",
    reuseNotificationKey: "dispute.evidence_required",
    text: {
      da: "Vigtigt: send dokumentation til sag {{disputeId}} inden {{deadline}}.",
      en: "Important: submit documentation for case {{disputeId}} before {{deadline}}.",
      sv: "Viktigt: skicka in dokumentation för ärende {{disputeId}} före {{deadline}}.",
      de: "Wichtig: Reiche Nachweise für Fall {{disputeId}} bis {{deadline}} ein.",
      es: "Importante: envía la documentación del caso {{disputeId}} antes del {{deadline}}.",
    },
  },
  "support.conversation.escalated": {
    category: "complaint",
    reuseNotificationKey: "support.conversation.escalated",
    text: {
      da: "Din sag er sendt videre til en administrator. Vi vender tilbage hurtigst muligt.",
      en: "Your case has been escalated to an administrator. We will get back to you as soon as possible.",
      sv: "Ditt ärende har eskalerats till en administratör. Vi återkommer så snart vi kan.",
      de: "Dein Fall wurde an eine Administratorin weitergeleitet. Wir melden uns schnellstmöglich.",
      es: "Tu caso se ha derivado a un administrador. Te responderemos lo antes posible.",
    },
  },
};

/* --------------------------------- render --------------------------------- */

/** Locale-sensitive variables, mirrored from notify.ts so callers stay consistent. */
export type SmsVar =
  | string
  | number
  | null
  | undefined
  | { type: "money"; minor: number; currency: string }
  | { type: "date"; iso: string | null }
  | { type: "datetime"; iso: string | null };

export function resolveSmsVars(
  vars: Record<string, SmsVar> | undefined,
  lang: SmsLang,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars ?? {})) {
    if (v && typeof v === "object") {
      if (v.type === "money") out[k] = formatMoneyMinor(v.minor, v.currency, lang);
      else if (v.type === "date") out[k] = formatDate(v.iso, lang);
      else if (v.type === "datetime") out[k] = formatDateTime(v.iso, lang);
    } else {
      out[k] = v ?? "";
    }
  }
  return out;
}

export interface RenderedSms {
  key: string;
  lang: SmsLang;
  category: SmsCategory;
  text: string;
  /** Placeholders that had no value and were rendered as empty strings. */
  missingVars: string[];
  segments: SmsSegmentInfo;
}

function placeholders(template: string): string[] {
  return Array.from(template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1]);
}

/** Collapses whitespace left behind by empty variables so copy stays clean. */
function tidy(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

/**
 * Renders an SMS in the recipient's language.
 * Returns null when the key is unknown so the caller can fall back safely.
 */
export function renderSms(
  key: string,
  lang: string | null | undefined,
  vars: Record<string, SmsVar> = {},
): RenderedSms | null {
  const def = SMS_TEMPLATES[key];
  if (!def) return null;
  const resolvedLang = normalizeLang(lang);
  const template = def.text[resolvedLang] ?? def.text[NOTIFY_FALLBACK_LANG];
  const resolved = resolveSmsVars(vars, resolvedLang);
  const missingVars = placeholders(template).filter(
    (p) => resolved[p] === undefined || resolved[p] === null || resolved[p] === "",
  );
  const text = tidy(interpolate(template, resolved));
  return {
    key,
    lang: resolvedLang,
    category: def.category,
    text,
    missingVars,
    segments: calculateSegments(text),
  };
}

/**
 * Renders SMS copy for a notification event.
 * Prefers the SMS catalogue, then falls back to the shared notifyI18n body so
 * SMS and email/in-app never carry contradicting text.
 */
export function renderSmsForNotification(
  eventOrTemplateKey: string,
  lang: string | null | undefined,
  vars: Record<string, SmsVar> = {},
): RenderedSms | null {
  const direct = renderSms(eventOrTemplateKey, lang, vars);
  if (direct) return direct;

  const resolvedLang = normalizeLang(lang);
  const rendered = renderNotification(
    eventOrTemplateKey,
    resolvedLang,
    resolveSmsVars(vars, resolvedLang),
  );
  if (!rendered) return null;
  const text = tidy(rendered.body);
  return {
    key: eventOrTemplateKey,
    lang: resolvedLang,
    category: "operational",
    text,
    missingVars: [],
    segments: calculateSegments(text),
  };
}
