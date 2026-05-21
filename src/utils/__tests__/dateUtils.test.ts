import { describe, it, expect } from 'vitest';
import { daysBetween, isOverdue, getDueDateForMonth, toISODateString, parseExcelDate } from '../dateUtils';

describe('daysBetween', () => {
  it('returns 0 for same day', () => {
    const today = new Date();
    expect(daysBetween(today.toISOString().split('T')[0], today)).toBe(0);
  });

  it('returns positive for a past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(daysBetween(past.toISOString().split('T')[0])).toBe(5);
  });

  it('returns negative for a future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    expect(daysBetween(future.toISOString().split('T')[0])).toBe(-3);
  });

  it('returns 0 for an invalid date string', () => {
    expect(daysBetween('not-a-date')).toBe(0);
  });
});

describe('isOverdue', () => {
  it('returns true for a past date', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  it('returns false for a future date', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isOverdue(future.toISOString().split('T')[0])).toBe(false);
  });
});

describe('getDueDateForMonth', () => {
  it('returns correct date for dueDay=22 in January 2026', () => {
    const result = getDueDateForMonth(22, 2026, 0);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(22);
  });

  it('clamps dueDay=31 to last day of February (non-leap year)', () => {
    const result = getDueDateForMonth(31, 2026, 1); // Feb 2026
    expect(result.getDate()).toBe(28);
  });

  it('clamps dueDay=31 to last day of February (leap year)', () => {
    const result = getDueDateForMonth(31, 2024, 1); // Feb 2024 (leap)
    expect(result.getDate()).toBe(29);
  });

  it('dueDay=1 → first of month', () => {
    const result = getDueDateForMonth(1, 2026, 5); // June 2026
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(5);
  });
});

describe('toISODateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const d = new Date(2026, 4, 20); // May 20 2026 local
    expect(toISODateString(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('year-month-day are correct for a UTC midnight date', () => {
    // Use Date.UTC to avoid timezone shifts (IST +5:30 would flip midnight local → prev day UTC)
    const d = new Date(Date.UTC(2026, 0, 5));
    const result = toISODateString(d);
    expect(result).toBe('2026-01-05');
  });
});

describe('parseExcelDate', () => {
  it('returns empty string for falsy input', () => {
    expect(parseExcelDate(null)).toBe('');
    expect(parseExcelDate(undefined)).toBe('');
    expect(parseExcelDate('')).toBe('');
  });

  it('parses an ISO string', () => {
    expect(parseExcelDate('2024-05-15')).toBe('2024-05-15');
  });

  it('parses Excel serial number 45000 to a date string', () => {
    const result = parseExcelDate(45000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
