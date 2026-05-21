import { describe, it, expect } from 'vitest';
import { generateLoanId } from '../idUtils';
import type { Loan } from '@/types';

function stub(loanId: string): Loan {
  return { loanId } as Loan;
}

describe('generateLoanId', () => {
  it('returns L001 for empty list', () => {
    expect(generateLoanId([])).toBe('L001');
  });

  it('returns next sequential ID', () => {
    expect(generateLoanId([stub('L001'), stub('L002')])).toBe('L003');
  });

  it('pads to 3 digits', () => {
    const loans = Array.from({ length: 9 }, (_, i) => stub(`L00${i + 1}`));
    expect(generateLoanId(loans)).toBe('L010');
  });

  it('finds max even with gaps', () => {
    // L001, L003, L005 → max is 5 → next is L006
    expect(generateLoanId([stub('L001'), stub('L003'), stub('L005')])).toBe('L006');
  });

  it('handles non-standard IDs gracefully (ignores NaN)', () => {
    expect(generateLoanId([stub('L001'), stub('INVALID')])).toBe('L002');
  });
});
