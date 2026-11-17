import { useCallback } from 'react';
import type { Loan } from '@/types';
import { useLoans } from '@/context/LoanContext';
import { usePayments } from '@/context/PaymentContext';
import { repricePendingPayments } from '@/services/calculationService';
import { toISODateString } from '@/utils/dateUtils';

export interface UpdateLoanResult {
  /** Pending payments whose amounts were brought in line with the new terms */
  repricedCount: number;
  /** True when the loan was saved but the pending payments could not be updated */
  repriceFailed: boolean;
}

/**
 * Saves an edited loan and, when its monthly amounts changed (principal, rate
 * or mediator commission), updates the untouched pending payments due today or
 * later so they don't keep showing the old amounts.
 */
export function useUpdateLoan() {
  const { loans, updateLoan } = useLoans();
  const { payments, savePayments } = usePayments();

  return useCallback(async (loan: Loan): Promise<UpdateLoanResult> => {
    const before = loans.find((l) => l.loanId === loan.loanId);
    const updated = await updateLoan(loan);

    const amountsChanged =
      !!before && (
        before.monthlyInterestAmount !== updated.monthlyInterestAmount ||
        before.mediatorMonthlyShare !== updated.mediatorMonthlyShare ||
        before.netMonthlyReceipt !== updated.netMonthlyReceipt
      );
    if (!amountsChanged) return { repricedCount: 0, repriceFailed: false };

    const repriced = repricePendingPayments(updated, payments, {
      from: toISODateString(new Date()),
      inclusive: true,
    });
    if (repriced.length === 0) return { repricedCount: 0, repriceFailed: false };

    try {
      await savePayments(repriced);
      return { repricedCount: repriced.length, repriceFailed: false };
    } catch (err) {
      console.warn('[UpdateLoan] Loan saved, but pending payments could not be re-priced:', err);
      return { repricedCount: 0, repriceFailed: true };
    }
  }, [loans, payments, updateLoan, savePayments]);
}
