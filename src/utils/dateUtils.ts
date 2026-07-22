export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses a date string as a LOCAL date (midnight local time).
 *  `new Date('2026-05-15')` parses as UTC midnight, which shifts the calendar
 *  day for non-UTC users — date-only strings must be split into components. */
export function parseISODateLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function daysBetween(from: string, to: Date = new Date()): number {
  const fromDate = parseISODateLocal(from);
  if (!fromDate) return 0;
  // Compare calendar days (local midnights) so time-of-day never skews the count
  const fromDay = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toDay.getTime() - fromDay.getTime()) / (1000 * 60 * 60 * 24));
}

export function isOverdue(dueDate: string): boolean {
  return daysBetween(dueDate) > 0;
}

/** Classifies a principal-repayment date for list highlighting / inclusion.
 *  'overdue' = past due, 'soon' = due today..30 days out, 'later' = further out,
 *  'none' = unset. `soonWindow` is the number of days that count as "soon". */
export function principalDueStatus(
  dueDate?: string | null,
  soonWindow = 30
): 'none' | 'overdue' | 'soon' | 'later' {
  if (!dueDate) return 'none';
  const diff = daysBetween(dueDate); // today − dueDate: >0 overdue, <0 days remaining
  if (diff > 0) return 'overdue';
  const daysUntil = -diff;
  return daysUntil <= soonWindow ? 'soon' : 'later';
}

export function getDueDateForMonth(dayOfMonth: number, year: number, month: number): Date {
  // month is 0-indexed
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dayOfMonth, lastDay));
}

/** Formats a Date as YYYY-MM-DD using LOCAL date components.
 *  Must not use toISOString(): that converts to UTC and shifts local-midnight
 *  dates to the previous day for UTC+ timezones (e.g. IST). */
export function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseExcelDate(value: unknown): string {
  if (!value) return '';
  // Excel serial number
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return toISODateString(date);
  }
  if (typeof value === 'string') {
    const d = parseISODateLocal(value);
    if (d) return toISODateString(d);
  }
  return '';
}

/** Parses a "May-2026" monthYear string. Counterpart of formatMonthYear(). */
export function parseMonthYear(monthYear: string): { year: number; monthIndex: number } | null {
  const [mon, yr] = (monthYear ?? '').split('-');
  const monthIndex = MONTHS_SHORT.indexOf(mon);
  const year = parseInt(yr, 10);
  if (monthIndex < 0 || isNaN(year)) return null;
  return { year, monthIndex };
}

/** Chronological comparator for "May-2026" strings (unparseable values sort first). */
export function compareMonthYear(a: string, b: string): number {
  const pa = parseMonthYear(a);
  const pb = parseMonthYear(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  return pa.year - pb.year || pa.monthIndex - pb.monthIndex;
}
