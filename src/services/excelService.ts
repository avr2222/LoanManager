import * as XLSX from 'xlsx';
import type { Loan, Payment, LoanType, LoanStatus, PaymentStatus } from '@/types';
import { deriveLoanFields, derivePaymentFields, isOverduePayment } from './calculationService';
import { parseExcelDate, toISODateString, compareMonthYear } from '@/utils/dateUtils';
import { formatDate } from '@/utils/formatUtils';

interface ImportResult {
  loans: Loan[];
  payments: Payment[];
  /** Human-readable notes about rows that needed coercion, generated IDs, or were dropped */
  warnings: string[];
}

// ── Fuzzy column lookup ───────────────────────────────────────────────────────
// Normalise a string to lowercase alphanumeric only so that differences in
// spacing, punctuation, currency symbols (₹) and capitalisation are ignored.

function norm(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Return the value from `row` whose key best matches any of the `candidates`.
function col(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const normCandidates = candidates.map(norm);
  for (const key of Object.keys(row)) {
    if (normCandidates.includes(norm(key))) return row[key];
  }
  // Partial match fallback: return first key that contains any candidate substring
  for (const key of Object.keys(row)) {
    const nk = norm(key);
    if (normCandidates.some((c) => nk.includes(c) || c.includes(nk))) return row[key];
  }
  return '';
}

function str(v: unknown): string { return String(v ?? '').trim(); }
function num(v: unknown): number { return parseFloat(String(v ?? '0').replace(/[^0-9.-]/g, '')) || 0; }
function int(v: unknown): number { return parseInt(String(v ?? '0')) || 0; }

// Like num(), but records a warning instead of silently importing garbage as 0
function numWarn(v: unknown, field: string, rowNo: number, warnings: string[]): number {
  const s = str(v);
  if (!s) return 0;
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) {
    warnings.push(`Loan row ${rowNo}: "${field}" value "${s}" is not a number — imported as 0`);
    return 0;
  }
  return n;
}

// ── Header row detection ──────────────────────────────────────────────────────

function findHeaderRow(ws: XLSX.WorkSheet): number {
  const ref = ws['!ref'];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  // The header row is the first row with 3+ non-empty cells in the first 10 columns.
  // Title/subtitle rows have only 1 merged cell; header rows have many distinct cells.
  for (let r = range.s.r; r <= Math.min(range.s.r + 6, range.e.r); r++) {
    let filled = 0;
    for (let c = range.s.c; c <= Math.min(range.s.c + 9, range.e.c); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v !== '' && cell.v !== null && cell.v !== undefined) filled++;
    }
    if (filled >= 3) return r;
  }
  return 0;
}

function getSheetRows(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  let ws = wb.Sheets[sheetName];
  if (!ws) {
    const match = wb.SheetNames.find((n) => n.toLowerCase().includes(sheetName.toLowerCase()));
    if (match) ws = wb.Sheets[match];
  }
  if (!ws) return [];

  const headerRow = findHeaderRow(ws);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
    range: headerRow,
  });
  console.log(`[Excel] "${sheetName}" → headerRow:${headerRow}, rows:${rows.length}, keys:`, Object.keys(rows[0] ?? {}).slice(0, 5));
  return rows;
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importFromExcel(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  console.log('[Excel] Sheet names:', wb.SheetNames);

  const warnings: string[] = [];
  const loans = parseLoans(wb, warnings);
  const payments = parsePayments(wb, loans, warnings);

  console.log('[Excel] Parsed totals →', loans.length, 'loans,', payments.length, 'payments,', warnings.length, 'warnings');
  return { loans, payments, warnings };
}

// ── Loan Master ───────────────────────────────────────────────────────────────

function parseLoans(wb: XLSX.WorkBook, warnings: string[]): Loan[] {
  const rows = getSheetRows(wb, 'Loan Master');
  const now = new Date().toISOString();
  const loans: Loan[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 1;
    // Use fuzzy lookup for borrower name — skip empty / formula-result rows
    const borrowerName = str(col(row, 'Borrower Full Name', 'Borrower Name', 'BorrowerName', 'Name'));
    if (!borrowerName || borrowerName === '0') continue;

    const loanIdRaw = str(col(row, 'Loan ID', 'LoanID', 'Loan Id'));
    if (loanIdRaw && seenIds.has(loanIdRaw)) {
      warnings.push(`Loan row ${rowNo}: duplicate Loan ID "${loanIdRaw}" — row skipped (first occurrence kept)`);
      continue;
    }
    let loanId = loanIdRaw;
    if (!loanId) {
      // Generate a fallback ID that doesn't collide with explicit or earlier generated IDs
      let n = loans.length + 1;
      do { loanId = `L${String(n++).padStart(3, '0')}`; } while (seenIds.has(loanId));
      warnings.push(`Loan row ${rowNo}: missing Loan ID — generated "${loanId}"`);
    }
    seenIds.add(loanId);

    const loanTypeRaw = str(col(row, 'Loan Type (Direct/Mediator)', 'Loan Type', 'LoanType'));
    const loanType: LoanType = loanTypeRaw.toLowerCase().includes('mediator') ? 'Through Mediator' : 'Direct';

    const statusRaw = str(col(row, 'Loan Status', 'LoanStatus', 'Status'));
    const loanStatus: LoanStatus =
      statusRaw === 'Closed' ? 'Closed' :
      statusRaw === 'Defaulted' ? 'Defaulted' :
      statusRaw === 'Restructured' ? 'Restructured' : 'Active';

    const input = {
      loanId,
      borrowerName,
      borrowerPhone: str(col(row, 'Borrower Phone No.', 'Borrower Phone', 'Phone No', 'Phone')),
      borrowerAddress: str(col(row, 'Borrower Address / City', 'Borrower Address/City', 'Address', 'City')),
      loanType,
      mediatorName: loanType === 'Through Mediator' ? str(col(row, 'Mediator Name', 'MediatorName')) : '',
      mediatorPhone: loanType === 'Through Mediator' ? str(col(row, 'Mediator Phone No.', 'Mediator Phone')) : '',
      mediatorCommissionPct: numWarn(col(row, 'Mediator Commission (% of Interest)', 'Mediator Commission %', 'Commission %', 'Commission'), 'Mediator Commission', rowNo, warnings),
      principalAmount: numWarn(col(row, 'Principal Amount (₹)', 'Principal Amount', 'Principal'), 'Principal Amount', rowNo, warnings),
      annualInterestRate: numWarn(col(row, 'Annual Interest Rate (%)', 'Annual Interest Rate', 'Interest Rate', 'Annual Rate'), 'Annual Interest Rate', rowNo, warnings),
      dateGiven: parseExcelDate(col(row, 'Date Given', 'DateGiven', 'Date')),
      expectedTenureMonths: int(col(row, 'Expected Tenure (Months)', 'Expected Tenure', 'Tenure (Months)', 'Tenure')),
      loanStatus,
      remarks: str(col(row, 'Remarks / Notes', 'Remarks/Notes', 'Remarks', 'Notes')),
      createdAt: now,
    };

    loans.push(deriveLoanFields(input));
  }

  return loans;
}

// ── Monthly Interest Tracker ──────────────────────────────────────────────────

function parsePayments(wb: XLSX.WorkBook, loans: Loan[], warnings: string[]): Payment[] {
  const rows = getSheetRows(wb, 'Monthly Interest Tracker');
  const now = new Date().toISOString();
  const payments: Payment[] = [];
  const loanMap = new Map(loans.map((l) => [l.loanId, l]));

  for (const row of rows) {
    const loanId = str(col(row, 'Loan ID', 'LoanID', 'Loan Id'));
    if (!loanId || loanId === '0') continue;

    const loan = loanMap.get(loanId);
    const statusRaw = str(col(row, 'Payment Status', 'PaymentStatus', 'Status'));
    const paymentStatus: PaymentStatus =
      statusRaw === 'Received' ? 'Received' :
      statusRaw === 'Waived' ? 'Waived' :
      statusRaw === 'Partial' ? 'Partial' : 'Pending';

    const monthYear = str(col(row, 'Month-Year (MMM-YYYY)', 'Month Year', 'Month-Year', 'Month'));
    const payment: Payment = {
      id: `${loanId}_${monthYear.replace(/[^a-zA-Z0-9]/g, '_')}`,
      loanId,
      borrowerName: loan?.borrowerName ?? str(col(row, 'Borrower Name', 'Borrower Full Name', 'Borrower')),
      monthYear,
      dueDate: parseExcelDate(col(row, 'Due Date (DD-MMM-YYYY)', 'Due Date', 'DueDate')),
      interestAmount: loan?.monthlyInterestAmount ?? num(col(row, 'Interest Amount (₹)', 'Interest Amount', 'Interest')),
      mediatorShare: loan?.mediatorMonthlyShare ?? num(col(row, 'Mediator Share (₹)', 'Mediator Share', 'Mediator')),
      netAmountExpected: loan?.netMonthlyReceipt ?? num(col(row, 'Net Amount Expected (₹)', 'Net Amount Expected', 'Net Amount', 'Net Expected')),
      amountReceived: num(col(row, 'Amount Received (₹)', 'Amount Received', 'Received')),
      dateReceived: parseExcelDate(col(row, 'Date Received', 'DateReceived', 'Received Date')),
      paymentStatus,
      daysOverdue: 0,
      pendingAmount: 0,
      remarks: str(col(row, 'Remarks', 'Notes', 'Remark')),
      createdAt: now,
      updatedAt: now,
    };

    payments.push(derivePaymentFields(payment));
  }

  // Deduplicate: keep only the first occurrence of each loanId + monthYear combo
  const seen = new Set<string>();
  const deduped = payments.filter((p) => {
    const key = `${p.loanId}::${p.monthYear}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dropped = payments.length - deduped.length;
  if (dropped > 0) warnings.push(`Payments: ${dropped} duplicate row(s) (same Loan ID + Month-Year) skipped`);
  return deduped;
}

// ── Payment sheet (shared by full export and filtered-view export) ──────────

const PAYMENT_EXPORT_HEADERS = [
  'Loan ID', 'Borrower Name', 'Month-Year', 'Due Date',
  'Expected (Rs)', 'Received (Rs)', 'Date Received',
  'Status', 'Days Overdue', 'Pending (Rs)', 'Remarks',
];

function buildPaymentSheet(payments: Payment[]): XLSX.WorkSheet {
  const payRows = [...payments]
    .sort((a, b) => a.loanId.localeCompare(b.loanId) || compareMonthYear(a.monthYear, b.monthYear))
    .map((p) => [
      p.loanId, p.borrowerName, p.monthYear, formatDate(p.dueDate),
      p.netAmountExpected, p.amountReceived,
      p.dateReceived ? formatDate(p.dateReceived) : '',
      p.paymentStatus, p.daysOverdue, p.pendingAmount, p.remarks ?? '',
    ]);
  const ws = XLSX.utils.aoa_to_sheet([PAYMENT_EXPORT_HEADERS, ...payRows]);
  ws['!cols'] = PAYMENT_EXPORT_HEADERS.map(() => ({ wch: 20 }));
  return ws;
}

/** Exports just the given payments (e.g. the currently filtered table view). */
export function exportPaymentsView(payments: Payment[]): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildPaymentSheet(payments), 'Payments');
  XLSX.writeFile(wb, `Payments_${toISODateString(new Date())}.xlsx`);
}

// ── User Report (Loans Given / Taken / Mediated) ─────────────────────────────

export function exportUserReport(
  userName: string,
  given: Loan[],      // user is lender
  taken: Loan[],      // user is borrower
  mediated: Loan[],   // user is mediator
  payments: Payment[],
): void {
  const wb = XLSX.utils.book_new();
  const dateStr = toISODateString(new Date());

  const loanGivenHeaders = [
    'Loan ID', 'Borrower Name', 'Borrower Phone', 'Principal (Rs)',
    'Rate (%)', 'Monthly Receipt (Rs)', 'Date Given', 'Due Day',
    'Tenure (mo)', 'Status', 'Remarks',
  ];
  const summaryHeaders = [
    'Loan ID', 'Borrower Name', 'Principal (Rs)', 'Rate (%)',
    'Monthly Interest (Rs)', 'Mediator Share (Rs)', 'Net Receipt (Rs)',
    'Date Given', 'Status',
  ];

  // ── Sheet 1: Loans Given ──
  if (given.length > 0) {
    const rows = given.map((l) => [
      l.loanId, l.borrowerName, l.borrowerPhone, l.principalAmount,
      l.annualInterestRate, l.netMonthlyReceipt,
      formatDate(l.dateGiven), l.monthlyDueDay,
      l.expectedTenureMonths, l.loanStatus, l.remarks ?? '',
    ]);
    // Group totals at end
    rows.push([]);
    rows.push(['', 'TOTAL', given.reduce((s, l) => s + l.principalAmount, 0), '',
      given.reduce((s, l) => s + l.netMonthlyReceipt, 0)]);
    const ws = XLSX.utils.aoa_to_sheet([loanGivenHeaders, ...rows]);
    ws['!cols'] = loanGivenHeaders.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Loans Given');
  }

  // ── Sheet 2: Loans Taken ──
  if (taken.length > 0) {
    const takenHeaders = [
      'Loan ID', 'Principal (Rs)', 'Rate (%)', 'Monthly Pay (Rs)',
      'Date Given', 'Due Day', 'Tenure (mo)', 'Status', 'Remarks',
    ];
    const rows = taken.map((l) => [
      l.loanId, l.principalAmount, l.annualInterestRate,
      l.monthlyInterestAmount, formatDate(l.dateGiven),
      l.monthlyDueDay, l.expectedTenureMonths, l.loanStatus, l.remarks ?? '',
    ]);
    rows.push([]);
    rows.push(['TOTAL', taken.reduce((s, l) => s + l.principalAmount, 0), '',
      taken.reduce((s, l) => s + l.monthlyInterestAmount, 0)]);
    const ws = XLSX.utils.aoa_to_sheet([takenHeaders, ...rows]);
    ws['!cols'] = takenHeaders.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Loans Taken');
  }

  // ── Sheet 3: Loans Mediated ──
  if (mediated.length > 0) {
    const rows = mediated.map((l) => [
      l.loanId, l.borrowerName, l.principalAmount, l.annualInterestRate,
      l.monthlyInterestAmount, l.mediatorMonthlyShare, l.netMonthlyReceipt,
      formatDate(l.dateGiven), l.loanStatus,
    ]);
    rows.push([]);
    rows.push(['', 'TOTAL',
      mediated.reduce((s, l) => s + l.principalAmount, 0), '',
      mediated.reduce((s, l) => s + l.monthlyInterestAmount, 0),
      mediated.reduce((s, l) => s + l.mediatorMonthlyShare, 0),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([summaryHeaders, ...rows]);
    ws['!cols'] = summaryHeaders.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Loans Mediated');
  }

  // ── Sheet 4: Payment History ──
  if (payments.length > 0) {
    const ws = buildPaymentSheet(payments);
    XLSX.utils.book_append_sheet(wb, ws, 'Payment History');
  }

  // ── Sheet 5: Summary ──
  const allLoanIds = new Set([...given, ...taken, ...mediated].map((l) => l.loanId));
  const myPayments = payments.filter((p) => allLoanIds.has(p.loanId));
  const totalReceived = myPayments.reduce((s, p) => s + p.amountReceived, 0);
  const totalPending  = myPayments.filter((p) => p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived')
    .reduce((s, p) => s + p.pendingAmount, 0);

  const summaryData = [
    [`LOAN REPORT — ${userName}`],
    [`Generated on ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['LOANS GIVEN (as Lender)'],
    ['  Count', given.length],
    ['  Total Principal (Rs)', given.reduce((s, l) => s + l.principalAmount, 0)],
    ['  Monthly Income (Rs)',  given.reduce((s, l) => s + l.netMonthlyReceipt, 0)],
    [],
    ['LOANS TAKEN (as Borrower)'],
    ['  Count', taken.length],
    ['  Total Borrowed (Rs)', taken.reduce((s, l) => s + l.principalAmount, 0)],
    ['  Monthly Outflow (Rs)', taken.reduce((s, l) => s + l.monthlyInterestAmount, 0)],
    [],
    ['LOANS MEDIATED'],
    ['  Count', mediated.length],
    ['  Total Principal (Rs)',   mediated.reduce((s, l) => s + l.principalAmount, 0)],
    ['  Monthly Commission (Rs)', mediated.reduce((s, l) => s + l.mediatorMonthlyShare, 0)],
    [],
    ['PAYMENT SUMMARY'],
    ['  Total Received (Rs)', totalReceived],
    ['  Total Pending (Rs)',  totalPending],
    ['  Overdue Payments',    myPayments.filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived').length],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  XLSX.writeFile(wb, `LoanReport_${userName.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportToExcel(loans: Loan[], payments: Payment[]): void {
  const wb = XLSX.utils.book_new();

  const loanHeaders = [
    'Loan ID', 'Borrower Full Name', 'Borrower Phone No.', 'Borrower Address / City',
    'Loan Type', 'Mediator Name', 'Mediator Phone No.', 'Mediator Commission (%)',
    'Principal Amount (Rs)', 'Annual Interest Rate (%)', 'Monthly Interest Rate (%)',
    'Date Given', 'Monthly Due Day', 'Expected Tenure (Months)',
    'Monthly Interest Amount (Rs)', 'Mediator Monthly Share (Rs)', 'Net Monthly Receipt (Rs)',
    'Loan Status', 'Remarks',
  ];
  const loanRows = loans.map((l) => [
    l.loanId, l.borrowerName, l.borrowerPhone, l.borrowerAddress,
    l.loanType, l.mediatorName, l.mediatorPhone, l.mediatorCommissionPct,
    l.principalAmount, l.annualInterestRate, l.monthlyInterestRate,
    formatDate(l.dateGiven), l.monthlyDueDay, l.expectedTenureMonths,
    l.monthlyInterestAmount, l.mediatorMonthlyShare, l.netMonthlyReceipt,
    l.loanStatus, l.remarks,
  ]);
  const loanSheet = XLSX.utils.aoa_to_sheet([loanHeaders, ...loanRows]);
  loanSheet['!cols'] = loanHeaders.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, loanSheet, 'Loan Master');

  const payHeaders = [
    'Loan ID', 'Borrower Name', 'Month-Year', 'Due Date',
    'Interest Amount (Rs)', 'Mediator Share (Rs)', 'Net Amount Expected (Rs)',
    'Amount Received (Rs)', 'Date Received', 'Payment Status',
    'Days Overdue', 'Pending Amount (Rs)', 'Remarks',
  ];
  const payRows = payments.map((p) => [
    p.loanId, p.borrowerName, p.monthYear, formatDate(p.dueDate),
    p.interestAmount, p.mediatorShare, p.netAmountExpected,
    p.amountReceived, p.dateReceived ? formatDate(p.dateReceived) : '',
    p.paymentStatus, p.daysOverdue, p.pendingAmount, p.remarks,
  ]);
  const paySheet = XLSX.utils.aoa_to_sheet([payHeaders, ...payRows]);
  paySheet['!cols'] = payHeaders.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, paySheet, 'Monthly Interest Tracker');

  const activeLoans = loans.filter((l) => l.loanStatus === 'Active');
  const overduePayments = payments.filter(isOverduePayment);
  const dashData = [
    ['LOAN PORTFOLIO DASHBOARD'],
    ['Generated on', new Date().toLocaleDateString('en-IN')],
    [],
    ['Metric', 'Value'],
    ['Total Active Loans', activeLoans.length],
    ['Total Principal Outstanding (Rs)', activeLoans.reduce((s, l) => s + l.principalAmount, 0)],
    ['Monthly Interest Expected (Rs)', activeLoans.reduce((s, l) => s + l.monthlyInterestAmount, 0)],
    ['Net Monthly Income (Rs)', activeLoans.reduce((s, l) => s + l.netMonthlyReceipt, 0)],
    ['Total Overdue Payments', overduePayments.length],
    ['Total Pending Amount (Rs)', overduePayments.reduce((s, p) => s + p.pendingAmount, 0)],
  ];
  const dashSheet = XLSX.utils.aoa_to_sheet(dashData);
  dashSheet['!cols'] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, dashSheet, 'Dashboard');

  const dateStr = toISODateString(new Date());
  XLSX.writeFile(wb, `LoanTracker_Export_${dateStr}.xlsx`);
}
