import jsPDF from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import type { Loan, Payment } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatUtils';
import { toISODateString, compareMonthYear } from '@/utils/dateUtils';

// ── Palette ───────────────────────────────────────────────────────────────────
const INDIGO  = [99,  102, 241] as [number, number, number];
const EMERALD = [16,  185, 129] as [number, number, number];
const RED     = [239,  68,  68] as [number, number, number];
const SLATE8  = [30,   41,  59] as [number, number, number];
const SLATE4  = [148, 163, 184] as [number, number, number];
const SLATE1  = [241, 245, 249] as [number, number, number];
const WHITE   = [255, 255, 255] as [number, number, number];

// jsPDF's built-in Helvetica font does not contain the ₹ glyph — it renders
// as ¹. Strip it and prefix "Rs." which Helvetica handles perfectly.
function rs(amount: number): string {
  return formatCurrency(amount).replace('₹', 'Rs.');
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// ── Page chrome ───────────────────────────────────────────────────────────────
function addPageHeader(doc: jsPDF, title: string, subtitle: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, W, 14, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 9);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, W - 14, 9, { align: 'right' });
  doc.setTextColor(...SLATE8);
}

function addPageFooter(doc: jsPDF, page: number, total: number, today: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...SLATE1);
  doc.line(14, H - 10, W - 14, H - 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE4);
  doc.text(`LoanManager  ·  ${today}`, 14, H - 5);
  doc.text(`Page ${page} of ${total}`, W - 14, H - 5, { align: 'right' });
}

function sectionHeading(doc: jsPDF, label: string, y: number): number {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INDIGO);
  doc.rect(14, y, W - 28, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(label.toUpperCase(), 17, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE8);
  return y + 11;
}

function kpiRow(
  doc: jsPDF,
  items: { label: string; value: string; color?: [number, number, number] }[],
  y: number,
): number {
  const W = doc.internal.pageSize.getWidth();
  const colW = (W - 28) / items.length;
  items.forEach(({ label, value, color }, i) => {
    const x = 14 + i * colW;
    doc.setFillColor(...WHITE);
    doc.setDrawColor(220, 224, 235);
    doc.roundedRect(x, y, colW - 2, 16, 1.5, 1.5, 'FD');
    // label
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE4);
    doc.text(label.toUpperCase(), x + 4, y + 5.5);
    // value
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(color ?? SLATE8));
    doc.text(value, x + 4, y + 13);
  });
  return y + 19;
}

// ── Table style helpers ───────────────────────────────────────────────────────
const tableBase = {
  styles:           { fontSize: 8, cellPadding: 2.8 },
  headStyles:       { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold' as const, fontSize: 8 },
  bodyStyles:       { textColor: SLATE8 },
  alternateRowStyles: { fillColor: SLATE1 },
  columnStyles:     { 0: { fontStyle: 'bold' as const, textColor: INDIGO as [number, number, number] } },
  margin:           { left: 14, right: 14 },
};

function totalRowStyle(rowIndex: number) {
  return (data: CellHookData) => {
    if (data.row.index === rowIndex) {
      data.cell.styles.fontStyle = 'bold';
      data.cell.styles.fillColor = [218, 220, 240];
      data.cell.styles.textColor = SLATE8;
    }
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
export function exportUserPDF(
  userName: string,
  given: Loan[],
  taken: Loan[],
  mediated: Loan[],
  payments: Payment[],
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const allLoanIds    = new Set([...given, ...taken, ...mediated].map((l) => l.loanId));
  const myPayments    = payments.filter((p) => allLoanIds.has(p.loanId));
  const totalReceived = myPayments.reduce((s, p) => s + p.amountReceived, 0);
  const totalPending  = myPayments
    .filter((p) => p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived')
    .reduce((s, p) => s + p.pendingAmount, 0);
  const overdueCount  = myPayments.filter(
    (p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived'
  ).length;
  const monthlyNet = given.reduce((s, l) => s + l.netMonthlyReceipt, 0)
    + mediated.reduce((s, l) => s + l.mediatorMonthlyShare, 0)
    - taken.reduce((s, l) => s + l.monthlyInterestAmount, 0);

  // ════════════════════════════════════════════════
  // PAGE 1 — Summary
  // ════════════════════════════════════════════════
  addPageHeader(doc, `Loan Report  —  ${userName}`, today);
  let y = 22;

  if (given.length > 0) {
    y = sectionHeading(doc, 'Loans Given (as Lender)', y);
    y = kpiRow(doc, [
      { label: 'Loans',           value: String(given.length) },
      { label: 'Total Principal', value: rs(given.reduce((s, l) => s + l.principalAmount, 0)), color: INDIGO },
      { label: 'Monthly Income',  value: rs(given.reduce((s, l) => s + l.netMonthlyReceipt, 0)), color: EMERALD },
    ], y);
    y += 3;
  }

  if (taken.length > 0) {
    y = sectionHeading(doc, 'Loans Taken (as Borrower)', y);
    y = kpiRow(doc, [
      { label: 'Loans',          value: String(taken.length) },
      { label: 'Total Borrowed', value: rs(taken.reduce((s, l) => s + l.principalAmount, 0)), color: INDIGO },
      { label: 'Monthly Pay',    value: rs(taken.reduce((s, l) => s + l.monthlyInterestAmount, 0)), color: RED },
    ], y);
    y += 3;
  }

  if (mediated.length > 0) {
    y = sectionHeading(doc, 'Loans Mediated', y);
    y = kpiRow(doc, [
      { label: 'Loans',              value: String(mediated.length) },
      { label: 'Total Principal',    value: rs(mediated.reduce((s, l) => s + l.principalAmount, 0)), color: INDIGO },
      { label: 'Commission / Month', value: rs(mediated.reduce((s, l) => s + l.mediatorMonthlyShare, 0)), color: EMERALD },
    ], y);
    y += 3;
  }

  y = sectionHeading(doc, 'Payment Summary', y);
  y = kpiRow(doc, [
    { label: 'Total Received', value: rs(totalReceived),   color: EMERALD },
    { label: 'Total Pending',  value: rs(totalPending),    color: RED },
    { label: 'Overdue',        value: String(overdueCount), color: overdueCount > 0 ? RED : EMERALD },
    { label: 'Net / Month',    value: `${monthlyNet >= 0 ? '+' : ''}${rs(monthlyNet)}`, color: monthlyNet >= 0 ? EMERALD : RED },
  ], y);

  // ════════════════════════════════════════════════
  // PAGE 2 — Loans Given
  // ════════════════════════════════════════════════
  if (given.length > 0) {
    doc.addPage();
    addPageHeader(doc, `Loans Given  —  ${userName}`, today);
    autoTable(doc, {
      ...tableBase,
      startY: 18,
      head: [['Loan ID', 'Borrower', 'Phone', 'Principal', 'Rate', 'Monthly Receipt', 'Given On', 'Status']],
      body: [
        ...given.map((l) => [
          l.loanId, l.borrowerName, l.borrowerPhone || '—',
          rs(l.principalAmount), `${l.annualInterestRate}%`,
          rs(l.netMonthlyReceipt), formatDate(l.dateGiven), l.loanStatus,
        ]),
        ['', 'TOTAL', '',
          rs(given.reduce((s, l) => s + l.principalAmount, 0)), '',
          rs(given.reduce((s, l) => s + l.netMonthlyReceipt, 0)), '', ''],
      ],
      didParseCell: totalRowStyle(given.length),
    });
  }

  // ════════════════════════════════════════════════
  // PAGE 3 — Loans Taken
  // ════════════════════════════════════════════════
  if (taken.length > 0) {
    doc.addPage();
    addPageHeader(doc, `Loans Taken  —  ${userName}`, today);
    autoTable(doc, {
      ...tableBase,
      startY: 18,
      head: [['Loan ID', 'Principal', 'Rate', 'Monthly Pay', 'Date Given', 'Due Day', 'Tenure', 'Status']],
      body: [
        ...taken.map((l) => [
          l.loanId, rs(l.principalAmount), `${l.annualInterestRate}%`,
          rs(l.monthlyInterestAmount), formatDate(l.dateGiven),
          ordinal(l.monthlyDueDay), `${l.expectedTenureMonths} mo`, l.loanStatus,
        ]),
        ['TOTAL', rs(taken.reduce((s, l) => s + l.principalAmount, 0)), '',
          rs(taken.reduce((s, l) => s + l.monthlyInterestAmount, 0)), '', '', '', ''],
      ],
      didParseCell: totalRowStyle(taken.length),
    });
  }

  // ════════════════════════════════════════════════
  // PAGE 4 — Loans Mediated
  // ════════════════════════════════════════════════
  if (mediated.length > 0) {
    doc.addPage();
    addPageHeader(doc, `Loans Mediated  —  ${userName}`, today);
    autoTable(doc, {
      ...tableBase,
      startY: 18,
      head: [['Loan ID', 'Borrower', 'Principal', 'Rate', 'Monthly Interest', 'My Commission', 'Status']],
      body: [
        ...mediated.map((l) => [
          l.loanId, l.borrowerName, rs(l.principalAmount),
          `${l.annualInterestRate}%`, rs(l.monthlyInterestAmount),
          rs(l.mediatorMonthlyShare), l.loanStatus,
        ]),
        ['TOTAL', '',
          rs(mediated.reduce((s, l) => s + l.principalAmount, 0)), '',
          rs(mediated.reduce((s, l) => s + l.monthlyInterestAmount, 0)),
          rs(mediated.reduce((s, l) => s + l.mediatorMonthlyShare, 0)), ''],
      ],
      didParseCell: totalRowStyle(mediated.length),
    });
  }

  // ════════════════════════════════════════════════
  // PAGE 5 — Payment History
  // ════════════════════════════════════════════════
  if (myPayments.length > 0) {
    doc.addPage();
    addPageHeader(doc, `Payment History  —  ${userName}`, today);

    const sorted = [...myPayments].sort((a, b) =>
      a.loanId.localeCompare(b.loanId) || compareMonthYear(a.monthYear, b.monthYear)
    );

    autoTable(doc, {
      ...tableBase,
      startY: 18,
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      head: [['Loan', 'Borrower', 'Month', 'Expected', 'Received', 'Pending', 'Status', 'Overdue']],
      body: sorted.map((p) => [
        p.loanId, p.borrowerName, p.monthYear,
        rs(p.netAmountExpected),
        p.amountReceived > 0 ? rs(p.amountReceived) : '—',
        p.pendingAmount > 0  ? rs(p.pendingAmount)  : '—',
        p.paymentStatus,
        p.daysOverdue > 0    ? `${p.daysOverdue}d`  : '—',
      ]),
      didParseCell: (data) => {
        if (data.column.index === 6) {
          const v = String(data.cell.raw);
          if (v === 'Received') data.cell.styles.textColor = EMERALD;
          else if (v === 'Pending' || v === 'Partial') data.cell.styles.textColor = RED;
        }
        if (data.column.index === 7 && data.cell.raw !== '—') {
          data.cell.styles.textColor = RED;
        }
      },
    });
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, pageCount, today);
  }

  doc.save(`LoanReport_${userName.replace(/\s+/g, '_')}_${toISODateString(new Date())}.pdf`);
}

// ── Admin full portfolio PDF ──────────────────────────────────────────────────
export function exportAdminPDF(adminName: string, loans: Loan[], payments: Payment[]): void {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const active  = loans.filter((l) => l.loanStatus === 'Active');
  const overdue = payments.filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived');
  const totalPrincipal   = active.reduce((s, l) => s + l.principalAmount, 0);
  const monthlyExpected  = active.reduce((s, l) => s + l.monthlyInterestAmount, 0);
  const netIncome        = active.reduce((s, l) => s + l.netMonthlyReceipt, 0);
  const totalReceived    = payments.reduce((s, p) => s + p.amountReceived, 0);
  const totalPending     = overdue.reduce((s, p) => s + p.pendingAmount, 0);

  // ── Page 1: Summary ──
  addPageHeader(doc, `Loan Portfolio  —  ${adminName}`, today);
  let y = 22;

  y = sectionHeading(doc, 'Portfolio Overview', y);
  y = kpiRow(doc, [
    { label: 'Active Loans',     value: String(active.length) },
    { label: 'Total Principal',  value: rs(totalPrincipal),  color: INDIGO },
    { label: 'Monthly Expected', value: rs(monthlyExpected), color: INDIGO },
    { label: 'Net Income / mo',  value: rs(netIncome),       color: EMERALD },
  ], y);
  y += 3;

  y = sectionHeading(doc, 'Payment Summary', y);
  y = kpiRow(doc, [
    { label: 'Total Received', value: rs(totalReceived),       color: EMERALD },
    { label: 'Total Pending',  value: rs(totalPending),        color: RED },
    { label: 'Overdue Count',  value: String(overdue.length),  color: overdue.length > 0 ? RED : EMERALD },
    { label: 'Total Loans',    value: String(loans.length) },
  ], y);

  // ── Page 2: All Loans ──
  if (loans.length > 0) {
    doc.addPage();
    addPageHeader(doc, `All Loans  —  ${adminName}`, today);
    autoTable(doc, {
      ...tableBase,
      startY: 18,
      head: [['Loan ID', 'Borrower', 'Type', 'Principal', 'Rate', 'Monthly', 'Given On', 'Status']],
      body: loans.map((l) => [
        l.loanId, l.borrowerName,
        l.loanType === 'Through Mediator' ? `Via ${l.mediatorName || 'Mediator'}` : 'Direct',
        rs(l.principalAmount), `${l.annualInterestRate}%`,
        rs(l.netMonthlyReceipt), formatDate(l.dateGiven), l.loanStatus,
      ]),
      didParseCell: (data) => {
        if (data.column.index === 7) {
          const v = String(data.cell.raw);
          if (v === 'Active')       data.cell.styles.textColor = EMERALD;
          else if (v === 'Closed')  data.cell.styles.textColor = SLATE4;
          else if (v === 'Defaulted') data.cell.styles.textColor = RED;
        }
      },
    });
  }

  // ── Page 3: Overdue Payments ──
  if (overdue.length > 0) {
    doc.addPage();
    addPageHeader(doc, `Overdue Payments  —  ${adminName}`, today);
    const sorted = [...overdue].sort((a, b) => b.daysOverdue - a.daysOverdue);
    autoTable(doc, {
      ...tableBase,
      startY: 18,
      head: [['Loan', 'Borrower', 'Month', 'Expected', 'Pending', 'Days Overdue']],
      body: sorted.map((p) => [
        p.loanId, p.borrowerName, p.monthYear,
        rs(p.netAmountExpected), rs(p.pendingAmount), `${p.daysOverdue}d`,
      ]),
      didParseCell: (data) => {
        if (data.column.index === 5) data.cell.styles.textColor = RED;
      },
    });
  }

  // ── Page 4: Payment History ──
  if (payments.length > 0) {
    doc.addPage();
    addPageHeader(doc, `Payment History  —  ${adminName}`, today);
    const sorted = [...payments].sort((a, b) =>
      a.loanId.localeCompare(b.loanId) || compareMonthYear(a.monthYear, b.monthYear)
    );
    autoTable(doc, {
      ...tableBase,
      startY: 18,
      styles:     { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      head: [['Loan', 'Borrower', 'Month', 'Expected', 'Received', 'Pending', 'Status', 'Overdue']],
      body: sorted.map((p) => [
        p.loanId, p.borrowerName, p.monthYear,
        rs(p.netAmountExpected),
        p.amountReceived > 0 ? rs(p.amountReceived) : '—',
        p.pendingAmount > 0  ? rs(p.pendingAmount)  : '—',
        p.paymentStatus,
        p.daysOverdue > 0    ? `${p.daysOverdue}d`  : '—',
      ]),
      didParseCell: (data) => {
        if (data.column.index === 6) {
          const v = String(data.cell.raw);
          if (v === 'Received') data.cell.styles.textColor = EMERALD;
          else if (v === 'Pending' || v === 'Partial') data.cell.styles.textColor = RED;
        }
        if (data.column.index === 7 && data.cell.raw !== '—') data.cell.styles.textColor = RED;
      },
    });
  }

  // ── Footers ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, pageCount, today);
  }

  doc.save(`LoanPortfolio_${adminName.replace(/\s+/g, '_')}_${toISODateString(new Date())}.pdf`);
}
