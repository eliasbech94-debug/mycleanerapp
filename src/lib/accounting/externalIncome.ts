/**
 * External income — income earned outside MyCleaner.
 *
 * NOTHING here encodes the rules of a specific country or a specific platform.
 * Which payment statuses may be recognised, whether documentation is required
 * and how cash is treated all come from the active rule pack. Platform names
 * are free text and never carry a tax meaning.
 *
 * All money is integer minor units. Never a JavaScript float.
 */
import { sumMinor } from "./money";
import type { AccountingRulePack, JurisdictionResolution, ProviderAccountingProfile } from "./types";

export type ExternalIncomeSourceType =
  | "other_platform"
  | "own_customer"
  | "invoice"
  | "bank_transfer"
  | "cash"
  | "other";

export type ExternalIncomePaymentMethod =
  | "bank_transfer"
  | "cash"
  | "card"
  | "platform_payout"
  | "invoice"
  | "other";

export type ExternalIncomePaymentStatus =
  | "expected"
  | "invoiced"
  | "partially_paid"
  | "paid"
  | "cancelled"
  | "refunded";

export type ExternalIncomeDocumentationStatus =
  | "missing"
  | "uploaded"
  | "verified"
  | "review_required";

/** §17 — only the backend may set `included` / `excluded`. */
export type ExternalIncomeRecordStatus =
  | "draft"
  | "review_required"
  | "ready"
  | "included"
  | "excluded"
  | "cancelled"
  | "refunded";

export const PROVIDER_SETTABLE_RECORD_STATUSES: ExternalIncomeRecordStatus[] = [
  "draft",
  "review_required",
  "ready",
  "cancelled",
  "refunded",
];

export function isProviderSettableStatus(status: ExternalIncomeRecordStatus): boolean {
  return PROVIDER_SETTABLE_RECORD_STATUSES.includes(status);
}

/** Platform payout breakdown. All integers, all minor units. */
export interface PlatformPayoutBreakdown {
  payoutPeriodFrom: string | null;
  payoutPeriodTo: string | null;
  payoutDate: string | null;
  payoutReference: string | null;
  grossIncomeMinor: number;
  platformFeeMinor: number;
  taxWithheldMinor: number;
  netPayoutMinor: number;
}

export interface ExternalIncomeInput {
  id: string;

  incomeSourceType: ExternalIncomeSourceType;
  sourceName: string | null;
  platformName: string | null;
  customerReference: string | null;

  incomeDate: string;
  serviceDateFrom: string | null;
  serviceDateTo: string | null;

  description: string;

  originalAmountMinor: number;
  originalCurrency: string;

  accountingAmountMinor: number | null;
  accountingCurrency: string | null;

  exchangeRate: string | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;

  indirectTaxIncluded: boolean | null;
  taxRate: string | null;
  taxAmountMinor: number | null;
  taxCode: string | null;
  taxJurisdiction: string | null;
  taxTreatment: string | null;

  paymentMethod: ExternalIncomePaymentMethod;
  paymentStatus: ExternalIncomePaymentStatus;

  documentationStatus: ExternalIncomeDocumentationStatus;
  notes: string | null;

  recordStatus: ExternalIncomeRecordStatus;
  reviewRequired: boolean;

  /** Provider confirmed a cash entry after reading the cash warning. */
  cashReviewedByProvider?: boolean;
  /** Set by the import flow. Imported rows are never auto-approved. */
  importedFrom?: string | null;
  /** Provider justification when continuing past a duplicate warning. */
  duplicateOverrideReason?: string | null;

  invoiceNumber?: string | null;
  documentHashes?: string[];
  payout?: PlatformPayoutBreakdown | null;

  jurisdictionCode?: string | null;
  rulePackId?: string | null;
  rulePackVersion?: string | null;

  deletedAt?: string | null;
}

/** Rule-pack driven recognition policy. Never hardcoded globally. */
export interface ExternalIncomeRules {
  /** Which payment statuses the jurisdiction lets you recognise. */
  recognisedPaymentStatuses: ExternalIncomePaymentStatus[];
  /** Statuses that must be reviewed manually rather than silently dropped. */
  reviewPaymentStatuses: ExternalIncomePaymentStatus[];
  documentationRequired: boolean;
  cashRequiresReview: boolean;
  platformFeeTreatment: "expense" | "netted" | "review_required";
}

/**
 * Conservative fallback used only when a published pack does not declare
 * external-income rules yet: recognise paid income, require documentation,
 * and never guess anything else.
 */
export const FALLBACK_EXTERNAL_INCOME_RULES: ExternalIncomeRules = {
  recognisedPaymentStatuses: ["paid"],
  reviewPaymentStatuses: ["invoiced", "partially_paid", "expected"],
  documentationRequired: true,
  cashRequiresReview: true,
  platformFeeTreatment: "expense",
};

export function resolveExternalIncomeRules(
  rulePack: AccountingRulePack | null,
): ExternalIncomeRules {
  return rulePack?.externalIncomeRules ?? FALLBACK_EXTERNAL_INCOME_RULES;
}

// ---------------------------------------------------------------------------
// Platform payout validation (§6)
// ---------------------------------------------------------------------------

export interface PayoutValidation {
  ok: boolean;
  expectedNetMinor: number;
  differenceMinor: number;
  message: string | null;
}

export function validatePlatformPayout(payout: PlatformPayoutBreakdown): PayoutValidation {
  const expected =
    payout.grossIncomeMinor - payout.platformFeeMinor - payout.taxWithheldMinor;
  const difference = payout.netPayoutMinor - expected;
  return {
    ok: difference === 0,
    expectedNetMinor: expected,
    differenceMinor: difference,
    message: difference === 0 ? null : "Beløbene kræver kontrol",
  };
}

// ---------------------------------------------------------------------------
// Duplicate detection (§10)
// ---------------------------------------------------------------------------

export interface DuplicateMatch {
  candidateId: string;
  score: number;
  matchedOn: string[];
}

const STRONG_KEYS = ["payoutReference", "invoiceNumber", "documentHash"] as const;

function norm(value: string | null | undefined): string | null {
  const t = value?.trim().toLowerCase();
  return t ? t : null;
}

/**
 * Heuristic duplicate detection. Never blocks — it only warns, and the
 * provider must give a reason to continue.
 */
export function findPossibleDuplicates(
  candidate: ExternalIncomeInput,
  existing: ExternalIncomeInput[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const other of existing) {
    if (other.id === candidate.id || other.deletedAt) continue;
    const matchedOn: string[] = [];
    let score = 0;

    if (
      other.incomeDate === candidate.incomeDate &&
      other.originalAmountMinor === candidate.originalAmountMinor &&
      other.originalCurrency === candidate.originalCurrency
    ) {
      matchedOn.push("dato + beløb + valuta");
      score += 60;
    }
    if (norm(other.platformName) && norm(other.platformName) === norm(candidate.platformName)) {
      matchedOn.push("platform");
      score += 10;
    }
    if (
      norm(other.customerReference) &&
      norm(other.customerReference) === norm(candidate.customerReference)
    ) {
      matchedOn.push("kundereference");
      score += 15;
    }
    if (
      norm(other.payout?.payoutReference) &&
      norm(other.payout?.payoutReference) === norm(candidate.payout?.payoutReference)
    ) {
      matchedOn.push("payout reference");
      score += 40;
    }
    if (norm(other.invoiceNumber) && norm(other.invoiceNumber) === norm(candidate.invoiceNumber)) {
      matchedOn.push("fakturanummer");
      score += 40;
    }
    const sharedHash = (other.documentHashes ?? []).find((h) =>
      (candidate.documentHashes ?? []).includes(h),
    );
    if (sharedHash) {
      matchedOn.push("dokumenthash");
      score += 50;
    }

    if (score >= 50) {
      matches.push({ candidateId: other.id, score: Math.min(score, 100), matchedOn });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}

export function requiresDuplicateReason(matches: DuplicateMatch[]): boolean {
  return matches.length > 0;
}

export const DUPLICATE_WARNING_TEXT =
  "Denne indkomst ligner en post, der allerede findes";

// ---------------------------------------------------------------------------
// Evaluation (§11)
// ---------------------------------------------------------------------------

export type ExternalIncomeOutcome =
  | { outcome: "included"; amountMinor: number; platformFeeMinor: number }
  | { outcome: "excluded"; reasonCode: string; reason: string }
  | { outcome: "review_required"; reasonCode: string; reason: string };

export interface EvaluateExternalIncomeArgs {
  item: ExternalIncomeInput;
  rulePack: AccountingRulePack | null;
  jurisdiction: JurisdictionResolution;
  provider: ProviderAccountingProfile;
  accountingCurrency: string;
}

export function evaluateExternalIncomeItem({
  item,
  rulePack,
  jurisdiction,
  accountingCurrency,
}: EvaluateExternalIncomeArgs): ExternalIncomeOutcome {
  const rules = resolveExternalIncomeRules(rulePack);

  if (item.deletedAt) {
    return { outcome: "excluded", reasonCode: "deleted", reason: "Posten er slettet." };
  }

  if (item.paymentStatus === "cancelled" || item.recordStatus === "cancelled") {
    return { outcome: "excluded", reasonCode: "cancelled", reason: "Posten er annulleret." };
  }
  if (item.paymentStatus === "refunded" || item.recordStatus === "refunded") {
    return {
      outcome: "excluded",
      reasonCode: "refunded",
      reason: "Beløbet er refunderet og medregnes ikke.",
    };
  }

  if (jurisdiction.status !== "resolved" || !rulePack) {
    return {
      outcome: "review_required",
      reasonCode: "unresolved_jurisdiction",
      reason: "Landeregler kræver kontrol",
    };
  }

  if (
    item.taxJurisdiction &&
    item.taxJurisdiction.toUpperCase() !== jurisdiction.countryCode.toUpperCase()
  ) {
    return {
      outcome: "review_required",
      reasonCode: "unresolved_jurisdiction",
      reason: "Landeregler kræver kontrol",
    };
  }

  // Currency (§15)
  if (item.originalCurrency !== accountingCurrency) {
    if (!item.exchangeRate || !item.exchangeRateDate || item.accountingAmountMinor == null) {
      return {
        outcome: "review_required",
        reasonCode: "missing_exchange_rate",
        reason: "Valutakurs mangler",
      };
    }
  }
  if (item.accountingAmountMinor == null || item.accountingCurrency !== accountingCurrency) {
    return {
      outcome: "review_required",
      reasonCode: "currency_mismatch",
      reason: "Posten er ikke omregnet til regnskabsvalutaen.",
    };
  }

  // Documentation (§4, §8)
  if (rules.documentationRequired && item.documentationStatus === "missing") {
    return {
      outcome: "review_required",
      reasonCode: "missing_documentation",
      reason: "Posten mangler dokumentation.",
    };
  }
  if (item.documentationStatus === "review_required") {
    return {
      outcome: "review_required",
      reasonCode: "documentation_review",
      reason: "Dokumentationen kræver kontrol.",
    };
  }

  // Cash (§8)
  if (
    (item.incomeSourceType === "cash" || item.paymentMethod === "cash") &&
    rules.cashRequiresReview &&
    !item.cashReviewedByProvider
  ) {
    return {
      outcome: "review_required",
      reasonCode: "cash_requires_review",
      reason: "Kontant indkomst kræver kontrol, indtil du har gennemgået posten.",
    };
  }

  // Imports are never auto-approved (§9)
  if (item.importedFrom && item.recordStatus === "draft") {
    return {
      outcome: "review_required",
      reasonCode: "imported_unconfirmed",
      reason: "Importerede poster skal gennemgås, før de medregnes.",
    };
  }

  if (item.reviewRequired || item.recordStatus === "review_required") {
    return {
      outcome: "review_required",
      reasonCode: "review_required",
      reason: "Posten er markeret til kontrol.",
    };
  }

  // Platform payout arithmetic (§6)
  let platformFeeMinor = 0;
  if (item.payout) {
    const validation = validatePlatformPayout(item.payout);
    if (!validation.ok) {
      return {
        outcome: "review_required",
        reasonCode: "payout_mismatch",
        reason: "Beløbene kræver kontrol",
      };
    }
    if (rules.platformFeeTreatment === "review_required") {
      return {
        outcome: "review_required",
        reasonCode: "platform_fee_treatment",
        reason: "Platformgebyrets behandling kræver kontrol.",
      };
    }
    // Only counted once: either as an expense, or already netted in the amount.
    platformFeeMinor =
      rules.platformFeeTreatment === "expense" ? item.payout.platformFeeMinor : 0;
  }

  // Recognition by payment status (§11) — rule pack decides.
  if (!rules.recognisedPaymentStatuses.includes(item.paymentStatus)) {
    if (rules.reviewPaymentStatuses.includes(item.paymentStatus)) {
      return {
        outcome: "review_required",
        reasonCode: "payment_status_not_recognised",
        reason: `Betalingsstatus "${item.paymentStatus}" medregnes ikke automatisk efter det aktive regelsæt.`,
      };
    }
    return {
      outcome: "excluded",
      reasonCode: "payment_status_excluded",
      reason: `Betalingsstatus "${item.paymentStatus}" medregnes ikke efter det aktive regelsæt.`,
    };
  }

  return {
    outcome: "included",
    amountMinor: item.accountingAmountMinor,
    platformFeeMinor,
  };
}

export interface IncomeBySourceRow {
  sourceType: string;
  sourceName: string | null;
  amountMinor: number;
  currency: string;
}

export function groupIncomeBySource(
  rows: { sourceType: string; sourceName: string | null; amountMinor: number; currency: string }[],
): IncomeBySourceRow[] {
  const map = new Map<string, IncomeBySourceRow>();
  for (const row of rows) {
    const key = `${row.sourceType}|${row.sourceName ?? ""}|${row.currency}`;
    const existing = map.get(key);
    if (existing) {
      existing.amountMinor = sumMinor([existing.amountMinor, row.amountMinor]);
    } else {
      map.set(key, { ...row });
    }
  }
  return [...map.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}

export const EXTERNAL_INCOME_SOURCE_LABELS: Record<ExternalIncomeSourceType, string> = {
  other_platform: "Anden platform",
  own_customer: "Egen kunde",
  invoice: "Faktura",
  bank_transfer: "Bankoverførsel",
  cash: "Kontant betaling",
  other: "Anden kilde",
};

export const EXTERNAL_INCOME_PAYMENT_STATUS_LABELS: Record<
  ExternalIncomePaymentStatus,
  string
> = {
  expected: "Forventet",
  invoiced: "Faktureret",
  partially_paid: "Delvist betalt",
  paid: "Betalt",
  cancelled: "Annulleret",
  refunded: "Refunderet",
};

export const EXTERNAL_INCOME_DOCUMENTATION_LABELS: Record<
  ExternalIncomeDocumentationStatus,
  string
> = {
  missing: "Mangler dokumentation",
  uploaded: "Dokumentation uploadet",
  verified: "Dokumentation bekræftet",
  review_required: "Dokumentation kræver kontrol",
};

export const CASH_INCOME_WARNING =
  "Kontant indkomst skal stadig dokumenteres og indgå i dit regnskab efter reglerne for dit land.";

export const EXTERNAL_INCOME_RESPONSIBILITY_TEXT =
  "Du er selv ansvarlig for, at oplysningerne og dokumentationen er korrekte.";

export const INCOME_TAB_HELPER_TEXT =
  "Saml al din arbejdsindtægt ét sted — også det, du tjener uden for MyCleaner.";
