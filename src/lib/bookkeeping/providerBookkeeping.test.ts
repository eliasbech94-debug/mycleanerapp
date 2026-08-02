import { describe, expect, it } from 'vitest';
import {
  calculateExpenseAmounts,
  calculateMonthlyBookkeeping,
} from './providerBookkeeping';

describe('provider bookkeeping', () => {
  it('calculates VAT, net amount and deductible amount', () => {
    expect(
      calculateExpenseAmounts({
        grossAmount: 1250,
        vatAmount: 250,
        deductiblePercentage: 80,
      }),
    ).toEqual({
      grossAmount: 1250,
      vatAmount: 250,
      netAmount: 1000,
      deductiblePercentage: 80,
      deductibleAmount: 1000,
    });
  });

  it('calculates the preliminary amount to register', () => {
    expect(
      calculateMonthlyBookkeeping({
        providerIncome: 18400,
        approvedDeductibleExpenses: 3200,
        estimatedMileageAmount: 900,
      }).preliminaryAmountToRegister,
    ).toBe(14300);
  });

  it('marks the overview as pending when receipts need review', () => {
    expect(
      calculateMonthlyBookkeeping({
        providerIncome: 10000,
        approvedDeductibleExpenses: 1000,
        pendingExpensesCount: 1,
      }),
    ).toMatchObject({
      preliminaryAmountToRegister: 9000,
      hasPendingItems: true,
    });
  });

  it('rejects an invalid deductible percentage', () => {
    expect(() =>
      calculateExpenseAmounts({ grossAmount: 100, deductiblePercentage: 101 }),
    ).toThrow('deductiblePercentage must be between 0 and 100');
  });
});
