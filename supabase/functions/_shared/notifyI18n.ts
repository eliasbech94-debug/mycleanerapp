// Locale-aware notification copy for server-side notifications.
// Language resolution: profiles.ui_language -> supported list -> "en" fallback.
// Templates keep structured variables so historical notifications stay intact:
// rendered text is stored at send time, variables are stored in payload.

/** Minimal structural client type so this module stays runtime/test portable. */
type MinimalClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
  };
};

export const NOTIFY_LANGS = ["en", "da", "sv", "de", "es"] as const;
export type NotifyLang = (typeof NOTIFY_LANGS)[number];
export const NOTIFY_FALLBACK_LANG: NotifyLang = "en";

const INTL_LOCALE: Record<NotifyLang, string> = {
  en: "en-GB",
  da: "da-DK",
  sv: "sv-SE",
  de: "de-DE",
  es: "es-ES",
};

export function normalizeLang(input?: string | null): NotifyLang {
  if (!input) return NOTIFY_FALLBACK_LANG;
  const base = String(input).toLowerCase().split(/[-_]/)[0];
  return (NOTIFY_LANGS as readonly string[]).includes(base)
    ? (base as NotifyLang)
    : NOTIFY_FALLBACK_LANG;
}

export async function resolveUserLang(
  admin: MinimalClient,
  userId: string,
): Promise<NotifyLang> {
  try {
    const { data } = await admin
      .from("profiles")
      .select("ui_language")
      .eq("id", userId)
      .maybeSingle();
    return normalizeLang((data as { ui_language?: string | null } | null)?.ui_language);
  } catch {
    return NOTIFY_FALLBACK_LANG;
  }
}

/* ---------------------------------- format --------------------------------- */

export function formatMoneyMinor(
  minor: number,
  currency: string,
  lang: NotifyLang,
): string {
  const cur = (currency || "DKK").toUpperCase();
  try {
    return new Intl.NumberFormat(INTL_LOCALE[lang], {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${cur}`;
  }
}

export function formatDate(iso: string | null | undefined, lang: NotifyLang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[lang], { dateStyle: "long" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatDateTime(iso: string | null | undefined, lang: NotifyLang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
      dateStyle: "long",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/* --------------------------------- catalog --------------------------------- */

type Template = { subject: string; body: string };
type LangPack = Record<NotifyLang, Template>;

export const NOTIFY_TEMPLATES: Record<string, LangPack> = {
  "booking.cancelled": {
    en: { subject: "Booking {{ref}} cancelled", body: "Your booking of {{service}} has been cancelled by {{actor}}." },
    da: { subject: "Booking {{ref}} annulleret", body: "Din booking af {{service}} er annulleret af {{actor}}." },
    sv: { subject: "Bokning {{ref}} avbokad", body: "Din bokning av {{service}} har avbokats av {{actor}}." },
    de: { subject: "Buchung {{ref}} storniert", body: "Deine Buchung von {{service}} wurde von {{actor}} storniert." },
    es: { subject: "Reserva {{ref}} cancelada", body: "Tu reserva de {{service}} ha sido cancelada por {{actor}}." },
  },
  "booking.cancelled.provider": {
    en: { subject: "Booking {{ref}} cancelled", body: "The booking of {{service}} on {{date}} has been cancelled by {{actor}}." },
    da: { subject: "Booking {{ref}} annulleret", body: "Bookingen af {{service}} den {{date}} er annulleret af {{actor}}." },
    sv: { subject: "Bokning {{ref}} avbokad", body: "Bokningen av {{service}} den {{date}} har avbokats av {{actor}}." },
    de: { subject: "Buchung {{ref}} storniert", body: "Die Buchung von {{service}} am {{date}} wurde von {{actor}} storniert." },
    es: { subject: "Reserva {{ref}} cancelada", body: "La reserva de {{service}} del {{date}} ha sido cancelada por {{actor}}." },
  },
  "refund.initiated": {
    en: { subject: "Refund started", body: "We have started a refund of {{amount}}. The money is back on your card within 5-10 business days." },
    da: { subject: "Refundering igangsat", body: "Vi har igangsat en refundering på {{amount}}. Beløbet er tilbage på kortet inden for 5-10 hverdage." },
    sv: { subject: "Återbetalning påbörjad", body: "Vi har påbörjat en återbetalning på {{amount}}. Pengarna är tillbaka på kortet inom 5-10 bankdagar." },
    de: { subject: "Rückerstattung eingeleitet", body: "Wir haben eine Rückerstattung von {{amount}} eingeleitet. Der Betrag ist innerhalb von 5-10 Werktagen zurück auf deiner Karte." },
    es: { subject: "Reembolso iniciado", body: "Hemos iniciado un reembolso de {{amount}}. El importe volverá a tu tarjeta en 5-10 días laborables." },
  },
  "refund.completed": {
    en: { subject: "Refund completed", body: "Your refund of {{amount}} has been completed." },
    da: { subject: "Refundering gennemført", body: "Din refundering på {{amount}} er gennemført." },
    sv: { subject: "Återbetalning genomförd", body: "Din återbetalning på {{amount}} är genomförd." },
    de: { subject: "Rückerstattung abgeschlossen", body: "Deine Rückerstattung von {{amount}} wurde abgeschlossen." },
    es: { subject: "Reembolso completado", body: "Tu reembolso de {{amount}} se ha completado." },
  },
  "refund.completed.provider": {
    en: { subject: "Refund completed", body: "A refund of {{amount}} has been completed for booking {{ref}}." },
    da: { subject: "Refundering gennemført", body: "En refundering på {{amount}} er gennemført for booking {{ref}}." },
    sv: { subject: "Återbetalning genomförd", body: "En återbetalning på {{amount}} har genomförts för bokning {{ref}}." },
    de: { subject: "Rückerstattung abgeschlossen", body: "Eine Rückerstattung von {{amount}} wurde für Buchung {{ref}} abgeschlossen." },
    es: { subject: "Reembolso completado", body: "Se ha completado un reembolso de {{amount}} para la reserva {{ref}}." },
  },
  "credit_note.available": {
    en: { subject: "Credit note {{number}} available", body: "A credit note for booking {{ref}} is ready to download." },
    da: { subject: "Kreditnota {{number}} tilgængelig", body: "En kreditnota for booking {{ref}} er nu klar til download." },
    sv: { subject: "Kreditnota {{number}} tillgänglig", body: "En kreditnota för bokning {{ref}} är klar att ladda ner." },
    de: { subject: "Gutschrift {{number}} verfügbar", body: "Eine Gutschrift für Buchung {{ref}} steht zum Download bereit." },
    es: { subject: "Nota de crédito {{number}} disponible", body: "La nota de crédito de la reserva {{ref}} está lista para descargar." },
  },
  "credit_note.issued.provider": {
    en: { subject: "Credit note {{number}} issued", body: "MyCleaner has issued a credit note for the platform fee on booking {{ref}}." },
    da: { subject: "Kreditnota {{number}} udstedt", body: "MyCleaner har udstedt en kreditnota for platformgebyret på booking {{ref}}." },
    sv: { subject: "Kreditnota {{number}} utfärdad", body: "MyCleaner har utfärdat en kreditnota för plattformsavgiften på bokning {{ref}}." },
    de: { subject: "Gutschrift {{number}} ausgestellt", body: "MyCleaner hat eine Gutschrift für die Plattformgebühr der Buchung {{ref}} ausgestellt." },
    es: { subject: "Nota de crédito {{number}} emitida", body: "MyCleaner ha emitido una nota de crédito por la comisión de la plataforma en la reserva {{ref}}." },
  },
  "settlement.adjusted": {
    en: { subject: "Settlement adjusted", body: "Your settlement for booking {{ref}} has been adjusted following the refund." },
    da: { subject: "Afregning justeret", body: "Din afregning for booking {{ref}} er justeret som følge af refunderingen." },
    sv: { subject: "Avräkning justerad", body: "Din avräkning för bokning {{ref}} har justerats till följd av återbetalningen." },
    de: { subject: "Abrechnung angepasst", body: "Deine Abrechnung für Buchung {{ref}} wurde aufgrund der Rückerstattung angepasst." },
    es: { subject: "Liquidación ajustada", body: "Tu liquidación de la reserva {{ref}} se ha ajustado tras el reembolso." },
  },
  "dispute.opened.provider": {
    en: { subject: "New payment dispute (chargeback)", body: "A customer has opened a payment dispute of {{amount}}. Submit your documentation before the deadline." },
    da: { subject: "Ny betalingsindsigelse (chargeback)", body: "En kunde har åbnet en betalingsindsigelse på {{amount}}. Send dokumentation inden fristen." },
    sv: { subject: "Ny betalningstvist (chargeback)", body: "En kund har öppnat en betalningstvist på {{amount}}. Skicka in dokumentation före deadline." },
    de: { subject: "Neue Zahlungsreklamation (Chargeback)", body: "Ein Kunde hat eine Zahlungsreklamation über {{amount}} eröffnet. Reiche deine Nachweise vor Ablauf der Frist ein." },
    es: { subject: "Nueva disputa de pago (contracargo)", body: "Un cliente ha abierto una disputa de pago de {{amount}}. Envía la documentación antes de la fecha límite." },
  },
  "dispute.resolved.provider.won": {
    en: { subject: "Case closed: won", body: "The payment dispute was decided in your favour." },
    da: { subject: "Sagen er afsluttet: vundet", body: "Betalingsindsigelsen blev afgjort til din fordel." },
    sv: { subject: "Ärendet är avslutat: vunnet", body: "Betalningstvisten avgjordes till din fördel." },
    de: { subject: "Fall abgeschlossen: gewonnen", body: "Die Zahlungsreklamation wurde zu deinen Gunsten entschieden." },
    es: { subject: "Caso cerrado: ganado", body: "La disputa de pago se resolvió a tu favor." },
  },
  "dispute.resolved.provider.lost": {
    en: { subject: "Case closed: lost", body: "The payment dispute was decided against you. The amount has been withdrawn." },
    da: { subject: "Sagen er afsluttet: tabt", body: "Betalingsindsigelsen blev afgjort imod dig. Beløbet er trukket tilbage." },
    sv: { subject: "Ärendet är avslutat: förlorat", body: "Betalningstvisten avgjordes emot dig. Beloppet har dragits tillbaka." },
    de: { subject: "Fall abgeschlossen: verloren", body: "Die Zahlungsreklamation wurde gegen dich entschieden. Der Betrag wurde zurückgebucht." },
    es: { subject: "Caso cerrado: perdido", body: "La disputa de pago se resolvió en tu contra. El importe ha sido retirado." },
  },
  "dispute.evidence_required": {
    en: { subject: "Documentation required before {{deadline}}", body: "You must submit documentation for dispute {{disputeId}} before {{deadline}}." },
    da: { subject: "Dokumentation kræves inden {{deadline}}", body: "Du skal indsende dokumentation til indsigelse {{disputeId}} inden {{deadline}}." },
    sv: { subject: "Dokumentation krävs före {{deadline}}", body: "Du måste skicka in dokumentation för tvist {{disputeId}} före {{deadline}}." },
    de: { subject: "Nachweise erforderlich bis {{deadline}}", body: "Du musst Nachweise für die Reklamation {{disputeId}} bis {{deadline}} einreichen." },
    es: { subject: "Documentación necesaria antes del {{deadline}}", body: "Debes enviar la documentación de la disputa {{disputeId}} antes del {{deadline}}." },
  },
  "dispute.evidence_required.critical": {
    en: { subject: "Critical: documentation missing (<24h)", body: "You must submit documentation for dispute {{disputeId}} before {{deadline}}." },
    da: { subject: "Kritisk: dokumentation mangler (<24t)", body: "Du skal indsende dokumentation til indsigelse {{disputeId}} inden {{deadline}}." },
    sv: { subject: "Kritiskt: dokumentation saknas (<24 h)", body: "Du måste skicka in dokumentation för tvist {{disputeId}} före {{deadline}}." },
    de: { subject: "Kritisch: Nachweise fehlen (<24 Std.)", body: "Du musst Nachweise für die Reklamation {{disputeId}} bis {{deadline}} einreichen." },
    es: { subject: "Crítico: falta documentación (<24 h)", body: "Debes enviar la documentación de la disputa {{disputeId}} antes del {{deadline}}." },
  },
  "provider.suspend": {
    en: { subject: "Your profile has been suspended", body: "{{reason}}" },
    da: { subject: "Din profil er suspenderet", body: "{{reason}}" },
    sv: { subject: "Din profil har stängts av", body: "{{reason}}" },
    de: { subject: "Dein Profil wurde gesperrt", body: "{{reason}}" },
    es: { subject: "Tu perfil ha sido suspendido", body: "{{reason}}" },
  },
  "provider.reject": {
    en: { subject: "Your application was not approved", body: "{{reason}}" },
    da: { subject: "Din ansøgning er afvist", body: "{{reason}}" },
    sv: { subject: "Din ansökan godkändes inte", body: "{{reason}}" },
    de: { subject: "Deine Bewerbung wurde abgelehnt", body: "{{reason}}" },
    es: { subject: "Tu solicitud no ha sido aprobada", body: "{{reason}}" },
  },
  "provider.archive": {
    en: { subject: "Your profile has been archived", body: "{{reason}}" },
    da: { subject: "Din profil er arkiveret", body: "{{reason}}" },
    sv: { subject: "Din profil har arkiverats", body: "{{reason}}" },
    de: { subject: "Dein Profil wurde archiviert", body: "{{reason}}" },
    es: { subject: "Tu perfil ha sido archivado", body: "{{reason}}" },
  },
  "provider.freeze_payout": {
    en: { subject: "Your payouts are on hold", body: "{{reason}}" },
    da: { subject: "Dine udbetalinger er sat på hold", body: "{{reason}}" },
    sv: { subject: "Dina utbetalningar är pausade", body: "{{reason}}" },
    de: { subject: "Deine Auszahlungen sind vorübergehend gesperrt", body: "{{reason}}" },
    es: { subject: "Tus pagos están en espera", body: "{{reason}}" },
  },
  "support.conversation.escalated": {
    en: { subject: "Case escalated to an administrator", body: 'Case "{{subjectText}}" has been escalated. Reason: {{reason}}' },
    da: { subject: "Sag eskaleret til administrator", body: 'Sag "{{subjectText}}" er eskaleret. Årsag: {{reason}}' },
    sv: { subject: "Ärendet har eskalerats till en administratör", body: 'Ärendet "{{subjectText}}" har eskalerats. Orsak: {{reason}}' },
    de: { subject: "Fall an einen Administrator eskaliert", body: 'Der Fall "{{subjectText}}" wurde eskaliert. Grund: {{reason}}' },
    es: { subject: "Caso escalado a un administrador", body: 'El caso "{{subjectText}}" ha sido escalado. Motivo: {{reason}}' },
  },
};

export function interpolate(text: string, vars: Record<string, unknown> = {}): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Renders subject/body for an event in the recipient's language.
 * Returns null when the event has no catalog entry (caller keeps its literal copy).
 */
export function renderNotification(
  eventType: string,
  lang: NotifyLang,
  vars: Record<string, unknown> = {},
): Template | null {
  const pack = NOTIFY_TEMPLATES[eventType];
  if (!pack) return null;
  const tpl = pack[lang] ?? pack[NOTIFY_FALLBACK_LANG];
  if (!tpl) return null;
  return {
    subject: interpolate(tpl.subject, vars),
    body: interpolate(tpl.body, vars),
  };
}
