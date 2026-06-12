import { MONTHS_SHORT, parseISODateLocal } from './dateUtils';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** Converts annual interest rate % → "₹X / ₹100 / mo"
 *  e.g. 24% → monthly rate = 2% → ₹2 per ₹100
 *       18% → 1.5% → ₹1.50 per ₹100
 */
export function formatRateAsRupees(annualPct: number): string {
  const monthly = annualPct / 12;
  const paise = monthly % 1 !== 0;
  return `₹${paise ? monthly.toFixed(2) : monthly.toFixed(0)} per ₹100/mo`;
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return '-';
  const d = parseISODateLocal(isoDate);
  if (!d) return '-';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Formats as "May-2026". Locale-independent: toLocaleDateString renders
 *  September as "Sept" in modern ICU (and may emit non-breaking spaces),
 *  which breaks parseMonthYear() round-trips. */
export function formatMonthYear(date: Date): string {
  return `${MONTHS_SHORT[date.getMonth()]}-${date.getFullYear()}`;
}
