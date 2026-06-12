import type { Loan, Payment, DashboardKPIs } from '@/types';
import { daysBetween, getDueDateForMonth, toISODateString, parseISODateLocal } from '@/utils/dateUtils';
import { formatMonthYear } from '@/utils/formatUtils';
import { v4 as uuidv4 } from 'uuid';

type LoanInput = Omit<Loan, 'monthlyInterestRate' | 'monthlyDueDay' | 'monthlyInterestAmount' | 'mediatorMonthlyShare' | 'netMonthlyReceipt' | 'updatedAt'>;

export function deriveLoanFields(input: LoanInput): Loan {
  const monthlyInterestRate = input.annualInterestRate / 12;
  const monthlyInterestAmount = (input.principalAmount * monthlyInterestRate) / 100;
  const mediatorMonthlyShare =
    input.loanType === 'Through Mediator'
      ? (monthlyInterestAmount * (input.mediatorCommissionPct ?? 0)) / 100
      : 0;
  const netMonthlyReceipt = monthlyInterestAmount - mediatorMonthlyShare;
  const dateObj = input.dateGiven ? parseISODateLocal(input.dateGiven) : new Date();
  const monthlyDueDay = dateObj?.getDate() ?? 1;

  return {
    ...input,
    monthlyInterestRate,
    monthlyDueDay,
    monthlyInterestAmount,
    mediatorMonthlyShare,
    netMonthlyReceipt,
    updatedAt: new Date().toISOString(),
  };
}

export function derivePaymentFields(payment: Payment): Payment {
  const today = new Date();
  const daysOverdue =
    payment.paymentStatus === 'Received' || payment.paymentStatus === 'Waived'
      ? 0
      : Math.max(0, daysBetween(payment.dueDate, today));

  const pendingAmount =
    payment.paymentStatus === 'Received' || payment.paymentStatus === 'Waived'
      ? 0
      : Math.max(0, payment.netAmountExpected - payment.amountReceived);

  return { ...payment, daysOverdue, pendingAmount };
}

export function generateMonthlyPayment(loan: Loan, year: number, month: number): Payment {
  const dueDate = getDueDateForMonth(loan.monthlyDueDay, year, month);
  const monthYear = formatMonthYear(dueDate);
  const now = new Date().toISOString();

  const payment: Payment = {
    id: uuidv4(),
    loanId: loan.loanId,
    borrowerName: loan.borrowerName,
    monthYear,
    dueDate: toISODateString(dueDate),
    interestAmount: loan.monthlyInterestAmount,
    mediatorShare: loan.mediatorMonthlyShare,
    netAmountExpected: loan.netMonthlyReceipt,
    amountReceived: 0,
    dateReceived: '',
    paymentStatus: 'Pending',
    daysOverdue: 0,
    pendingAmount: loan.netMonthlyReceipt,
    remarks: '',
    createdAt: now,
    updatedAt: now,
  };

  return derivePaymentFields(payment);
}

/** Overdue = past due and money still outstanding (Pending/Partial/Claimed).
 *  Single source of truth — Sidebar badges and table filters use the same rule. */
export function isOverduePayment(p: Pick<Payment, 'daysOverdue' | 'paymentStatus'>): boolean {
  return p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived';
}

export function computeKPIs(loans: Loan[], payments: Payment[]): DashboardKPIs {
  const activeLoans = loans.filter((l) => l.loanStatus === 'Active');
  const overduePayments = payments.filter(isOverduePayment);

  return {
    totalActiveLoans: activeLoans.length,
    totalPrincipalOutstanding: activeLoans.reduce((s, l) => s + l.principalAmount, 0),
    monthlyInterestExpected: activeLoans.reduce((s, l) => s + l.monthlyInterestAmount, 0),
    netMonthlyIncome: activeLoans.reduce((s, l) => s + l.netMonthlyReceipt, 0),
    totalOverduePayments: overduePayments.length,
    totalPendingAmount: overduePayments.reduce((s, p) => s + p.pendingAmount, 0),
  };
}
