/**
 * PREVIEW FIXTURES — NOT LEGISLATION.
 *
 * Every rule pack below is marked `sampleOnly: true`. The numbers are invented
 * placeholders whose only purpose is to exercise the UI and the rule engine.
 * They are never loaded in production, and the UI renders a permanent warning
 * banner whenever `sampleOnly` is set. Real rule packs are created and verified
 * by an administrator against official sources.
 */
import type {
  AccountingPeriod,
  AccountingRulePack,
  ExpenseCategoryRule,
  ExpenseInput,
  IncomeInput,
  MileageInput,
  ProviderAccountingProfile,
  ProviderRegistrationType,
  ExternalIncomeInput,
} from "@/lib/accounting";

const ALL_TYPES: ProviderRegistrationType[] = [
  "individual",
  "sole_trader",
  "self_employed",
  "company",
  "partnership",
  "other",
];

function category(
  code: string,
  title: string,
  overrides: Partial<ExpenseCategoryRule> = {},
): ExpenseCategoryRule {
  return {
    categoryCode: code,
    localTitle: title,
    description: `Eksempeltekst for ${title} (testdata).`,
    allowedRegistrationTypes: ALL_TYPES,
    treatment: "generally_allowed",
    businessUseRequired: false,
    documentationRequired: true,
    indirectTaxTreatment: "deductible",
    maximumDeductiblePercentage: null,
    localConditions: [],
    warningText: null,
    officialGuidanceReference: null,
    ...overrides,
  };
}

interface PackSeed {
  country: string;
  version: string;
  currency: string;
  locale: string;
  indirectTaxEnabled: boolean;
  indirectTaxName: string | null;
  system: "vat_like" | "sales_tax_like" | null;
  standardRateBp: number;
  businessRegistrationLabel: string;
  region?: string | null;
  mileageMethod?: AccountingRulePack["mileageRules"]["method"];
  distanceUnit?: "km" | "mile";
  mileageMinorPerUnit?: number;
}

function makePack(seed: PackSeed): AccountingRulePack {
  const taxName = seed.indirectTaxName ?? "Indirect tax";
  return {
    id: `pack-${seed.country.toLowerCase()}`,
    countryCode: seed.country,
    regionCode: seed.region ?? null,
    rulePackVersion: seed.version,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    status: "published",
    supportedRegistrationTypes: ALL_TYPES,
    supportedIndirectTaxTypes: seed.indirectTaxEnabled
      ? seed.system === "sales_tax_like"
        ? ["sales_tax"]
        : ["vat", "gst"]
      : ["none"],
    defaultCurrency: seed.currency,
    supportedCurrencies: [seed.currency, "EUR"],
    defaultLocale: seed.locale,
    indirectTaxEnabled: seed.indirectTaxEnabled,
    indirectTaxName: seed.indirectTaxName,
    indirectTaxSystem: seed.system,
    indirectTaxRegistrationThresholdMinor: null,
    indirectTaxThresholdCurrency: seed.currency,
    defaultIndirectTaxRates: seed.indirectTaxEnabled
      ? [
          {
            taxCode: "STD",
            rateBasisPoints: seed.standardRateBp,
            appliesToCategories: null,
            reverseCharge: false,
            exempt: false,
            description: `Standardsats (testdata) for ${taxName}.`,
          },
        ]
      : [],
    reducedIndirectTaxRates: [],
    zeroRateRules: seed.indirectTaxEnabled
      ? [
          {
            taxCode: "ZERO",
            rateBasisPoints: 0,
            appliesToCategories: ["insurance"],
            reverseCharge: false,
            exempt: true,
            description: "Fritaget kategori (testdata).",
          },
        ]
      : [],
    reverseChargeRules: seed.indirectTaxEnabled
      ? [
          {
            taxCode: "RC",
            rateBasisPoints: 0,
            appliesToCategories: null,
            reverseCharge: true,
            exempt: false,
            description: "Omvendt betalingspligt ved køb i udlandet (testdata).",
          },
        ]
      : [],
    expenseCategories: [
      category("cleaning_supplies", "Rengøringsprodukter"),
      category("equipment", "Rengøringsudstyr"),
      category("safety_gear", "Sikkerhedsudstyr"),
      category("transport", "Transport", { businessUseRequired: true, maximumDeductiblePercentage: 80 }),
      category("insurance", "Forsikring", { indirectTaxTreatment: "not_applicable" }),
      category("software", "Software", { businessUseRequired: true }),
      category("phone", "Telefon", { businessUseRequired: true, maximumDeductiblePercentage: 50 }),
      category("training", "Faglige kurser", { treatment: "special_review" }),
      category("meals", "Måltider", { treatment: "generally_disallowed", warningText: "Måltider kan ikke fratrækkes i dette testregelsæt." }),
      category("major_equipment", "Større udstyr", { treatment: "capital_asset" }),
    ],
    mixedUseRules: {
      maximumBusinessUsePercentage: 90,
      documentationRequiredAbovePercentage: 50,
      categoriesRequiringReview: ["training"],
      categoriesDisallowed: ["meals"],
    },
    capitalAssetRules: { thresholdMinor: 500000, notes: ["Testdata"] },
    depreciationRules: { method: "straight_line", notes: ["Testdata"] },
    mileageRules: {
      method: seed.mileageMethod ?? "fixed_rate",
      distanceUnit: seed.distanceUnit ?? "km",
      currency: seed.currency,
      vehicleTypes: ["car", "bike"],
      rateBands: [
        {
          vehicleType: "car",
          minorPerDistanceUnit: seed.mileageMinorPerUnit ?? 300,
          fromDistance: 0,
          toDistance: 20000,
        },
        {
          vehicleType: "car",
          minorPerDistanceUnit: Math.round((seed.mileageMinorPerUnit ?? 300) / 2),
          fromDistance: 20000,
          toDistance: null,
        },
        { vehicleType: "bike", minorPerDistanceUnit: 50, fromDistance: 0, toDistance: null },
      ],
      annualDistanceThresholds: [20000],
      commutingTreatment: "generally_disallowed",
      homeToCustomerTreatment: "partially_allowed",
      customerToCustomerTreatment: "generally_allowed",
      parkingTreatment: "generally_allowed",
      tollTreatment: "generally_allowed",
      publicTransportTreatment: "generally_allowed",
      documentationRequirements: ["Rute og dato skal kunne dokumenteres."],
    },
    receiptRequirements: ["Bilag skal indeholde dato, leverandør og beløb."],
    invoiceRequirements: ["Fakturaer skal indeholde registreringsnummer."],
    recordRetentionRules: ["Bilag opbevares efter lokale regler."],
    filingPeriodOptions: ["monthly", "quarterly", "yearly"],
    filingDeadlines: [
      { periodKind: "quarterly", description: "Testdata: frist efter periodens udløb." },
    ],
    labels: {
      businessRegistrationLabel: seed.businessRegistrationLabel,
      indirectTaxLabel: taxName,
      indirectTaxNumberLabel: `${taxName}-nummer`,
      taxIdentificationLabel: "Skatteidentifikation",
      registrationTypeLabels: {
        individual: "Individuelt registreret",
        sole_trader: "Enkeltmandsvirksomhed",
        self_employed: "Selvstændig",
        company: "Selskab",
        partnership: "Interessentskab",
        other: "Andet",
      },
      filingPeriodLabel: "Indberetningsperiode",
      preliminaryAmountLabel: "Foreløbigt beløb til registrering",
    },
    disclaimers: [
      "Testdata. Denne pakke er ikke verificeret mod officielle kilder og må ikke bruges til indberetning.",
    ],
    officialGuidanceLinks: [{ title: "Officiel kilde (placeholder)", url: "https://example.invalid" }],
    sources: [
      {
        officialSourceName: "PREVIEW FIXTURE — ingen officiel kilde",
        officialSourceUrl: "https://example.invalid",
        sourceDocumentTitle: "Fiktiv testkilde",
        sourcePublishedAt: "2026-01-01",
        sourceCheckedAt: "2026-01-01",
        checkedBy: "preview-fixture",
        verificationNotes: "Kun til UI-preview. Ikke gældende regler.",
      },
    ],
    verifiedAt: "2026-01-01",
    verifiedBy: "preview-fixture",
    sourceVersion: "fixture",
    sampleOnly: true,
  };
}

export const FIXTURE_RULE_PACKS: AccountingRulePack[] = [
  makePack({
    country: "DK",
    version: "DK-FIXTURE-2026.1",
    currency: "DKK",
    locale: "da-DK",
    indirectTaxEnabled: true,
    indirectTaxName: "Moms",
    system: "vat_like",
    standardRateBp: 2000,
    businessRegistrationLabel: "CVR-nummer",
  }),
  makePack({
    country: "SE",
    version: "SE-FIXTURE-2026.2",
    currency: "SEK",
    locale: "sv-SE",
    indirectTaxEnabled: true,
    indirectTaxName: "Moms",
    system: "vat_like",
    standardRateBp: 2000,
    businessRegistrationLabel: "Organisationsnummer",
  }),
  makePack({
    country: "GB",
    version: "GB-FIXTURE-2026.1",
    currency: "GBP",
    locale: "en-GB",
    indirectTaxEnabled: true,
    indirectTaxName: "VAT",
    system: "vat_like",
    standardRateBp: 1500,
    businessRegistrationLabel: "Company number",
    distanceUnit: "mile",
    mileageMinorPerUnit: 40,
  }),
  makePack({
    country: "DE",
    version: "DE-FIXTURE-2026.1",
    currency: "EUR",
    locale: "de-DE",
    indirectTaxEnabled: true,
    indirectTaxName: "Umsatzsteuer",
    system: "vat_like",
    standardRateBp: 1500,
    businessRegistrationLabel: "Steuernummer",
  }),
  makePack({
    country: "ES",
    version: "ES-FIXTURE-2026.1",
    currency: "EUR",
    locale: "es-ES",
    indirectTaxEnabled: true,
    indirectTaxName: "IVA",
    system: "vat_like",
    standardRateBp: 1500,
    businessRegistrationLabel: "NIF",
  }),
  makePack({
    country: "US",
    region: "TX",
    version: "US-TX-FIXTURE-2026.1",
    currency: "USD",
    locale: "en-US",
    indirectTaxEnabled: true,
    indirectTaxName: "Sales tax",
    system: "sales_tax_like",
    standardRateBp: 800,
    businessRegistrationLabel: "EIN",
    distanceUnit: "mile",
    mileageMinorPerUnit: 60,
  }),
];

function profile(over: Partial<ProviderAccountingProfile>): ProviderAccountingProfile {
  return {
    providerUserId: "fixture-provider",
    registrationCountry: null,
    taxResidenceCountry: null,
    primaryWorkCountry: null,
    registrationType: null,
    businessRegistrationNumberLast4: null,
    businessRegistrationType: null,
    taxIdentificationNumberLast4: null,
    taxIdentificationType: null,
    indirectTaxRegistered: null,
    indirectTaxType: "unknown",
    indirectTaxNumberLast4: null,
    accountingCurrency: null,
    preferredLocale: null,
    profileRequiresReview: false,
    ...over,
  };
}

export const FIXTURE_PERIOD: AccountingPeriod = {
  periodStart: "2026-04-01",
  periodEnd: "2026-06-30",
  kind: "quarterly",
  status: "open",
};

function income(currency: string): IncomeInput[] {
  return [
    {
      id: "inc-1",
      label: "Bookinger, april",
      transactionDate: "2026-04-28",
      originalAmountMinor: 1450000,
      originalCurrency: currency,
      accountingAmountMinor: 1450000,
      accountingCurrency: currency,
      exchangeRate: "1.0",
      exchangeRateDate: "2026-04-28",
      exchangeRateSource: "identity",
      platformFeeMinor: 203000,
    },
    {
      id: "inc-2",
      label: "Bookinger, maj",
      transactionDate: "2026-05-31",
      originalAmountMinor: 1680000,
      originalCurrency: currency,
      accountingAmountMinor: 1680000,
      accountingCurrency: currency,
      exchangeRate: "1.0",
      exchangeRateDate: "2026-05-31",
      exchangeRateSource: "identity",
      platformFeeMinor: 235200,
    },
  ];
}

function expenses(currency: string): ExpenseInput[] {
  return [
    {
      id: "exp-1",
      label: "Rengøringsmidler",
      transactionDate: "2026-04-12",
      originalAmountMinor: 84500,
      originalCurrency: currency,
      accountingAmountMinor: 84500,
      accountingCurrency: currency,
      exchangeRate: "1.0",
      exchangeRateDate: "2026-04-12",
      exchangeRateSource: "identity",
      categoryCode: "cleaning_supplies",
      merchantCountry: null,
      businessUsePercentage: null,
      taxCodeHint: null,
      hasDocumentation: true,
      aiSuggested: false,
      approvedByProvider: true,
    },
    {
      id: "exp-2",
      label: "Mobilabonnement",
      transactionDate: "2026-05-02",
      originalAmountMinor: 39900,
      originalCurrency: currency,
      accountingAmountMinor: 39900,
      accountingCurrency: currency,
      exchangeRate: "1.0",
      exchangeRateDate: "2026-05-02",
      exchangeRateSource: "identity",
      categoryCode: "phone",
      merchantCountry: null,
      businessUsePercentage: 80,
      taxCodeHint: null,
      hasDocumentation: true,
      aiSuggested: false,
      approvedByProvider: true,
    },
    {
      id: "exp-3",
      label: "Frokost med kunde",
      transactionDate: "2026-05-18",
      originalAmountMinor: 24500,
      originalCurrency: currency,
      accountingAmountMinor: 24500,
      accountingCurrency: currency,
      exchangeRate: "1.0",
      exchangeRateDate: "2026-05-18",
      exchangeRateSource: "identity",
      categoryCode: "meals",
      merchantCountry: null,
      businessUsePercentage: 100,
      taxCodeHint: null,
      hasDocumentation: true,
      aiSuggested: false,
      approvedByProvider: true,
    },
    {
      id: "exp-4",
      label: "Bilag scannet af AI",
      transactionDate: "2026-06-04",
      originalAmountMinor: 62000,
      originalCurrency: currency,
      accountingAmountMinor: 62000,
      accountingCurrency: currency,
      exchangeRate: "1.0",
      exchangeRateDate: "2026-06-04",
      exchangeRateSource: "identity",
      categoryCode: "equipment",
      merchantCountry: null,
      businessUsePercentage: null,
      taxCodeHint: null,
      hasDocumentation: true,
      aiSuggested: true,
      approvedByProvider: false,
    },
  ];
}

const mileage: MileageInput[] = [
  {
    id: "mil-1",
    label: "Hjem → kunde",
    transactionDate: "2026-04-14",
    distance: 42,
    vehicleType: "car",
    tripType: "home_to_customer",
    hasDocumentation: true,
  },
  {
    id: "mil-2",
    label: "Kunde → kunde",
    transactionDate: "2026-04-14",
    distance: 18,
    vehicleType: "car",
    tripType: "customer_to_customer",
    hasDocumentation: true,
  },
  {
    id: "mil-3",
    label: "Pendling",
    transactionDate: "2026-04-15",
    distance: 30,
    vehicleType: "car",
    tripType: "commuting",
    hasDocumentation: true,
  },
];

export interface AccountingPreviewCase {
  id: string;
  title: string;
  description: string;
  provider: ProviderAccountingProfile;
  currency: string;
}

export const ACCOUNTING_PREVIEW_CASES: AccountingPreviewCase[] = [
  {
    id: "A",
    title: "A — Individuelt registreret provider i Danmark",
    description: "Ingen virksomhedsregistrering, ingen indirekte skat.",
    currency: "DKK",
    provider: profile({
      registrationCountry: "DK",
      taxResidenceCountry: "DK",
      primaryWorkCountry: "DK",
      registrationType: "individual",
      indirectTaxRegistered: false,
      indirectTaxType: "none",
      accountingCurrency: "DKK",
      preferredLocale: "da-DK",
    }),
  },
  {
    id: "B",
    title: "B — Momsregistreret virksomhed i Sverige",
    description: "Selskab med VAT-lignende indirekte skat.",
    currency: "SEK",
    provider: profile({
      registrationCountry: "SE",
      taxResidenceCountry: "SE",
      primaryWorkCountry: "SE",
      registrationType: "company",
      businessRegistrationNumberLast4: "4821",
      indirectTaxRegistered: true,
      indirectTaxType: "vat",
      indirectTaxNumberLast4: "0192",
      accountingCurrency: "SEK",
      preferredLocale: "sv-SE",
    }),
  },
  {
    id: "C",
    title: "C — Sole trader med VAT i Storbritannien",
    description: "Miles i stedet for kilometer, GBP.",
    currency: "GBP",
    provider: profile({
      registrationCountry: "GB",
      taxResidenceCountry: "GB",
      primaryWorkCountry: "GB",
      registrationType: "sole_trader",
      businessRegistrationNumberLast4: "7731",
      indirectTaxRegistered: true,
      indirectTaxType: "vat",
      accountingCurrency: "GBP",
      preferredLocale: "en-GB",
    }),
  },
  {
    id: "D",
    title: "D — Selvstændig i Tyskland",
    description: "Ikke registreret for indirekte skat.",
    currency: "EUR",
    provider: profile({
      registrationCountry: "DE",
      taxResidenceCountry: "DE",
      primaryWorkCountry: "DE",
      registrationType: "self_employed",
      indirectTaxRegistered: false,
      indirectTaxType: "none",
      accountingCurrency: "EUR",
      preferredLocale: "de-DE",
    }),
  },
  {
    id: "E",
    title: "E — Selvstændig med IVA i Spanien",
    description: "Lokale begreber fra regelpakken.",
    currency: "EUR",
    provider: profile({
      registrationCountry: "ES",
      taxResidenceCountry: "ES",
      primaryWorkCountry: "ES",
      registrationType: "self_employed",
      businessRegistrationNumberLast4: "5540",
      indirectTaxRegistered: true,
      indirectTaxType: "vat",
      accountingCurrency: "EUR",
      preferredLocale: "es-ES",
    }),
  },
  {
    id: "F",
    title: "F — Provider i et endnu ikke understøttet land",
    description: "Ingen aktiv regelpakke.",
    currency: "PLN",
    provider: profile({
      registrationCountry: "PL",
      taxResidenceCountry: "PL",
      primaryWorkCountry: "PL",
      registrationType: "sole_trader",
      indirectTaxRegistered: true,
      indirectTaxType: "vat",
      accountingCurrency: "PLN",
      preferredLocale: "pl-PL",
    }),
  },
  {
    id: "G",
    title: "G — Provider med flere relevante lande",
    description: "Bopæl i Sverige, arbejde i Danmark. Kræver manuel kontrol.",
    currency: "SEK",
    provider: profile({
      registrationCountry: "SE",
      taxResidenceCountry: "SE",
      primaryWorkCountry: "DK",
      registrationType: "sole_trader",
      indirectTaxRegistered: true,
      indirectTaxType: "vat",
      accountingCurrency: "SEK",
      preferredLocale: "sv-SE",
    }),
  },
  {
    id: "H",
    title: "H — Provider med ukendt indirekte skattestatus",
    description: "Indirekte skattestatus er ikke verificeret.",
    currency: "DKK",
    provider: profile({
      registrationCountry: "DK",
      taxResidenceCountry: "DK",
      primaryWorkCountry: "DK",
      registrationType: "sole_trader",
      indirectTaxRegistered: null,
      indirectTaxType: "unknown",
      accountingCurrency: "DKK",
      preferredLocale: "da-DK",
    }),
  },
];

export function fixtureLedger(currency: string) {
  return {
    income: income(currency),
    expenses: expenses(currency),
    mileage,
    adjustments: [],
  };
}

export const SALES_TAX_PREVIEW_CASE: AccountingPreviewCase = {
  id: "US",
  title: "Sales-tax-land (US-TX)",
  description: "Sales tax behandles ikke som europæisk moms.",
  currency: "USD",
  provider: profile({
    registrationCountry: "US",
    taxResidenceCountry: "US",
    primaryWorkCountry: "US",
    registrationType: "sole_trader",
    indirectTaxRegistered: true,
    indirectTaxType: "sales_tax",
    accountingCurrency: "USD",
    preferredLocale: "en-US",
  }),
};

// ---------------------------------------------------------------------------
// External income preview cases I–P (§19). Testdata only.
// ---------------------------------------------------------------------------

function externalIncome(
  overrides: Partial<ExternalIncomeInput> & Pick<ExternalIncomeInput, "id" | "description">,
): ExternalIncomeInput {
  const currency = overrides.originalCurrency ?? "DKK";
  const amount = overrides.originalAmountMinor ?? 100000;
  return {
    incomeSourceType: "other_platform",
    sourceName: null,
    platformName: null,
    customerReference: null,
    incomeDate: "2026-05-12",
    serviceDateFrom: null,
    serviceDateTo: null,
    originalAmountMinor: amount,
    originalCurrency: currency,
    accountingAmountMinor: amount,
    accountingCurrency: currency,
    exchangeRate: null,
    exchangeRateDate: null,
    exchangeRateSource: null,
    indirectTaxIncluded: null,
    taxRate: null,
    taxAmountMinor: null,
    taxCode: null,
    taxJurisdiction: null,
    taxTreatment: null,
    paymentMethod: "platform_payout",
    paymentStatus: "paid",
    documentationStatus: "uploaded",
    notes: null,
    recordStatus: "ready",
    reviewRequired: false,
    documentHashes: [],
    payout: null,
    ...overrides,
  };
}

export interface ExternalIncomePreviewCase extends AccountingPreviewCase {
  externalIncome: ExternalIncomeInput[];
}

const DK_PROVIDER = profile({
  registrationCountry: "DK",
  taxResidenceCountry: "DK",
  primaryWorkCountry: "DK",
  registrationType: "sole_trader",
  indirectTaxRegistered: true,
  indirectTaxType: "vat",
  accountingCurrency: "DKK",
  preferredLocale: "da-DK",
});

const duplicateBase = externalIncome({
  id: "ext-dup-1",
  description: "Rengøring hos privatkunde",
  incomeSourceType: "own_customer",
  paymentMethod: "bank_transfer",
  customerReference: "K-1042",
  invoiceNumber: "2026-114",
  originalAmountMinor: 180000,
});

export const EXTERNAL_INCOME_PREVIEW_CASES: ExternalIncomePreviewCase[] = [
  {
    id: "I",
    title: "I — MyCleaner-indkomst + anden platform",
    description: "Automatisk MyCleaner-indkomst kombineret med manuelt registreret platformindkomst.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      externalIncome({
        id: "ext-i-1",
        description: "Udbetaling fra anden platform",
        platformName: "Platform A",
        sourceName: "Platform A",
        originalAmountMinor: 250000,
      }),
    ],
  },
  {
    id: "J",
    title: "J — Egen kunde med faktura",
    description: "Faktureret og betalt af providerens egen kunde.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      externalIncome({
        id: "ext-j-1",
        description: "Faktura 2026-118",
        incomeSourceType: "own_customer",
        paymentMethod: "invoice",
        customerReference: "K-2210",
        invoiceNumber: "2026-118",
        originalAmountMinor: 320000,
      }),
    ],
  },
  {
    id: "K",
    title: "K — Kontant betaling uden dokumentation",
    description: "Kræver kontrol, indtil provideren har gennemgået posten.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      externalIncome({
        id: "ext-k-1",
        description: "Kontant betaling",
        incomeSourceType: "cash",
        paymentMethod: "cash",
        documentationStatus: "missing",
        originalAmountMinor: 90000,
      }),
    ],
  },
  {
    id: "L",
    title: "L — Indkomst i fremmed valuta",
    description: "Kurs mangler, så posten tæller ikke med.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      externalIncome({
        id: "ext-l-1",
        description: "Opgave i Sverige",
        originalCurrency: "SEK",
        originalAmountMinor: 450000,
        accountingAmountMinor: null,
        accountingCurrency: null,
      }),
    ],
  },
  {
    id: "M",
    title: "M — Anden platform med platformgebyr",
    description: "Brutto, gebyr, tilbageholdt skat og netto valideres.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      externalIncome({
        id: "ext-m-1",
        description: "Payout maj",
        platformName: "Platform B",
        sourceName: "Platform B",
        originalAmountMinor: 400000,
        payout: {
          payoutPeriodFrom: "2026-05-01",
          payoutPeriodTo: "2026-05-31",
          payoutDate: "2026-06-02",
          payoutReference: "PB-556",
          grossIncomeMinor: 400000,
          platformFeeMinor: 60000,
          taxWithheldMinor: 0,
          netPayoutMinor: 340000,
        },
      }),
    ],
  },
  {
    id: "N",
    title: "N — Mulig dublet",
    description: "To poster med samme dato, beløb og fakturanummer.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      duplicateBase,
      { ...duplicateBase, id: "ext-dup-2", description: "Rengøring hos privatkunde (kopi)" },
    ],
  },
  {
    id: "O",
    title: "O — Refunderet ekstern indkomst",
    description: "Refunderede beløb medregnes ikke.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      externalIncome({
        id: "ext-o-1",
        description: "Refunderet opgave",
        paymentStatus: "refunded",
        originalAmountMinor: 150000,
      }),
    ],
  },
  {
    id: "P",
    title: "P — Flere lande, kræver kontrol",
    description: "Skattejurisdiktionen matcher ikke providerens regelpakke.",
    currency: "DKK",
    provider: DK_PROVIDER,
    externalIncome: [
      externalIncome({
        id: "ext-p-1",
        description: "Opgave med udenlandsk skattebehandling",
        taxJurisdiction: "DE",
        originalAmountMinor: 210000,
      }),
    ],
  },
];
