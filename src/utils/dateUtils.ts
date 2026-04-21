export function daysBetween(from: string, to: Date = new Date()): number {
  const fromDate = new Date(from);
  if (isNaN(fromDate.getTime())) return 0;
  const diff = to.getTime() - fromDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function isOverdue(dueDate: string): boolean {
  return daysBetween(dueDate) > 0;
}

export function getDueDateForMonth(dayOfMonth: number, year: number, month: number): Date {
  // month is 0-indexed
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dayOfMonth, lastDay));
}

export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
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
    const d = new Date(value);
    if (!isNaN(d.getTime())) return toISODateString(d);
  }
  return '';
}
