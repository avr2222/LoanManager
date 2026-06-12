import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatRateAsRupees, formatDate, ordinal, formatMonthYear } from '../formatUtils';
import { parseMonthYear } from '../dateUtils';

describe('formatCurrency', () => {
  it('formats 0 as ₹0', () => {
    expect(formatCurrency(0)).toBe('₹0');
  });

  it('formats 1000 with Indian grouping', () => {
    expect(formatCurrency(1000)).toBe('₹1,000');
  });

  it('formats 100000 with Indian lakh grouping', () => {
    expect(formatCurrency(100000)).toBe('₹1,00,000');
  });

  it('formats 1000000 correctly', () => {
    expect(formatCurrency(1000000)).toBe('₹10,00,000');
  });

  it('drops decimal places', () => {
    // maximumFractionDigits: 0
    expect(formatCurrency(1500.75)).toBe('₹1,501');
  });
});

describe('formatPercent', () => {
  it('formats with 2 decimal places', () => {
    expect(formatPercent(24)).toBe('24.00%');
    expect(formatPercent(18.5)).toBe('18.50%');
  });
});

describe('formatRateAsRupees', () => {
  it('24% annual → ₹2 per ₹100/mo', () => {
    expect(formatRateAsRupees(24)).toBe('₹2 per ₹100/mo');
  });

  it('18% annual → ₹1.50 per ₹100/mo (fractional)', () => {
    expect(formatRateAsRupees(18)).toBe('₹1.50 per ₹100/mo');
  });
});

describe('ordinal', () => {
  it('1 → 1st', () => expect(ordinal(1)).toBe('1st'));
  it('2 → 2nd', () => expect(ordinal(2)).toBe('2nd'));
  it('3 → 3rd', () => expect(ordinal(3)).toBe('3rd'));
  it('4 → 4th', () => expect(ordinal(4)).toBe('4th'));
  it('11 → 11th (exception)', () => expect(ordinal(11)).toBe('11th'));
  it('12 → 12th (exception)', () => expect(ordinal(12)).toBe('12th'));
  it('13 → 13th (exception)', () => expect(ordinal(13)).toBe('13th'));
  it('21 → 21st', () => expect(ordinal(21)).toBe('21st'));
  it('22 → 22nd', () => expect(ordinal(22)).toBe('22nd'));
});

describe('formatDate', () => {
  it('returns "-" for empty string', () => {
    expect(formatDate('')).toBe('-');
  });

  it('returns "-" for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('-');
  });

  it('formats a known date in Indian locale', () => {
    // en-IN: "20 May 2026"
    const result = formatDate('2026-05-20');
    expect(result).toContain('2026');
    expect(result).toContain('May');
    expect(result).toContain('20');
  });
});

describe('formatMonthYear', () => {
  it('formats May 2026 as "May-2026"', () => {
    const d = new Date(2026, 4, 1); // May 2026
    expect(formatMonthYear(d)).toBe('May-2026');
  });

  it('formats January 2025 as "Jan-2025"', () => {
    const d = new Date(2025, 0, 15);
    expect(formatMonthYear(d)).toBe('Jan-2025');
  });

  it('formats September as "Sep", not the locale\'s "Sept"', () => {
    // toLocaleDateString-based formatting produced "Sept-2026" in modern ICU,
    // which broke parseMonthYear() and silently mis-dated September payments
    const d = new Date(2026, 8, 1);
    expect(formatMonthYear(d)).toBe('Sep-2026');
  });

  it('round-trips through parseMonthYear for all 12 months', () => {
    for (let m = 0; m < 12; m++) {
      const label = formatMonthYear(new Date(2026, m, 10));
      expect(parseMonthYear(label)).toEqual({ year: 2026, monthIndex: m });
    }
  });
});
