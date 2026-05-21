import { describe, it, expect } from 'vitest';
import { deriveLoanFields, derivePaymentFields, generateMonthlyPayment, computeKPIs } from '../calculationService';
import { getDueDateForMonth, toISODateString } from '@/utils/dateUtils';
import type { Loan, Payment } from '@/types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    loanId: 'L001',
    lenderName: 'Admin',
    lenderPhone: '9999999999',
    borrowerName: 'Test Borrower',
    borrowerPhone: '8888888888',
    borrowerAddress: 'Hyderabad',
    loanType: 'Direct',
    mediatorName: '',
    mediatorPhone: '',
    mediatorCommissionPct: 0,
    principalAmount: 100000,
    annualInterestRate: 24,
    monthlyInterestRate: 2,
    dateGiven: '2024-01-15',
    monthlyDueDay: 15,
    expectedTenureMonths: 12,
    monthlyInterestAmount: 2000,
    mediatorMonthlyShare: 0,
    netMonthlyReceipt: 2000,
    loanStatus: 'Active',
    remarks: '',
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-001',
    loanId: 'L001',
    borrowerName: 'Test Borrower',
    monthYear: 'Apr-2026',
    dueDate: '2026-04-15',
    interestAmount: 2000,
    mediatorShare: 0,
    netAmountExpected: 2000,
    amountReceived: 0,
    dateReceived: '',
    paymentStatus: 'Pending',
    daysOverdue: 0,
    pendingAmount: 2000,
    remarks: '',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── deriveLoanFields ───────────────────────────────────────────────────────

describe('deriveLoanFields', () => {
  it('calculates monthlyInterestAmount for a direct loan', () => {
    const result = deriveLoanFields(makeLoan({ principalAmount: 100000, annualInterestRate: 24 }));
    // 100000 × 24 / 12 / 100 = 2000
    expect(result.monthlyInterestAmount).toBe(2000);
  });

  it('sets mediatorMonthlyShare = 0 for Direct loans', () => {
    const result = deriveLoanFields(makeLoan({ loanType: 'Direct', mediatorCommissionPct: 50 }));
    expect(result.mediatorMonthlyShare).toBe(0);
  });

  it('calculates mediatorMonthlyShare for Through Mediator loans', () => {
    const result = deriveLoanFields(makeLoan({
      loanType: 'Through Mediator',
      principalAmount: 100000,
      annualInterestRate: 24,
      mediatorCommissionPct: 50,
    }));
    // monthlyInterest = 2000, mediatorShare = 2000 × 50% = 1000
    expect(result.mediatorMonthlyShare).toBe(1000);
    expect(result.netMonthlyReceipt).toBe(1000);
  });

  it('netMonthlyReceipt = monthlyInterestAmount for Direct loans', () => {
    const result = deriveLoanFields(makeLoan({ loanType: 'Direct', principalAmount: 50000, annualInterestRate: 18 }));
    expect(result.netMonthlyReceipt).toBe(result.monthlyInterestAmount);
  });

  it('derives monthlyDueDay from dateGiven', () => {
    const result = deriveLoanFields(makeLoan({ dateGiven: '2024-05-22' }));
    expect(result.monthlyDueDay).toBe(22);
  });

  it('handles fractional interest rates correctly', () => {
    // 18% annual → 1.5% monthly → 100000 × 1.5 / 100 = 1500
    const result = deriveLoanFields(makeLoan({ principalAmount: 100000, annualInterestRate: 18 }));
    expect(result.monthlyInterestAmount).toBe(1500);
  });
});

// ─── derivePaymentFields ────────────────────────────────────────────────────

describe('derivePaymentFields', () => {
  it('Received status → daysOverdue = 0 and pendingAmount = 0', () => {
    const result = derivePaymentFields(makePayment({
      paymentStatus: 'Received',
      amountReceived: 2000,
      dueDate: '2020-01-01', // far in the past
    }));
    expect(result.daysOverdue).toBe(0);
    expect(result.pendingAmount).toBe(0);
  });

  it('Waived status → daysOverdue = 0 and pendingAmount = 0', () => {
    const result = derivePaymentFields(makePayment({
      paymentStatus: 'Waived',
      dueDate: '2020-01-01',
    }));
    expect(result.daysOverdue).toBe(0);
    expect(result.pendingAmount).toBe(0);
  });

  it('Pending with a past dueDate → daysOverdue > 0', () => {
    const result = derivePaymentFields(makePayment({
      paymentStatus: 'Pending',
      dueDate: '2020-01-01',
      amountReceived: 0,
    }));
    expect(result.daysOverdue).toBeGreaterThan(0);
  });

  it('Pending with a future dueDate → daysOverdue = 0', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const result = derivePaymentFields(makePayment({
      paymentStatus: 'Pending',
      dueDate: futureDate.toISOString().split('T')[0],
    }));
    expect(result.daysOverdue).toBe(0);
  });

  it('Partial payment → pendingAmount = netAmountExpected − amountReceived', () => {
    const result = derivePaymentFields(makePayment({
      paymentStatus: 'Partial',
      netAmountExpected: 2000,
      amountReceived: 800,
      dueDate: '2026-04-15',
    }));
    expect(result.pendingAmount).toBe(1200);
  });

  it('netAmountExpected is preserved (not recalculated)', () => {
    const payment = makePayment({ netAmountExpected: 1500, paymentStatus: 'Received', amountReceived: 1500 });
    const result = derivePaymentFields(payment);
    expect(result.netAmountExpected).toBe(1500);
  });
});

// ─── generateMonthlyPayment ─────────────────────────────────────────────────

describe('generateMonthlyPayment', () => {
  it('returns correct monthYear string', () => {
    const loan = makeLoan({ monthlyDueDay: 15 });
    const result = generateMonthlyPayment(loan, 2026, 4); // May 2026 (month is 0-indexed)
    expect(result.monthYear).toBe('May-2026');
  });

  it('dueDate matches loan monthlyDueDay for the given month', () => {
    const loan = makeLoan({ monthlyDueDay: 22 });
    const result = generateMonthlyPayment(loan, 2026, 0); // Jan 2026
    // Derive expected the same way the code does (avoids timezone shift assumptions)
    const expected = toISODateString(getDueDateForMonth(22, 2026, 0));
    expect(result.dueDate).toBe(expected);
    // Also verify the local date components are correct
    const localDate = getDueDateForMonth(22, 2026, 0);
    expect(localDate.getDate()).toBe(22);
    expect(localDate.getMonth()).toBe(0);
  });

  it('clamps dueDay to last day of month (Feb)', () => {
    const loan = makeLoan({ monthlyDueDay: 31 });
    const result = generateMonthlyPayment(loan, 2026, 1); // Feb 2026
    const expected = toISODateString(getDueDateForMonth(31, 2026, 1));
    expect(result.dueDate).toBe(expected);
    // Verify the local date is Feb 28
    const localDate = getDueDateForMonth(31, 2026, 1);
    expect(localDate.getDate()).toBe(28);
    expect(localDate.getMonth()).toBe(1);
  });

  it('defaults to Pending status and 0 amountReceived', () => {
    const loan = makeLoan();
    const result = generateMonthlyPayment(loan, 2026, 4);
    expect(result.paymentStatus).toBe('Pending');
    expect(result.amountReceived).toBe(0);
  });

  it('copies interestAmount and netAmountExpected from loan', () => {
    const loan = makeLoan({ monthlyInterestAmount: 1500, netMonthlyReceipt: 1200, mediatorMonthlyShare: 300 });
    const result = generateMonthlyPayment(loan, 2026, 4);
    expect(result.interestAmount).toBe(1500);
    expect(result.netAmountExpected).toBe(1200);
    expect(result.mediatorShare).toBe(300);
  });
});

// ─── computeKPIs ───────────────────────────────────────────────────────────

describe('computeKPIs', () => {
  it('counts only Active loans', () => {
    const loans = [
      makeLoan({ loanId: 'L001', loanStatus: 'Active' }),
      makeLoan({ loanId: 'L002', loanStatus: 'Closed' }),
    ];
    const result = computeKPIs(loans, []);
    expect(result.totalActiveLoans).toBe(1);
  });

  it('sums principalAmount for Active loans only', () => {
    const loans = [
      makeLoan({ loanId: 'L001', loanStatus: 'Active', principalAmount: 100000 }),
      makeLoan({ loanId: 'L002', loanStatus: 'Active', principalAmount: 50000 }),
      makeLoan({ loanId: 'L003', loanStatus: 'Closed', principalAmount: 200000 }),
    ];
    const result = computeKPIs(loans, []);
    expect(result.totalPrincipalOutstanding).toBe(150000);
  });

  it('counts overdue as Pending payments with daysOverdue > 0', () => {
    const payments = [
      makePayment({ id: 'p1', paymentStatus: 'Pending', daysOverdue: 5 }),
      makePayment({ id: 'p2', paymentStatus: 'Pending', daysOverdue: 0 }),
      makePayment({ id: 'p3', paymentStatus: 'Received', daysOverdue: 0 }),
    ];
    const result = computeKPIs([], payments);
    expect(result.totalOverduePayments).toBe(1);
  });

  it('sums pendingAmount for overdue payments only', () => {
    const payments = [
      makePayment({ id: 'p1', paymentStatus: 'Pending', daysOverdue: 5, pendingAmount: 1000 }),
      makePayment({ id: 'p2', paymentStatus: 'Pending', daysOverdue: 0, pendingAmount: 500 }),
    ];
    const result = computeKPIs([], payments);
    expect(result.totalPendingAmount).toBe(1000);
  });
});
