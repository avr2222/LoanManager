import type { Loan, Payment, DashboardKPIs } from '@/types';
import { daysBetween, getDueDateForMonth, toISODateString, parseISODateLocal } from '@/utils/dateUtils';
import { formatMonthYear } from '@/utils/formatUtils';
import { v4 as uuidv4 } from 'uuid';

// ── Monthly payment auto-generation ───────────────────────────────────────────
// Generates payment entries forward for every active loan, skipping months that
// already exist OR were intentionally deleted. Safe to call on every load.

/** Floor for auto-generation: never create rows before this month. Long-standing
 *  loans (whose earlier history was imported from Excel) don't back-fill years. */
export const AUTO_GEN_FROM = new Date(2026, 4, 1); // May 1, 2026 — month is 0-indexed

/** Absolute month index (year*12 + monthIndex) for easy comparison. */
function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

/** Month index of a loan's FIRST interest payment: the month AFTER dateGiven
 *  (following-month convention). Blank/invalid dateGiven falls back to the floor. */
function firstInterestMonthIndex(loan: Loan): number {
  const d = loan.dateGiven ? parseISODateLocal(loan.dateGiven) : null;
  if (!d) return monthIndex(AUTO_GEN_FROM.getFullYear(), AUTO_GEN_FROM.getMonth());
  return monthIndex(d.getFullYear(), d.getMonth()) + 1; // +1 month = following month
}

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

/**
 * Build the payment rows that are missing for the given active loans.
 *
 * Generates from each loan's first interest month (the month after dateGiven,
 * but never before AUTO_GEN_FROM) up to one month ahead of today. Skips any
 * month that already exists OR was intentionally deleted (`deletedKeys`), so
 * deleting a payment doesn't cause it to regenerate. Idempotent.
 *
 * @param deletedKeys `${loanId}::${monthYear}` of soft-deleted payments to never recreate.
 */
export function buildMissingPayments(
  loans: Loan[],
  existingPayments: Payment[],
  deletedKeys: Set<string> = new Set(),
): Payment[] {
  const have = new Set(existingPayments.map((p) => `${p.loanId}::${p.monthYear}`));
  for (const k of deletedKeys) have.add(k); // never regenerate a deliberately-deleted month

  const now   = new Date();
  const ahead = new Date(now);
  ahead.setMonth(ahead.getMonth() + 1); // generate 1 month ahead; handles Dec→Jan rollover
  const aheadIdx = monthIndex(ahead.getFullYear(), ahead.getMonth());
  const floorIdx = monthIndex(AUTO_GEN_FROM.getFullYear(), AUTO_GEN_FROM.getMonth());

  const result: Payment[] = [];

  for (const loan of loans) {
    if (loan.loanStatus !== 'Active') continue;

    // Start no earlier than the floor, and no earlier than the loan's own first month.
    let idx = Math.max(floorIdx, firstInterestMonthIndex(loan));

    while (idx <= aheadIdx) {
      const yr = Math.floor(idx / 12);
      const mo = idx % 12;
      const p = generateMonthlyPayment(loan, yr, mo);
      if (!have.has(`${loan.loanId}::${p.monthYear}`)) {
        result.push(p);
        have.add(`${loan.loanId}::${p.monthYear}`);
      }
      idx++;
    }
  }

  return result;
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
