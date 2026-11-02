import { describe, it, expect } from 'vitest';
import type { Loan } from '@/types';
import {
  partyKey, buildPartyOptions, matchesPartyFilters, hasPartyFilters,
  DIRECT_KEY, EMPTY_PARTY_FILTERS,
} from '../partyFilters';

function loan(overrides: Partial<Loan>): Loan {
  return {
    loanId: 'L001', borrowerName: 'Borrower', borrowerPhone: '', borrowerAddress: '',
    loanType: 'Direct', mediatorName: '', mediatorPhone: '', mediatorCommissionPct: 0,
    principalAmount: 100000, annualInterestRate: 24, monthlyInterestRate: 2,
    dateGiven: '2026-01-01', monthlyDueDay: 1, expectedTenureMonths: 12,
    monthlyInterestAmount: 2000, mediatorMonthlyShare: 0, netMonthlyReceipt: 2000,
    loanStatus: 'Active', remarks: '', createdAt: '', updatedAt: '',
    ...overrides,
  };
}

const direct   = loan({ loanId: 'L001', borrowerName: 'Ramesh', borrowerPhone: '9000000001', lenderName: 'Prasad', lenderPhone: '9111111111' });
const viaRavi  = loan({ loanId: 'L002', borrowerName: 'Suresh', borrowerPhone: '+91 90000 00002', loanType: 'Through Mediator', mediatorName: 'Ravi', mediatorPhone: '9876543210' });
const viaRavi2 = loan({ loanId: 'L003', borrowerName: 'Ramesh', borrowerPhone: '9000000001', loanType: 'Through Mediator', mediatorName: 'Ravi K', mediatorPhone: '09876543210', lenderName: 'Prasad', lenderPhone: '9111111111' });
const noPhone  = loan({ loanId: 'L004', borrowerName: 'Kiran', borrowerPhone: '', loanType: 'Through Mediator', mediatorName: 'Gopal', mediatorPhone: '' });
const loans = [direct, viaRavi, viaRavi2, noPhone];

describe('partyKey', () => {
  it('uses the last 10 phone digits, ignoring formatting', () => {
    expect(partyKey('X', '+91 98765-43210')).toBe('9876543210');
  });
  it('falls back to the lower-cased name when there is no phone', () => {
    expect(partyKey('  Gopal ', '')).toBe('name:gopal');
  });
  it('is empty when neither is known', () => {
    expect(partyKey('', undefined)).toBe('');
  });
});

describe('buildPartyOptions', () => {
  const noProfiles = new Map<string, string>();

  it('lists each borrower once, sorted by name', () => {
    expect(buildPartyOptions(loans, 'borrower', noProfiles).map((o) => o.label)).toEqual(['Kiran', 'Ramesh', 'Suresh']);
  });

  it('only lists mediators of mediated loans, merging the same phone', () => {
    const opts = buildPartyOptions(loans, 'mediator', noProfiles);
    expect(opts.map((o) => o.key)).toEqual(['name:gopal', '9876543210']);
  });

  it('prefers the registered profile name', () => {
    const opts = buildPartyOptions(loans, 'mediator', new Map([['9876543210', 'Ravi Kumar']]));
    expect(opts.find((o) => o.key === '9876543210')?.label).toBe('Ravi Kumar');
  });

  it('skips loans with no lender set', () => {
    expect(buildPartyOptions(loans, 'lender', noProfiles)).toEqual([{ key: '9111111111', label: 'Prasad' }]);
  });

  it('adds the phone when two people share a name', () => {
    const twins = [
      loan({ loanId: 'A', borrowerName: 'Raju', borrowerPhone: '9000000011' }),
      loan({ loanId: 'B', borrowerName: 'Raju', borrowerPhone: '9000000022' }),
    ];
    expect(buildPartyOptions(twins, 'borrower', noProfiles).map((o) => o.label))
      .toEqual(['Raju · 9000000011', 'Raju · 9000000022']);
  });
});

describe('matchesPartyFilters', () => {
  const ids = (f: typeof EMPTY_PARTY_FILTERS) => loans.filter((l) => matchesPartyFilters(l, f)).map((l) => l.loanId);

  it('passes everything when no filter is set', () => {
    expect(ids(EMPTY_PARTY_FILTERS)).toEqual(['L001', 'L002', 'L003', 'L004']);
  });

  it('filters by mediator phone', () => {
    expect(ids({ ...EMPTY_PARTY_FILTERS, mediator: '9876543210' })).toEqual(['L002', 'L003']);
  });

  it('filters by mediator name when the mediator has no phone', () => {
    expect(ids({ ...EMPTY_PARTY_FILTERS, mediator: 'name:gopal' })).toEqual(['L004']);
  });

  it('"direct" keeps only loans without a mediator', () => {
    expect(ids({ ...EMPTY_PARTY_FILTERS, mediator: DIRECT_KEY })).toEqual(['L001']);
  });

  it('combines borrower and mediator', () => {
    expect(ids({ ...EMPTY_PARTY_FILTERS, borrower: '9000000001', mediator: '9876543210' })).toEqual(['L003']);
  });

  it('filters by lender', () => {
    expect(ids({ ...EMPTY_PARTY_FILTERS, lender: '9111111111' })).toEqual(['L001', 'L003']);
  });

  it('drops payments whose loan is unknown once a filter is active', () => {
    expect(matchesPartyFilters(undefined, EMPTY_PARTY_FILTERS)).toBe(true);
    expect(matchesPartyFilters(undefined, { ...EMPTY_PARTY_FILTERS, borrower: '9000000001' })).toBe(false);
  });

  it('hasPartyFilters reports any active filter', () => {
    expect(hasPartyFilters(EMPTY_PARTY_FILTERS)).toBe(false);
    expect(hasPartyFilters({ ...EMPTY_PARTY_FILTERS, lender: 'x' })).toBe(true);
  });
});
