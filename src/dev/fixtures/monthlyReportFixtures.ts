/**
 * PREVIEW FIXTURES — NOT LEGISLATION.
 *
 * Monthly-report preview cases Q–Z. Every rule pack used here is a fictional
 * `sampleOnly` pack; the numbers exist only to exercise the report document
 * builder. Nothing here is ever loaded in production.
 */
import type {
  ExpenseInput,
  ExternalIncomeInput,
  IncomeInput,
  MileageInput,
  ProviderAccountingProfile,
} from "@/lib/accounting";
import type { MonthlyReportKind } from "@/lib/accounting/monthlyReport";
import { externalIncome, fixtureLedger, profile } from "./accountingFixtures";

export interface MonthlyReportPreviewCase {
  id: string;
  title: string;
  description: string;
  provider: ProviderAccountingProfile;
  year: number;
  month: number;
  kind: MonthlyReportKind;
  reportVersion: number;
  supersedesVersion: number | null;
  income: IncomeInput[];
  expenses: ExpenseInput[];
  mileage: MileageInput[];
  externalIncome: ExternalIncomeInput[];
}

const DK = profile({
  registrationCountry: "DK",
  taxResidenceCountry: "DK",
  primaryWorkCountry: "DK",
  registrationType: "sole_trader",
  businessRegistrationNumberLast4: "4821",
  businessRegistrationType: "cvr_like",
  indirectTaxRegistered: true,
  indirectTaxType: "vat",
  indirectTaxNumberLast4: "4821",
  accountingCurrency: "DKK",
  preferredLocale: "da-DK",
});

const DK_NO_TAX = profile({
  registrationCountry: "DK",
  taxResidenceCountry: "DK",
  primaryWorkCountry: "DK",
  registrationType: "individual",
  indirectTaxRegistered: false,
  indirectTaxType: "none",
  accountingCurrency: "DKK",
  preferredLocale: "da-DK",
});

const US = profile({
  registrationCountry: "US",
  taxResidenceCountry: "US",
  primaryWorkCountry: "US",
  registrationType: "sole_trader",
  indirectTaxRegistered: true,
  indirectTaxType: "sales_tax",
  accountingCurrency: "USD",
  preferredLocale: "en-US",
});

const NO_PACK = profile({
  registrationCountry: "JP",
  taxResidenceCountry: "JP",
  primaryWorkCountry: "JP",
  registrationType: "sole_trader",
  accountingCurrency: "JPY",
  preferredLocale: "ja-JP",
});

function ledger(currency: string) {
  return fixtureLedger(currency);
}

function emptyLedger() {
  return { income: [] as IncomeInput[], expenses: [] as ExpenseInput[], mileage: [] as MileageInput[] };
}

function base(
  id: string,
  title: string,
  description: string,
  overrides: Partial<MonthlyReportPreviewCase> = {},
): MonthlyReportPreviewCase {
  const currency = overrides.provider?.accountingCurrency ?? "DKK";
  const seed = ledger(currency);
  return {
    id,
    title,
    description,
    provider: DK,
    year: 2026,
    month: 5,
    kind: "scheduled_month_end",
    reportVersion: 1,
    supersedesVersion: null,
    income: seed.income,
    expenses: seed.expenses,
    mileage: seed.mileage,
    externalIncome: [],
    ...overrides,
  };
}

export const MONTHLY_REPORT_PREVIEW_CASES: MonthlyReportPreviewCase[] = [
  base("Q", "Q — Normal måned med MyCleaner-indkomst", "Fuld måned med bookinger, bilag og kørsel."),

  base("R", "R — Måned uden aktivitet", "Ingen poster. Rapporten genereres kun, hvis provideren beder om det.", {
    ...emptyLedger(),
  }),

  base("S", "S — Kun ekstern indkomst", "Egne kunder og kontant betaling uden MyCleaner-bookinger.", {
    ...emptyLedger(),
    externalIncome: [
      externalIncome({
        id: "ext-s-1",
        description: "Faktura 2026-140",
        incomeSourceType: "own_customer",
        paymentMethod: "invoice",
        invoiceNumber: "2026-140",
        originalAmountMinor: 410000,
        incomeDate: "2026-05-08",
      }),
      externalIncome({
        id: "ext-s-2",
        description: "Kontant betaling",
        incomeSourceType: "cash",
        paymentMethod: "cash",
        documentationStatus: "missing",
        originalAmountMinor: 75000,
        incomeDate: "2026-05-19",
      }),
    ],
  }),

  base("T", "T — Blandet indkomst fra flere kilder", "MyCleaner, anden platform og egne kunder i samme måned.", {
    externalIncome: [
      externalIncome({
        id: "ext-t-1",
        description: "Udbetaling fra anden platform",
        platformName: "Platform B",
        sourceName: "Platform B",
        originalAmountMinor: 260000,
      }),
      externalIncome({
        id: "ext-t-2",
        description: "Fast kunde, maj",
        incomeSourceType: "own_customer",
        paymentMethod: "bank_transfer",
        customerReference: "K-3301",
        originalAmountMinor: 145000,
      }),
    ],
  }),

  base("U", "U — Poster uden dokumentation", "Rapporten markerer manglende bilag som 'kræver kontrol'.", {
    expenses: ledger("DKK").expenses.map((expense, index) =>
      index === 0 ? { ...expense, hasDocumentation: false, approvedByProvider: false } : expense,
    ),
    mileage: ledger("DKK").mileage.map((trip) => ({ ...trip, hasDocumentation: false })),
  }),

  base("V", "V — Indkomst i fremmed valuta", "Kurs mangler på én post, som derfor ikke medregnes.", {
    externalIncome: [
      externalIncome({
        id: "ext-v-1",
        description: "Opgave i Sverige",
        originalCurrency: "SEK",
        originalAmountMinor: 480000,
        accountingAmountMinor: null,
        accountingCurrency: null,
      }),
      externalIncome({
        id: "ext-v-2",
        description: "Opgave i Norge",
        originalCurrency: "NOK",
        originalAmountMinor: 320000,
        accountingAmountMinor: 213400,
        accountingCurrency: "DKK",
        exchangeRate: "0.6669000000",
        exchangeRateDate: "2026-05-20",
        exchangeRateSource: "ecb",
      }),
    ],
  }),

  base("W", "W — Sales-tax-land (US-TX)", "Sales tax vises som lokal afgift, ikke som europæisk moms.", {
    provider: US,
    ...(() => {
      const seed = ledger("USD");
      return { income: seed.income, expenses: seed.expenses, mileage: seed.mileage };
    })(),
  }),

  base("X", "X — Land uden publiceret regelpakke", "Rapporten viser tal, men ingen skattevejledning.", {
    provider: NO_PACK,
  }),

  base("Y", "Y — Korrigeret rapport (version 2)", "Erstatter version 1 efter en efterregistrering.", {
    reportVersion: 2,
    supersedesVersion: 1,
    externalIncome: [
      externalIncome({
        id: "ext-y-1",
        description: "Efterregistreret faktura",
        incomeSourceType: "own_customer",
        paymentMethod: "invoice",
        invoiceNumber: "2026-151",
        originalAmountMinor: 98000,
      }),
    ],
  }),

  base("Z", "Z — Foreløbig rapport midt i måneden", "Provideren har selv bedt om en rapport, før måneden er slut.", {
    provider: DK_NO_TAX,
    kind: "provisional",
    month: 6,
  }),
];
