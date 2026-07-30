import { applyBasisPoints, sumMinor } from "./money";
import {
  calculateMileage,
  calculateMixedUseExpense,
  findCategoryRule,
  resolveIndirectTaxRule,
} from "./ruleEngine";
import {
  EXTERNAL_INCOME_SOURCE_LABELS,
  evaluateExternalIncomeItem,
  groupIncomeBySource,
} from "./externalIncome";
import type {
  AccountingItem,
  CalculationInput,
  CalculationResult,
  IndirectTaxSummary,
} from "./types";
import { showIndirectTaxModule } from "./jurisdiction";

export const CALCULATION_VERSION = "accounting-calc-1.1.0";

function emptyResult(
  status: CalculationResult["status"],
  warnings: string[],
  explanationLines: string[],
  rulePackVersion: string | null,
  jurisdictionCode: string | null,
  currency: string | null,
): CalculationResult {
  return {
    preliminaryAmountToRegisterMinor: null,
    preliminaryBusinessResultMinor: null,
    indirectTaxPayableMinor: null,
    indirectTaxReceivableMinor: null,
    indirectTax: null,
    includedIncomeMinor: 0,
    includedExpensesMinor: 0,
    includedMileageAmountMinor: 0,
    myCleanerIncomeMinor: 0,
    externalIncomeMinor: 0,
    totalIncomeMinor: 0,
    includedExternalIncomeItems: [],
    excludedExternalIncomeItems: [],
    reviewRequiredExternalIncomeItems: [],
    incomeBySource: [],
    excludedItems: [],
    reviewRequiredItems: [],
    calculationVersion: CALCULATION_VERSION,
    rulePackVersion,
    jurisdictionCode,
    accountingCurrency: currency,
    status,
    warnings,
    explanationLines,
  };
}


/**
 * Authoritative preliminary calculation.
 *
 * Never invents a number: when the jurisdiction or rule pack cannot be
 * established the result is null and the caller must show
 * "Beløbet kan endnu ikke beregnes".
 */
export function calculatePreliminaryRegistrationAmount(
  input: CalculationInput,
): CalculationResult {
  const { provider, accountingPeriod, rulePack, jurisdiction } = input;

  if (jurisdiction.status !== "resolved" || !rulePack) {
    const reason =
      jurisdiction.status === "requires_review" ? jurisdiction.message : "Regelsæt mangler.";
    const status =
      jurisdiction.status === "requires_review" && jurisdiction.reasonCode === "missing_country"
        ? "missing_country_or_registration"
        : jurisdiction.status === "requires_review" &&
            (jurisdiction.reasonCode === "no_rule_pack" ||
              jurisdiction.reasonCode === "rule_pack_not_published")
          ? "cannot_calculate"
          : "rules_require_review";
    return emptyResult(
      status,
      [reason],
      [
        "Beløbet kan endnu ikke beregnes.",
        reason,
        "Kontrollér land, registreringsform og skattestatus på din profil.",
      ],
      null,
      jurisdiction.status === "resolved" ? jurisdiction.jurisdictionCode : null,
      null,
    );
  }

  if (provider.profileRequiresReview) {
    return emptyResult(
      "missing_country_or_registration",
      ["Profiloplysningerne er migreret fra ældre data og skal bekræftes."],
      [
        "Beløbet kan endnu ikke beregnes.",
        "Dine registreringsoplysninger er overført fra en tidligere version og skal bekræftes, før beregningen kan køre.",
      ],
      rulePack.rulePackVersion,
      jurisdiction.jurisdictionCode,
      jurisdiction.currency,
    );
  }

  if (!provider.registrationType || !rulePack.supportedRegistrationTypes.includes(provider.registrationType)) {
    return emptyResult(
      "missing_country_or_registration",
      ["Registreringsformen understøttes ikke af det aktive regelsæt."],
      [
        "Beløbet kan endnu ikke beregnes.",
        "Din registreringsform er ikke omfattet af den aktive regelversion for dit land.",
      ],
      rulePack.rulePackVersion,
      jurisdiction.jurisdictionCode,
      jurisdiction.currency,
    );
  }

  const currency = jurisdiction.currency;
  const excluded: AccountingItem[] = [];
  const review: AccountingItem[] = [];
  const warnings: string[] = [];
  const explanation: string[] = [];

  explanation.push(
    `Beregnet efter regelversion ${rulePack.rulePackVersion} for ${rulePack.countryCode}, gældende fra ${rulePack.effectiveFrom}${rulePack.effectiveTo ? ` til ${rulePack.effectiveTo}` : ""}.`,
  );
  explanation.push(
    `Periode: ${accountingPeriod.periodStart} – ${accountingPeriod.periodEnd} (${accountingPeriod.kind}).`,
  );

  // ---- Income -------------------------------------------------------------
  const includedIncome: number[] = [];
  for (const item of input.income) {
    if (item.accountingCurrency !== currency) {
      excluded.push({
        id: item.id,
        kind: "income",
        label: item.label,
        accountingAmountMinor: item.accountingAmountMinor,
        categoryCode: null,
        reasonCode: "currency_mismatch",
        reason: "Posten er ikke omregnet til regnskabsvalutaen.",
      });
      continue;
    }
    includedIncome.push(item.accountingAmountMinor);
  }
  const includedIncomeMinor = sumMinor(includedIncome);
  const platformFeesMinor = sumMinor(input.income.map((i) => i.platformFeeMinor));
  explanation.push(
    `Indtægter medregnet: ${includedIncome.length} af ${input.income.length}. Platformgebyrer behandles som en udgift.`,
  );

  // ---- Expenses -----------------------------------------------------------
  const includedExpenses: number[] = [platformFeesMinor];
  let inputTaxMinor = 0;
  for (const item of input.expenses) {
    if (item.accountingCurrency !== currency) {
      excluded.push({
        id: item.id,
        kind: "expense",
        label: item.label,
        accountingAmountMinor: item.accountingAmountMinor,
        categoryCode: item.categoryCode,
        reasonCode: "currency_mismatch",
        reason: "Posten er ikke omregnet til regnskabsvalutaen.",
      });
      continue;
    }
    if (item.aiSuggested && !item.approvedByProvider) {
      review.push({
        id: item.id,
        kind: "expense",
        label: item.label,
        accountingAmountMinor: item.accountingAmountMinor,
        categoryCode: item.categoryCode,
        reasonCode: "ai_suggestion_unconfirmed",
        reason: "AI-forslaget er ikke bekræftet. Automatisk godkendelse er ikke tilladt.",
      });
      continue;
    }

    const outcome = calculateMixedUseExpense({
      rulePack,
      expenseAmountMinor: item.accountingAmountMinor,
      businessUsePercentage: item.businessUsePercentage,
      categoryCode: item.categoryCode,
      registrationType: provider.registrationType,
      hasDocumentation: item.hasDocumentation,
    });

    if (outcome.outcome === "disallowed") {
      excluded.push({
        id: item.id,
        kind: "expense",
        label: item.label,
        accountingAmountMinor: item.accountingAmountMinor,
        categoryCode: item.categoryCode,
        reasonCode: "category_disallowed",
        reason: outcome.reason,
      });
      continue;
    }
    if (outcome.outcome === "review_required") {
      review.push({
        id: item.id,
        kind: "expense",
        label: item.label,
        accountingAmountMinor: item.accountingAmountMinor,
        categoryCode: item.categoryCode,
        reasonCode: "review_required",
        reason: outcome.reason,
      });
      continue;
    }

    includedExpenses.push(outcome.deductibleAmountMinor);

    // Indirect tax on the purchase side, only when the module applies.
    if (showIndirectTaxModule(rulePack, provider)) {
      const taxRule = resolveIndirectTaxRule({
        rulePack,
        transactionDate: item.transactionDate,
        serviceCountry: provider.primaryWorkCountry,
        expenseCategory: item.categoryCode,
        merchantCountry: item.merchantCountry,
        taxCode: item.taxCodeHint,
      });
      const categoryRule = findCategoryRule(rulePack, item.categoryCode);
      if (taxRule.status === "review_required") {
        review.push({
          id: `${item.id}:tax`,
          kind: "expense",
          label: item.label,
          accountingAmountMinor: item.accountingAmountMinor,
          categoryCode: item.categoryCode,
          reasonCode: "tax_review_required",
          reason: "Skattebehandlingen kræver kontrol",
        });
      } else if (
        taxRule.status === "resolved" &&
        taxRule.rateBasisPoints != null &&
        categoryRule?.indirectTaxTreatment === "deductible"
      ) {
        inputTaxMinor += applyBasisPoints(outcome.deductibleAmountMinor, taxRule.rateBasisPoints);
      }
    }
  }
  const includedExpensesMinor = sumMinor(includedExpenses);

  // ---- Mileage ------------------------------------------------------------
  let accumulated = 0;
  const includedMileage: number[] = [];
  for (const trip of input.mileage) {
    const outcome = calculateMileage({ rulePack, trip, accumulatedDistance: accumulated });
    accumulated += trip.distance;
    if (outcome.outcome === "allowed" || outcome.outcome === "partial") {
      includedMileage.push(outcome.amountMinor);
    } else if (outcome.outcome === "review_required") {
      review.push({
        id: trip.id,
        kind: "mileage",
        label: trip.label,
        accountingAmountMinor: 0,
        categoryCode: "mileage",
        reasonCode: "review_required",
        reason: outcome.reason,
      });
    } else {
      excluded.push({
        id: trip.id,
        kind: "mileage",
        label: trip.label,
        accountingAmountMinor: 0,
        categoryCode: "mileage",
        reasonCode: outcome.outcome,
        reason: outcome.reason,
      });
    }
  }
  const includedMileageAmountMinor = sumMinor(includedMileage);
  if (input.mileage.length > 0) {
    explanation.push(
      `Kørsel er behandlet efter metoden "${rulePack.mileageRules.method}" i det aktive regelsæt.`,
    );
  }

  // ---- Adjustments --------------------------------------------------------
  const adjustmentsMinor = sumMinor(
    input.adjustments
      .filter((a) => a.accountingCurrency === currency)
      .map((a) => a.accountingAmountMinor),
  );

  // ---- Indirect tax summary ----------------------------------------------
  let indirectTax: IndirectTaxSummary | null = null;
  let indirectTaxPayableMinor: number | null = null;
  let indirectTaxReceivableMinor: number | null = null;

  if (showIndirectTaxModule(rulePack, provider)) {
    const label = rulePack.indirectTaxName || rulePack.labels.indirectTaxLabel;
    if (rulePack.indirectTaxSystem === "sales_tax_like") {
      const salesRule = rulePack.defaultIndirectTaxRates[0];
      const collected = salesRule
        ? applyBasisPoints(includedIncomeMinor, salesRule.rateBasisPoints)
        : null;
      indirectTax = {
        system: "sales_tax_like",
        label,
        taxableSalesMinor: includedIncomeMinor,
        salesTaxCollectedMinor: collected ?? 0,
        exemptSalesMinor: 0,
        localTaxJurisdiction: jurisdiction.jurisdictionCode,
        estimatedLiabilityMinor: collected ?? 0,
      };
      indirectTaxPayableMinor = collected;
      indirectTaxReceivableMinor = null;
      explanation.push(
        `${label} er beregnet som en salgsskat på salget. Købsskat modregnes ikke i dette system.`,
      );
    } else {
      const outputRule = rulePack.defaultIndirectTaxRates[0];
      const outputTax = outputRule
        ? applyBasisPoints(includedIncomeMinor, outputRule.rateBasisPoints)
        : 0;
      const net = outputTax - inputTaxMinor;
      indirectTax = {
        system: "vat_like",
        label,
        outputTaxMinor: outputTax,
        inputTaxMinor,
        adjustmentsMinor: 0,
        estimatedLiabilityMinor: net,
      };
      indirectTaxPayableMinor = net > 0 ? net : 0;
      indirectTaxReceivableMinor = net < 0 ? -net : 0;
      explanation.push(
        `${label}: udgående skat minus indgående skat efter det aktive regelsæts satser.`,
      );
    }
  }

  const businessResult =
    includedIncomeMinor - includedExpensesMinor - includedMileageAmountMinor + adjustmentsMinor;

  if (review.length > 0) {
    warnings.push(`${review.length} post(er) kræver manuel kontrol og indgår ikke i beløbet.`);
  }
  if (excluded.length > 0) {
    warnings.push(`${excluded.length} post(er) er udeladt efter det aktive regelsæt.`);
  }
  if (rulePack.sampleOnly) {
    warnings.push("Regelsættet er testdata og må ikke bruges til indberetning.");
  }

  const status: CalculationResult["status"] =
    review.length > 0 ? "rules_require_review" : "ready_for_review";

  explanation.push(
    `Foreløbigt resultat = medregnede indtægter − medregnede udgifter − medregnet kørsel ± reguleringer.`,
  );

  return {
    preliminaryAmountToRegisterMinor: businessResult,
    preliminaryBusinessResultMinor: businessResult,
    indirectTaxPayableMinor,
    indirectTaxReceivableMinor,
    indirectTax,
    includedIncomeMinor,
    includedExpensesMinor,
    includedMileageAmountMinor,
    excludedItems: excluded,
    reviewRequiredItems: review,
    calculationVersion: CALCULATION_VERSION,
    rulePackVersion: rulePack.rulePackVersion,
    jurisdictionCode: jurisdiction.jurisdictionCode,
    accountingCurrency: currency,
    status,
    warnings,
    explanationLines: explanation,
  };
}
