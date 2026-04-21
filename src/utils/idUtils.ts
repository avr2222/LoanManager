import type { Loan } from '@/types';

export function generateLoanId(existingLoans: Loan[]): string {
  if (existingLoans.length === 0) return 'L001';
  const nums = existingLoans
    .map((l) => parseInt(l.loanId.replace('L', ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `L${String(max + 1).padStart(3, '0')}`;
}
