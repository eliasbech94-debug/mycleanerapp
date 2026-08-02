export type ExpenseStatus = 'draft' | 'needs_review' | 'approved' | 'rejected';

export interface ProviderExpenseInput {
  grossAmount: number;
  vatAmount?: number | null;
  deductiblePercentage?: number;
}

export interface ProviderMonthlyBookkeepingInput {
  providerIncome: number;
  approvedDeductibleExpenses: number;
  estimatedMileageAmount?: number;
  pendingExpensesCount?: number;
  pendingMileageTrips?: number;
}

export interface ProviderMonthlyBookkeepingResult {
  preliminaryAmountToRegister: number;
  hasPendingItems: boolean;
  warning: string;
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateExpenseAmounts(input: ProviderExpenseInput) {
  if (!Number.isFinite(input.grossAmount) || input.grossAmount < 0) {
    throw new Error('grossAmount must be a non-negative number');
  }

  const deductiblePercentage = input.deductiblePercentage ?? 100;
  if (!Number.isFinite(deductiblePercentage) || deductiblePercentage < 0 || deductiblePercentage > 100) {
    throw new Error('deductiblePercentage must be between 0 and 100');
  }

  const vatAmount = input.vatAmount ?? null;
  if (vatAmount !== null && (!Number.isFinite(vatAmount) || vatAmount < 0 || vatAmount > input.grossAmount)) {
    throw new Error('vatAmount must be between 0 and grossAmount');
  }

  return {
    grossAmount: roundMoney(input.grossAmount),
    vatAmount: vatAmount === null ? null : roundMoney(vatAmount),
    netAmount: vatAmount === null ? null : roundMoney(input.grossAmount - vatAmount),
    deductiblePercentage,
    deductibleAmount: roundMoney(input.grossAmount * (deductiblePercentage / 100)),
  };
}

export function calculateMonthlyBookkeeping(
  input: ProviderMonthlyBookkeepingInput,
): ProviderMonthlyBookkeepingResult {
  const values = [
    input.providerIncome,
    input.approvedDeductibleExpenses,
    input.estimatedMileageAmount ?? 0,
  ];

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Bookkeeping amounts must be non-negative finite numbers');
  }

  const preliminaryAmountToRegister = roundMoney(
    input.providerIncome
      - input.approvedDeductibleExpenses
      - (input.estimatedMileageAmount ?? 0),
  );

  const hasPendingItems =
    (input.pendingExpensesCount ?? 0) > 0 || (input.pendingMileageTrips ?? 0) > 0;

  return {
    preliminaryAmountToRegister,
    hasPendingItems,
    warning: hasPendingItems
      ? 'Beløbet er foreløbigt, fordi der stadig er bilag eller kørsel til godkendelse.'
      : 'Beløbet er et foreløbigt regnskabsestimat og ikke en endelig skatteindberetning.',
  };
}
