import { describe, it, expect } from 'vitest';
import {
  daysBetween,
  isOverdue,
  principalDueStatus,
  getDueDateForMonth,
  toISODateString,
  parseExcelDate,
  parseISODateLocal,
  parseMonthYear,
  compareMonthYear,
  MONTHS_SHORT,
} from '../dateUtils';

describe('daysBetween', () => {
  it('returns 0 for same day', () => {
    const today = new Date();
    expect(daysBetween(toISODateString(today), today)).toBe(0);
  });

  it('returns positive for a past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(daysBetween(toISODateString(past))).toBe(5);
  });

  it('returns negative for a future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    expect(daysBetween(toISODateString(future))).toBe(-3);
  });

  it('ignores time of day — compares calendar days', () => {
    const lateEvening = new Date(2026, 4, 20, 23, 59);
    expect(daysBetween('2026-05-20', lateEvening)).toBe(0);
    expect(daysBetween('2026-05-19', lateEvening)).toBe(1);
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
    expect(isOverdue(toISODateString(future))).toBe(false);
  });
});

describe('principalDueStatus', () => {
  const iso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return toISODateString(d);
  };

  it("returns 'none' for empty / null / undefined", () => {
    expect(principalDueStatus('')).toBe('none');
    expect(principalDueStatus(null)).toBe('none');
    expect(principalDueStatus(undefined)).toBe('none');
  });

  it("returns 'overdue' for a past date", () => {
    expect(principalDueStatus(iso(-1))).toBe('overdue');
    expect(principalDueStatus('2020-01-01')).toBe('overdue');
  });

  it("returns 'soon' for today and within the 30-day window", () => {
    expect(principalDueStatus(iso(0))).toBe('soon');
    expect(principalDueStatus(iso(15))).toBe('soon');
    expect(principalDueStatus(iso(30))).toBe('soon');
  });

  it("returns 'later' beyond the window", () => {
    expect(principalDueStatus(iso(31))).toBe('later');
    expect(principalDueStatus(iso(200))).toBe('later');
  });

  it('respects a custom soon window', () => {
    expect(principalDueStatus(iso(10), 7)).toBe('later');
    expect(principalDueStatus(iso(5), 7)).toBe('soon');
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

  it('uses LOCAL date components — local midnight never shifts to the previous day', () => {
    // The old toISOString() implementation returned "2026-01-04" for this
    // input on any UTC+ timezone (e.g. IST). Must hold in every timezone.
    const d = new Date(2026, 0, 5); // Jan 5 2026, 00:00 local
    expect(toISODateString(d)).toBe('2026-01-05');
  });

  it('round-trips through parseISODateLocal', () => {
    const d = new Date(2026, 8, 30); // Sep 30 2026 local
    expect(toISODateString(parseISODateLocal(toISODateString(d))!)).toBe('2026-09-30');
  });
});

describe('parseISODateLocal', () => {
  it('parses YYYY-MM-DD as local midnight', () => {
    const d = parseISODateLocal('2026-05-15')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it('returns null for garbage', () => {
    expect(parseISODateLocal('not-a-date')).toBeNull();
  });
});

describe('parseExcelDate', () => {
  it('returns empty string for falsy input', () => {
    expect(parseExcelDate(null)).toBe('');
    expect(parseExcelDate(undefined)).toBe('');
    expect(parseExcelDate('')).toBe('');
  });

  it('parses an ISO string without shifting the day', () => {
    expect(parseExcelDate('2024-05-15')).toBe('2024-05-15');
  });

  it('parses Excel serial number 45000 to a date string', () => {
    const result = parseExcelDate(45000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseMonthYear / compareMonthYear', () => {
  it('round-trips every month of the year', () => {
    for (let m = 0; m < 12; m++) {
      const parsed = parseMonthYear(`${MONTHS_SHORT[m]}-2026`);
      expect(parsed).toEqual({ year: 2026, monthIndex: m });
    }
  });

  it('returns null for unparseable input', () => {
    expect(parseMonthYear('Sept-2026')).toBeNull(); // locale spelling, not ours
    expect(parseMonthYear('2026')).toBeNull();
    expect(parseMonthYear('')).toBeNull();
  });

  it('sorts chronologically, not alphabetically', () => {
    // Alphabetically "Apr-2026" < "Dec-2025" — chronologically it is later
    expect(compareMonthYear('Apr-2026', 'Dec-2025')).toBeGreaterThan(0);
    expect(compareMonthYear('Dec-2025', 'Apr-2026')).toBeLessThan(0);
    expect(compareMonthYear('May-2026', 'May-2026')).toBe(0);
  });

  it('orders a shuffled year correctly', () => {
    const shuffled = ['Nov-2026', 'Feb-2026', 'Sep-2026', 'Jan-2026', 'May-2026'];
    const sorted = [...shuffled].sort(compareMonthYear);
    expect(sorted).toEqual(['Jan-2026', 'Feb-2026', 'May-2026', 'Sep-2026', 'Nov-2026']);
  });
});
