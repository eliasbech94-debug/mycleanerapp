/**
 * Monthly accounting report — frozen snapshot model and document builder.
 *
 * NOTHING in this file decides a legal outcome. Every number comes from the
 * authoritative backend calculation (`CalculationResult`) and every label,
 * disclaimer and tax term comes from the active rule pack. When no rule pack
 * is published the document says so instead of inventing guidance.
 *
 * The same builder is used by the scheduled PDF generator and by the
 * development preview, so what a provider sees is what the PDF contains.
 */
import { formatMinor } from "./money";
import type { ExternalIncomeInput } from "./externalIncome";
import type {
  AccountingPeriod,
  AccountingRulePack,
  CalculationResult,
  ExpenseInput,
  IncomeInput,
  MileageInput,
  ProviderAccountingProfile,
} from "./types";

export const MONTHLY_REPORT_DOCUMENT_VERSION = "monthly-report-1.0.0";
export const MONTHLY_REPORT_SNAPSHOT_VERSION = "snapshot-1.0.0";

export type MonthlyReportStatus =
  | "scheduled"
  | "generating"
  | "ready"
  | "ready_with_warnings"
  | "failed"
  | "superseded";

export type MonthlyReportKind = "scheduled_month_end" | "provisional";

/** Frozen at generation time. Never recomputed for a historical report. */
export interface MonthlyReportSnapshot {
  snapshotVersion: string;
  generatedAt: string;

  provider: ProviderAccountingProfile;
  providerDisplayName: string;
  myCleanerId: string;

  period: AccountingPeriod;
  reportYear: number;
  reportMonth: number;

  rulePack: AccountingRulePack | null;
  rulePackHash: string | null;
  jurisdictionCode: string | null;
  accountingCurrency: string | null;
  calculationVersion: string;

  result: CalculationResult;

  income: IncomeInput[];
  externalIncome: ExternalIncomeInput[];
  expenses: ExpenseInput[];
  mileage: MileageInput[];

  /** Frozen currency conversions actually used, keyed "FROM>TO". */
  exchangeRates: { pair: string; rate: string; rateDate: string | null; source: string | null }[];
}

export interface MonthlyReportRecord {
  id: string;
  providerId: string;
  reportYear: number;
  reportMonth: number;
  periodStart: string;
  periodEnd: string;
  status: MonthlyReportStatus;
  reportKind: MonthlyReportKind;
  reportVersion: number;
  supersedesReportId: string | null;
  registrationCountry: string | null;
  jurisdictionCode: string | null;
  accountingCurrency: string | null;
  rulePackId: string | null;
  rulePackVersion: string | null;
  calculationVersion: string | null;
  totalIncomeMinor: number | null;
  preliminaryResultMinor: number | null;
  reviewRequiredCount: number;
  pdfFileName: string | null;
  pdfStoragePath: string | null;
  pdfSha256: string | null;
  pdfGeneratedAt: string | null;
  generationErrorCode: string | null;
  generationErrorMessage: string | null;
  isCurrentVersion: boolean;
}

const MONTH_NAMES_DA = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

export function monthLabel(year: number, month: number): string {
  const name = MONTH_NAMES_DA[month - 1] ?? String(month);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** Calendar month period. `month` is 1-12. */
export function monthlyPeriod(year: number, month: number): AccountingPeriod {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    kind: "monthly",
    status: "open",
  };
}

/** A month is only eligible for the official report once it has ended. */
export function isMonthClosed(year: number, month: number, now: Date): boolean {
  const firstOfNextMonth = Date.UTC(year, month, 1);
  return now.getTime() >= firstOfNextMonth;
}

const FILENAME_SAFE = /[^A-Za-z0-9._-]/g;

/** MyCleaner-regnskabsrapport-2026-07-MC-123456.pdf — never any tax number. */
export function buildReportFileName(args: {
  year: number;
  month: number;
  myCleanerId: string;
  version?: number;
}): string {
  const month = String(args.month).padStart(2, "0");
  const id = (args.myCleanerId || "ukendt").replace(FILENAME_SAFE, "-");
  const version = args.version && args.version > 1 ? `-v${args.version}` : "";
  return `MyCleaner-regnskabsrapport-${args.year}-${month}-${id}${version}.pdf`;
}

/** Private storage layout. Bucket is never public. */
export function buildReportStoragePath(args: {
  providerId: string;
  year: number;
  month: number;
  version: number;
}): string {
  const month = String(args.month).padStart(2, "0");
  return `${args.providerId}/${args.year}/${month}/v${args.version}/report.pdf`;
}

export interface AccountingActivity {
  income: unknown[];
  externalIncome: unknown[];
  expenses: unknown[];
  mileage: unknown[];
}

/** §19 — an empty month produces no PDF unless the provider opted in. */
export function shouldGenerateReport(
  activity: AccountingActivity,
  options: { generateEmptyMonths?: boolean } = {},
): boolean {
  if (options.generateEmptyMonths) return true;
  return (
    activity.income.length > 0 ||
    activity.externalIncome.length > 0 ||
    activity.expenses.length > 0 ||
    activity.mileage.length > 0
  );
}

/** Status derives only from the backend result, never from presentation. */
export function deriveReportStatus(result: CalculationResult): MonthlyReportStatus {
  if (result.status === "cannot_calculate") return "failed";
  const attention =
    result.warnings.length +
    result.reviewRequiredItems.length +
    result.reviewRequiredExternalIncomeItems.length +
    result.excludedItems.length;
  return attention > 0 ? "ready_with_warnings" : "ready";
}

export function countAttentionItems(result: CalculationResult): number {
  return (
    result.reviewRequiredItems.length +
    result.reviewRequiredExternalIncomeItems.length +
    result.excludedItems.length +
    result.excludedExternalIncomeItems.length
  );
}

/** A correction never overwrites a PDF — it supersedes it. */
export function buildCorrectionVersion(previous: MonthlyReportRecord): {
  reportVersion: number;
  supersedesReportId: string;
} {
  return { reportVersion: previous.reportVersion + 1, supersedesReportId: previous.id };
}

/** Idempotency key for the scheduled job. Retries must not double-generate. */
export function reportIdempotencyKey(args: {
  providerId: string;
  year: number;
  month: number;
  version: number;
  kind: MonthlyReportKind;
}): string {
  return [args.providerId, args.year, String(args.month).padStart(2, "0"), `v${args.version}`, args.kind].join(":");
}

// ---------------------------------------------------------------------------
// Document model — shared by the PDF renderer and the HTML preview
// ---------------------------------------------------------------------------

export interface ReportCard {
  label: string;
  value: string;
  hint?: string | null;
}

export interface ReportTable {
  columns: string[];
  rows: string[][];
  subtotals?: { label: string; value: string }[];
}

export type ReportSection =
  | { id: string; title: string; kind: "cards"; cards: ReportCard[]; note?: string | null }
  | { id: string; title: string; kind: "keyvalue"; cards: ReportCard[]; note?: string | null }
  | { id: string; title: string; kind: "table"; table: ReportTable; note?: string | null }
  | { id: string; title: string; kind: "list"; items: string[]; note?: string | null }
  | { id: string; title: string; kind: "text"; paragraphs: string[]; note?: string | null };

export interface ReportDocument {
  documentVersion: string;
  fileName: string;
  brandName: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  providerName: string;
  myCleanerId: string;
  generatedAtLabel: string;
  provisional: boolean;
  status: MonthlyReportStatus;
  sections: ReportSection[];
  disclaimer: string[];
  footer: string;
}

const GENERIC_DISCLAIMER = [
  "Denne rapport er en foreløbig regnskabsoversigt baseret på oplysninger, betalinger, bilag og registreringer, der er tilgængelige i MyCleaner.",
  "Rapporten er ikke en automatisk skatte- eller momsindberetning og erstatter ikke rådgivning fra den relevante skattemyndighed, en revisor eller anden kvalificeret rådgiver.",
  "Provideren er ansvarlig for at kontrollere oplysningerne før brug eller indberetning.",
];

const SOURCE_LABELS: Record<string, string> = {
  mycleaner: "MyCleaner",
  other_platform: "Andre platforme",
  own_customer: "Egne kunder",
  invoice: "Fakturaer",
  cash: "Kontant betaling",
  bank_transfer: "Bankoverførsel",
  other: "Andre kilder",
};

function sourceLabel(code: string): string {
  return SOURCE_LABELS[code] ?? code;
}

function formatDate(value: string | null, locale: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || "da-DK", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function buildMonthlyReportDocument(args: {
  snapshot: MonthlyReportSnapshot;
  status?: MonthlyReportStatus;
  kind?: MonthlyReportKind;
  reportVersion?: number;
  supersedesVersion?: number | null;
  integrityHash?: string | null;
}): ReportDocument {
  const { snapshot } = args;
  const { result, rulePack, provider } = snapshot;
  const locale = rulePack?.defaultLocale ?? provider.preferredLocale ?? "da-DK";
  const currency = result.accountingCurrency ?? snapshot.accountingCurrency;
  const money = (minor: number | null) => formatMinor(minor, currency, locale);
  const provisional = (args.kind ?? "scheduled_month_end") === "provisional";
  const version = args.reportVersion ?? 1;
  const status = args.status ?? deriveReportStatus(result);

  const sections: ReportSection[] = [];

  // 5 — front page facts
  sections.push({
    id: "provider",
    title: "Provideroplysninger",
    kind: "keyvalue",
    cards: [
      { label: "Navn", value: snapshot.providerDisplayName },
      { label: "MyCleaner ID", value: snapshot.myCleanerId },
      { label: "Registreringsland", value: provider.registrationCountry ?? "Ikke angivet" },
      { label: "Registreringstype", value: registrationTypeLabel(provider, rulePack) },
      { label: "Regnskabsvaluta", value: currency ?? "Ikke angivet" },
      {
        label: rulePack?.labels.indirectTaxLabel ?? "Indirekte skat",
        value: indirectTaxStatusLabel(provider),
      },
      {
        label: rulePack?.labels.businessRegistrationLabel ?? "Virksomhedsregistrering",
        value: provider.businessRegistrationNumberLast4
          ? `•••• ${provider.businessRegistrationNumberLast4}`
          : "Ikke registreret",
      },
      { label: "Rapport oprettet", value: snapshot.generatedAt.slice(0, 10) },
      ...(version > 1
        ? [
            {
              label: "Version",
              value: `Version ${version}${args.supersedesVersion ? ` — erstatter version ${args.supersedesVersion}` : ""}`,
            },
          ]
        : []),
    ],
  });

  sections.push({
    id: "rules",
    title: "Regler anvendt",
    kind: "keyvalue",
    note: rulePack
      ? null
      : "Automatisk skattevejledning er ikke aktiveret for dette land. Rapporten opsummerer kun de registrerede tal.",
    cards: [
      { label: "Jurisdiktion", value: snapshot.jurisdictionCode ?? "Ikke afgjort" },
      { label: "Rule Pack ID", value: rulePack?.id ?? "—" },
      { label: "Rule-pack-version", value: rulePack?.rulePackVersion ?? "—" },
      { label: "Calculation version", value: snapshot.calculationVersion },
      { label: "Regelpakke verificeret", value: rulePack?.verifiedAt ?? "—" },
      { label: "Integrity hash", value: args.integrityHash ?? snapshot.rulePackHash ?? "—" },
    ],
  });

  // 6 — executive summary
  const summaryCards: ReportCard[] = [
    { label: "Samlet indkomst", value: money(result.totalIncomeMinor) },
    { label: "MyCleaner-indkomst", value: money(result.myCleanerIncomeMinor) },
    { label: "Ekstern indkomst", value: money(result.externalIncomeMinor) },
    { label: "Godkendte udgifter", value: money(result.includedExpensesMinor) },
    { label: "Dokumenteret kørsel", value: money(result.includedMileageAmountMinor) },
    { label: "Foreløbigt resultat", value: money(result.preliminaryBusinessResultMinor) },
  ];
  if (result.indirectTax) {
    const label = result.indirectTax.label;
    if (result.indirectTax.system === "vat_like") {
      summaryCards.push(
        { label: `${label} opkrævet`, value: money(result.indirectTax.outputTaxMinor ?? 0) },
        { label: `Fradragsberettiget ${label.toLowerCase()}`, value: money(result.indirectTax.inputTaxMinor ?? 0) },
      );
    } else {
      summaryCards.push(
        { label: `${label} — afgiftspligtigt salg`, value: money(result.indirectTax.taxableSalesMinor ?? 0) },
        { label: `${label} opkrævet`, value: money(result.indirectTax.salesTaxCollectedMinor ?? 0) },
      );
    }
    summaryCards.push({
      label: `Foreløbig ${label.toLowerCase()} til betaling`,
      value: money(result.indirectTaxPayableMinor),
    });
  }
  sections.push({ id: "summary", title: "Oversigt", kind: "cards", cards: summaryCards });

  // 7 — income
  const incomeRows: string[][] = [];
  for (const item of snapshot.income) {
    incomeRows.push([
      formatDate(item.transactionDate, locale),
      "MyCleaner",
      item.label,
      "Automatisk registreret via MyCleaner",
      `${(item.originalAmountMinor / 100).toFixed(2)} ${item.originalCurrency}`,
      money(item.accountingAmountMinor),
      "Automatisk",
    ]);
  }
  for (const item of snapshot.externalIncome) {
    const included = result.includedExternalIncomeItems.includes(item.id);
    const review = result.reviewRequiredExternalIncomeItems.includes(item.id);
    incomeRows.push([
      formatDate(item.incomeDate, locale),
      sourceLabel(item.incomeSourceType),
      item.description,
      included ? "Medregnet" : review ? "Kræver kontrol" : "Ikke medregnet",
      `${(item.originalAmountMinor / 100).toFixed(2)} ${item.originalCurrency}`,
      item.accountingAmountMinor != null ? money(item.accountingAmountMinor) : "—",
      documentationLabel(item.documentationStatus),
    ]);
  }
  sections.push({
    id: "income",
    title: "Indkomst",
    kind: "table",
    note: "Ekstern indkomst er registreret manuelt af provideren. MyCleaner-indkomst er automatisk registreret.",
    table: {
      columns: [
        "Dato",
        "Kilde",
        "Beskrivelse",
        "Status",
        "Originalt beløb",
        "Regnskabsbeløb",
        "Dokumentation",
      ],
      rows: incomeRows,
      subtotals: [
        ...result.incomeBySource.map((row) => ({
          label: `Subtotal — ${sourceLabel(row.sourceType)}`,
          value: money(row.amountMinor),
        })),
        { label: "Samlet indkomst", value: money(result.totalIncomeMinor) },
      ],
    },
  });

  // 8 — expenses
  const expenseRows = snapshot.expenses.map((expense) => {
    const excluded = result.excludedItems.some((item) => item.id === expense.id);
    const review = result.reviewRequiredItems.some((item) => item.id === expense.id);
    return [
      formatDate(expense.transactionDate, locale),
      expense.label,
      expense.categoryCode ?? "Ukategoriseret",
      `${(expense.originalAmountMinor / 100).toFixed(2)} ${expense.originalCurrency}`,
      expense.businessUsePercentage != null ? `${expense.businessUsePercentage} %` : "—",
      excluded ? "Ikke medregnet" : review ? "Kræver kontrol" : money(expense.accountingAmountMinor),
      expense.hasDocumentation ? "Dokumenteret" : "Bilag mangler",
    ];
  });
  sections.push({
    id: "expenses",
    title: "Udgifter",
    kind: "table",
    note: "Kun godkendte poster indgår i rapportens resultat.",
    table: {
      columns: [
        "Dato",
        "Leverandør / tekst",
        "Kategori",
        "Beløb",
        "Erhvervsmæssig andel",
        "Godkendt fradrag",
        "Dokumentation",
      ],
      rows: expenseRows,
      subtotals: [{ label: "Godkendte udgifter", value: money(result.includedExpensesMinor) }],
    },
  });

  // 9 — mileage
  const mileageUnit = rulePack?.mileageRules.distanceUnit ?? "km";
  sections.push({
    id: "mileage",
    title: "Kørsel og transport",
    kind: "table",
    note:
      rulePack?.mileageRules.method === "not_supported"
        ? "Regelpakken understøtter ikke automatisk kørselsberegning."
        : null,
    table: {
      columns: ["Dato", "Reference", "Afstand", "Køretøj", "Type", "Status"],
      rows: snapshot.mileage.map((trip) => [
        formatDate(trip.transactionDate, locale),
        trip.label,
        `${trip.distance} ${mileageUnit}`,
        trip.vehicleType,
        trip.tripType,
        trip.hasDocumentation ? "Dokumenteret" : "Kræver kontrol",
      ]),
      subtotals: [{ label: "Foreløbigt kørselsbeløb", value: money(result.includedMileageAmountMinor) }],
    },
  });

  // 10 — indirect tax, only when the rule pack and profile require it
  if (result.indirectTax) {
    const tax = result.indirectTax;
    const cards: ReportCard[] =
      tax.system === "vat_like"
        ? [
            { label: "Output tax", value: money(tax.outputTaxMinor ?? 0) },
            { label: "Input tax", value: money(tax.inputTaxMinor ?? 0) },
            { label: "Justeringer", value: money(tax.adjustmentsMinor ?? 0) },
            { label: "Foreløbigt beløb til betaling", value: money(result.indirectTaxPayableMinor) },
            { label: "Foreløbigt beløb til tilbagebetaling", value: money(result.indirectTaxReceivableMinor) },
          ]
        : [
            { label: "Taxable sales", value: money(tax.taxableSalesMinor ?? 0) },
            { label: "Exempt sales", value: money(tax.exemptSalesMinor ?? 0) },
            { label: "Sales tax collected", value: money(tax.salesTaxCollectedMinor ?? 0) },
            { label: "Lokal jurisdiktion", value: tax.localTaxJurisdiction ?? "—" },
            { label: "Foreløbig forpligtelse", value: money(tax.estimatedLiabilityMinor ?? null) },
          ];
    sections.push({ id: "indirect-tax", title: tax.label, kind: "keyvalue", cards });
  }

  // 11 — attention
  const attention: string[] = [
    ...result.reviewRequiredItems.map(
      (item) => `${item.label} — ${item.reason ?? "kræver kontrol"} (anbefalet: gennemgå posten i MyCleaner)`,
    ),
    ...result.excludedItems.map(
      (item) => `${item.label} — ikke medregnet: ${item.reason ?? "mangler oplysninger"}`,
    ),
    ...result.reviewRequiredExternalIncomeItems.map(
      (id) => `Ekstern indkomst ${id} — kræver kontrol før den kan medregnes`,
    ),
    ...result.excludedExternalIncomeItems.map(
      (id) => `Ekstern indkomst ${id} — ikke medregnet i det foreløbige resultat`,
    ),
    ...result.warnings,
  ];
  if (attention.length > 0) {
    sections.push({
      id: "attention",
      title: "Kræver din opmærksomhed",
      kind: "list",
      note: "Poster i denne sektion er ikke medregnet i det foreløbige resultat, medmindre backendberegningen udtrykkeligt siger andet.",
      items: attention,
    });
  }

  // 12 — method
  sections.push({
    id: "method",
    title: "Sådan er rapporten beregnet",
    kind: "text",
    paragraphs: [
      ...result.explanationLines,
      ...snapshot.exchangeRates.map(
        (rate) => `Valutakurs ${rate.pair}: ${rate.rate}${rate.rateDate ? ` (${rate.rateDate})` : ""}${rate.source ? ` — ${rate.source}` : ""}`,
      ),
      `Beregningsversion: ${snapshot.calculationVersion}`,
      rulePack
        ? `Regelpakke: ${rulePack.countryCode} ${rulePack.rulePackVersion}`
        : "Ingen publiceret regelpakke — rapporten indeholder ingen skattevejledning.",
    ],
  });

  const disclaimer =
    rulePack?.disclaimers && rulePack.disclaimers.length > 0 ? rulePack.disclaimers : GENERIC_DISCLAIMER;

  return {
    documentVersion: MONTHLY_REPORT_DOCUMENT_VERSION,
    fileName: buildReportFileName({
      year: snapshot.reportYear,
      month: snapshot.reportMonth,
      myCleanerId: snapshot.myCleanerId,
      version,
    }),
    brandName: "MyCleaner",
    title: "Månedlig regnskabsoversigt",
    subtitle: "Udarbejdet på baggrund af dine registrerede indtægter, udgifter og dokumenter.",
    periodLabel: `${formatDate(snapshot.period.periodStart, locale)} – ${formatDate(snapshot.period.periodEnd, locale)}`,
    providerName: snapshot.providerDisplayName,
    myCleanerId: snapshot.myCleanerId,
    generatedAtLabel: snapshot.generatedAt.slice(0, 10),
    provisional,
    status,
    sections,
    disclaimer,
    footer: `MyCleaner · ${monthLabel(snapshot.reportYear, snapshot.reportMonth)} · ${snapshot.myCleanerId}`,
  };
}

function registrationTypeLabel(
  provider: ProviderAccountingProfile,
  rulePack: AccountingRulePack | null,
): string {
  if (!provider.registrationType) return "Ikke angivet";
  return rulePack?.labels.registrationTypeLabels?.[provider.registrationType] ?? provider.registrationType;
}

function indirectTaxStatusLabel(provider: ProviderAccountingProfile): string {
  if (provider.indirectTaxRegistered === true) return "Registreret";
  if (provider.indirectTaxRegistered === false) return "Ikke registreret";
  return "Ukendt";
}

function documentationLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Verificeret";
    case "uploaded":
      return "Uploadet";
    case "review_required":
      return "Kræver kontrol";
    default:
      return "Mangler";
  }
}
