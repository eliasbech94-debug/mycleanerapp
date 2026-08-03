/**
 * CSV / payout-statement import for external income.
 *
 * Imported rows are NEVER auto-approved: every produced draft is
 * `recordStatus: "draft"` + `reviewRequired: true`, so the calculation engine
 * keeps them out of the amount until the provider confirms them.
 */
import type {
  ExternalIncomeDocumentationStatus,
  ExternalIncomeInput,
  ExternalIncomePaymentMethod,
  ExternalIncomePaymentStatus,
  ExternalIncomeSourceType,
} from "./externalIncome";
import { findPossibleDuplicates } from "./externalIncome";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export type ImportColumnKey =
  | "incomeDate"
  | "description"
  | "amount"
  | "currency"
  | "platformName"
  | "customerReference"
  | "invoiceNumber"
  | "paymentStatus"
  | "paymentMethod";

export type ImportColumnMapping = Partial<Record<ImportColumnKey, number>>;

export interface ImportRowIssue {
  rowIndex: number;
  code: "invalid_date" | "invalid_amount" | "invalid_currency" | "possible_duplicate";
  message: string;
}

export interface ImportPreview {
  drafts: ExternalIncomeInput[];
  issues: ImportRowIssue[];
  duplicateRowIndexes: number[];
}

/** Minimal RFC4180-ish parser: quoted fields, commas or semicolons. */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!clean) return { headers: [], rows: [] };
  const delimiter = (clean.split("\n")[0].match(/;/g)?.length ?? 0) >
    (clean.split("\n")[0].match(/,/g)?.length ?? 0)
    ? ";"
    : ",";

  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      lines.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field.trim());
  lines.push(row);

  const [headers = [], ...rows] = lines;
  return { headers, rows: rows.filter((r) => r.some((c) => c !== "")) };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "1.234,56" / "1,234.56" / "1234.56" → minor units. Integer only. */
export function parseAmountToMinor(raw: string): number | null {
  const trimmed = raw.replace(/[^\d.,-]/g, "").trim();
  if (!trimmed) return null;
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalised = trimmed;
  if (lastComma > lastDot) {
    normalised = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    normalised = trimmed.replace(/,/g, "");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalised)) return null;
  const negative = normalised.startsWith("-");
  const [whole, frac = ""] = normalised.replace("-", "").split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -minor : minor;
}

const PAYMENT_STATUSES: ExternalIncomePaymentStatus[] = [
  "expected",
  "invoiced",
  "partially_paid",
  "paid",
  "cancelled",
  "refunded",
];
const PAYMENT_METHODS: ExternalIncomePaymentMethod[] = [
  "bank_transfer",
  "cash",
  "card",
  "platform_payout",
  "invoice",
  "other",
];

export interface BuildImportArgs {
  csv: ParsedCsv;
  mapping: ImportColumnMapping;
  incomeSourceType: ExternalIncomeSourceType;
  defaultCurrency: string;
  existing: ExternalIncomeInput[];
  importedFrom: string;
  idPrefix?: string;
}

export function buildImportPreview({
  csv,
  mapping,
  incomeSourceType,
  defaultCurrency,
  existing,
  importedFrom,
  idPrefix = "import",
}: BuildImportArgs): ImportPreview {
  const drafts: ExternalIncomeInput[] = [];
  const issues: ImportRowIssue[] = [];
  const duplicateRowIndexes: number[] = [];

  csv.rows.forEach((row, rowIndex) => {
    const cell = (key: ImportColumnKey): string =>
      mapping[key] != null ? (row[mapping[key] as number] ?? "") : "";

    const incomeDate = cell("incomeDate");
    const amountMinor = parseAmountToMinor(cell("amount"));
    const currency = (cell("currency") || defaultCurrency).toUpperCase();

    if (!ISO_DATE.test(incomeDate)) {
      issues.push({
        rowIndex,
        code: "invalid_date",
        message: "Datoen skal være i formatet ÅÅÅÅ-MM-DD.",
      });
      return;
    }
    if (amountMinor == null) {
      issues.push({ rowIndex, code: "invalid_amount", message: "Beløbet kunne ikke læses." });
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      issues.push({ rowIndex, code: "invalid_currency", message: "Valutaen er ikke gyldig." });
      return;
    }

    const rawStatus = cell("paymentStatus") as ExternalIncomePaymentStatus;
    const rawMethod = cell("paymentMethod") as ExternalIncomePaymentMethod;
    const documentationStatus: ExternalIncomeDocumentationStatus = "missing";

    const draft: ExternalIncomeInput = {
      id: `${idPrefix}-${rowIndex}`,
      incomeSourceType,
      sourceName: cell("platformName") || null,
      platformName: cell("platformName") || null,
      customerReference: cell("customerReference") || null,
      incomeDate,
      serviceDateFrom: null,
      serviceDateTo: null,
      description: cell("description") || "Importeret indkomst",
      originalAmountMinor: amountMinor,
      originalCurrency: currency,
      accountingAmountMinor: currency === defaultCurrency ? amountMinor : null,
      accountingCurrency: currency === defaultCurrency ? currency : null,
      exchangeRate: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
      indirectTaxIncluded: null,
      taxRate: null,
      taxAmountMinor: null,
      taxCode: null,
      taxJurisdiction: null,
      taxTreatment: null,
      paymentMethod: PAYMENT_METHODS.includes(rawMethod) ? rawMethod : "other",
      paymentStatus: PAYMENT_STATUSES.includes(rawStatus) ? rawStatus : "expected",
      documentationStatus,
      notes: null,
      // Never auto-approved.
      recordStatus: "draft",
      reviewRequired: true,
      importedFrom,
      invoiceNumber: cell("invoiceNumber") || null,
      documentHashes: [],
      payout: null,
    };

    const duplicates = findPossibleDuplicates(draft, [...existing, ...drafts]);
    if (duplicates.length > 0) {
      duplicateRowIndexes.push(rowIndex);
      issues.push({
        rowIndex,
        code: "possible_duplicate",
        message: "Denne indkomst ligner en post, der allerede findes",
      });
    }
    drafts.push(draft);
  });

  return { drafts, issues, duplicateRowIndexes };
}
