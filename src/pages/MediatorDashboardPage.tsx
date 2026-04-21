import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, ArrowRight, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { useLoans } from '@/context/LoanContext';
import type { Loan } from '@/types';
import { usePayments } from '@/context/PaymentContext';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate, ordinal, formatRateAsRupees } from '@/utils/formatUtils';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/Toast';
import { exportUserPDF } from '@/services/pdfService';
import { derivePaymentFields } from '@/services/calculationService';

function norm(phone: string) {
  return phone.replace(/\D/g, '').slice(-10);
}

function loanAge(dateGiven: string): string {
  const given = new Date(dateGiven);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - given.getFullYear()) * 12 +
    (now.getMonth() - given.getMonth());
  if (totalMonths < 1) return '< 1 mo';
  if (totalMonths < 12) return `${totalMonths} mo`;
  const yrs = Math.floor(totalMonths / 12);
  const mo  = totalMonths % 12;
  return mo === 0 ? `${yrs} yr` : `${yrs} yr ${mo} mo`;
}

type KpiColor = 'default' | 'indigo' | 'green' | 'red';
const kpiColorMap: Record<KpiColor, string> = {
  default: 'text-slate-900',
  indigo:  'text-indigo-600',
  green:   'text-emerald-600',
  red:     'text-red-500',
};
function KpiCard({ label, value, color = 'default', sub }: { label: string; value: string; color?: KpiColor; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 px-4 py-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={`text-xl font-bold mt-1.5 ${kpiColorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

interface BorrowerGroup {
  name: string;
  phone: string;
  loans: Loan[];
  totalPrincipal: number;
  totalMonthlyInterest: number;
  totalShare: number;      // mediator share (0 for lender groups)
  totalReceipt: number;    // net receipt (lender) or 0
}

interface MediatorDashboardPageProps {
  viewAsPhone?: string;
  viewAsName?: string;
  onExitViewAs?: () => void;
}

export function MediatorDashboardPage({ viewAsPhone, viewAsName, onExitViewAs }: MediatorDashboardPageProps) {
  const { loans } = useLoans();
  const { payments, updatePayment } = usePayments();
  const { userPhone } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [showClosedLoans, setShowClosedLoans] = useState(false);

  const isViewAs = !!viewAsPhone;

  const myPhone = norm(viewAsPhone || userPhone);

  const borrowerLoans = useMemo(() =>
    loans.filter((l) => norm(l.borrowerPhone) === myPhone),
    [loans, myPhone]
  );

  const mediatorLoans = useMemo(() =>
    loans.filter((l) => l.loanType === 'Through Mediator' && norm(l.mediatorPhone ?? '') === myPhone),
    [loans, myPhone]
  );

  const lenderLoans = useMemo(() =>
    loans.filter((l) => l.lenderPhone && norm(l.lenderPhone) === myPhone),
    [loans, myPhone]
  );

  // Group mediator loans by borrower (for consolidated view)
  const mediatorByBorrower = useMemo<BorrowerGroup[]>(() => {
    const map = new Map<string, BorrowerGroup>();
    for (const l of mediatorLoans) {
      const key = norm(l.borrowerPhone) || l.borrowerName;
      if (!map.has(key)) {
        map.set(key, { name: l.borrowerName, phone: l.borrowerPhone, loans: [], totalPrincipal: 0, totalMonthlyInterest: 0, totalShare: 0, totalReceipt: 0 });
      }
      const g = map.get(key)!;
      g.loans.push(l);
      g.totalPrincipal       += l.principalAmount;
      g.totalMonthlyInterest += l.monthlyInterestAmount;
      g.totalShare           += l.mediatorMonthlyShare;
    }
    return Array.from(map.values()).sort((a, b) => b.totalPrincipal - a.totalPrincipal);
  }, [mediatorLoans]);

  // Group lender loans by borrower
  const lenderByBorrower = useMemo<BorrowerGroup[]>(() => {
    const map = new Map<string, BorrowerGroup>();
    for (const l of lenderLoans) {
      const key = norm(l.borrowerPhone) || l.borrowerName;
      if (!map.has(key)) {
        map.set(key, { name: l.borrowerName, phone: l.borrowerPhone, loans: [], totalPrincipal: 0, totalMonthlyInterest: 0, totalShare: 0, totalReceipt: 0 });
      }
      const g = map.get(key)!;
      g.loans.push(l);
      g.totalPrincipal  += l.principalAmount;
      g.totalReceipt    += l.netMonthlyReceipt;
    }
    return Array.from(map.values()).sort((a, b) => b.totalPrincipal - a.totalPrincipal);
  }, [lenderLoans]);

  const allMyLoanIds = useMemo(() =>
    new Set([...borrowerLoans, ...mediatorLoans, ...lenderLoans].map((l) => l.loanId)),
    [borrowerLoans, mediatorLoans, lenderLoans]
  );

  const myPayments = useMemo(() =>
    payments.filter((p) => allMyLoanIds.has(p.loanId)),
    [payments, allMyLoanIds]
  );

  // KPI amounts — Active loans only
  const activeBorrower = borrowerLoans.filter((l) => l.loanStatus === 'Active');
  const activeMediator = mediatorLoans.filter((l) => l.loanStatus === 'Active');
  const activeLender   = lenderLoans.filter((l) => l.loanStatus === 'Active');

  const totalBorrowed          = activeBorrower.reduce((s, l) => s + l.principalAmount, 0);
  const totalMonthlyDue        = activeBorrower.reduce((s, l) => s + l.monthlyInterestAmount, 0);
  const monthlyCommission      = activeMediator.reduce((s, l) => s + l.mediatorMonthlyShare, 0);
  const totalMediatedPrincipal = activeMediator.reduce((s, l) => s + l.principalAmount, 0);
  const monthlyLendIncome      = activeLender.reduce((s, l) => s + l.netMonthlyReceipt, 0);
  const totalLentPrincipal     = activeLender.reduce((s, l) => s + l.principalAmount, 0);
  const netMonthly             = monthlyLendIncome + monthlyCommission - totalMonthlyDue;
  const overdueCount           = myPayments.filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived').length;

  // Loans where I am the lender — only I can mark payments as received
  const lenderLoanIds   = useMemo(() => new Set(lenderLoans.map((l) => l.loanId)),   [lenderLoans]);
  // Loans where I am the borrower — show full interest amount and "Paid" label
  const borrowerLoanIds = useMemo(() => new Set(borrowerLoans.map((l) => l.loanId)), [borrowerLoans]);

  async function handleMarkReceived(paymentId: string) {
    const payment = myPayments.find((p) => p.id === paymentId);
    if (!payment) return;
    const today = new Date().toISOString().split('T')[0];
    const updated = derivePaymentFields({
      ...payment,
      amountReceived: payment.netAmountExpected,
      dateReceived: today,
      paymentStatus: 'Received',
    });
    try {
      await updatePayment(updated);
      showSuccess(`${payment.borrowerName} — ${payment.monthYear} marked as received`);
    } catch {
      showError('Failed to update payment');
    }
  }

  const hasBorrower = borrowerLoans.length > 0;
  const hasMediator = mediatorLoans.length > 0;
  const hasLender   = lenderLoans.length > 0;

  function handleDownloadPDF() {
    const name = viewAsName || userPhone;
    exportUserPDF(name, lenderLoans, borrowerLoans, mediatorLoans, myPayments);
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* View-as banner */}
      {isViewAs && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <span className="font-semibold">Viewing as:</span>
            <span>{viewAsName} ({viewAsPhone})</span>
          </div>
          <button
            onClick={onExitViewAs}
            className="text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Back to My Dashboard
          </button>
        </div>
      )}

      {/* Header action row */}
      <div className="flex items-center justify-between gap-2">
        {!isViewAs && (
          <button
            onClick={() => navigate('/add-loan')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 active:scale-95 transition-all shadow-sm"
          >
            <Plus size={16} /> Add Loan
          </button>
        )}
        {!isViewAs && <span />}
        {(hasBorrower || hasMediator || hasLender) && (
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <FileText size={15} className="text-red-500" /> Download PDF
          </button>
        )}
      </div>

      {/* ── KPI cards — one row per role ── */}
      {hasBorrower && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard label="Loans Taken"    value={String(activeBorrower.length)}
            sub={activeBorrower.length !== borrowerLoans.length ? `${borrowerLoans.length - activeBorrower.length} closed` : undefined} />
          <KpiCard label="Total Borrowed" value={formatCurrency(totalBorrowed)}  color="indigo" />
          <KpiCard label="Monthly Pay"    value={formatCurrency(totalMonthlyDue)} color="red" />
        </div>
      )}

      {hasLender && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard label="Loans Given"  value={String(activeLender.length)}
            sub={activeLender.length !== lenderLoans.length ? `${lenderLoans.length - activeLender.length} closed` : `${lenderByBorrower.length} borrowers`} />
          <KpiCard label="Total Lent"   value={formatCurrency(totalLentPrincipal)} color="indigo" />
          <KpiCard label="Monthly Earn" value={formatCurrency(monthlyLendIncome)}  color="green" />
        </div>
      )}

      {hasMediator && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Loans Mediated"     value={String(activeMediator.length)}
            sub={activeMediator.length !== mediatorLoans.length ? `${mediatorLoans.length - activeMediator.length} closed` : `${mediatorByBorrower.length} borrowers`} />
          <KpiCard label="Mediated Principal" value={formatCurrency(totalMediatedPrincipal)} color="indigo" />
          <KpiCard label="Commission / mo"    value={formatCurrency(monthlyCommission)}      color="green" />
          <KpiCard
            label={hasBorrower ? 'Net / Month' : 'Overdue'}
            value={hasBorrower
              ? `${netMonthly >= 0 ? '+' : ''}${formatCurrency(netMonthly)}`
              : String(overdueCount)}
            color={hasBorrower ? (netMonthly >= 0 ? 'green' : 'red') : 'red'}
            sub={hasBorrower ? `${overdueCount} overdue` : undefined}
          />
        </div>
      )}

      {!hasMediator && (hasBorrower || hasLender) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard
            label={hasBorrower && hasLender ? 'Net / Month' : 'Overdue'}
            value={hasBorrower && hasLender
              ? `${netMonthly >= 0 ? '+' : ''}${formatCurrency(netMonthly)}`
              : String(overdueCount)}
            color={hasBorrower && hasLender ? (netMonthly >= 0 ? 'green' : 'red') : 'red'}
            sub={hasBorrower && hasLender ? `${overdueCount} overdue` : undefined}
          />
        </div>
      )}

      {/* ── My Loans (as borrower) ── */}
      {hasBorrower && (() => {
        const activeLoans = borrowerLoans.filter((l) => l.loanStatus === 'Active');
        const closedLoans = borrowerLoans.filter((l) => l.loanStatus !== 'Active');

        const loanSource = (l: typeof borrowerLoans[0]) =>
          l.loanType === 'Through Mediator' && l.mediatorName ? l.mediatorName : (l.lenderName || 'Admin');

        const LoanRows = ({ list, muted }: { list: typeof borrowerLoans; muted?: boolean }) => (<>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-50">
            {list.map((l) => (
              <div key={l.loanId} className={`px-5 py-4 ${muted ? 'bg-slate-50/40' : ''}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-mono font-semibold text-indigo-500">{l.loanId}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatCurrency(l.principalAmount)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Given {formatDate(l.dateGiven)} · Due {ordinal(l.monthlyDueDay)} every month</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{loanSource(l)}</span>
                      <ArrowRight size={11} className="text-slate-300" /><span className="text-xs text-slate-400">You</span>
                    </div>
                  </div>
                  <StatusBadge status={l.loanStatus} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div className="bg-slate-50 rounded-xl px-3 py-2"><p className="text-slate-400">Rate</p><p className="font-semibold text-slate-800 mt-0.5">{formatRateAsRupees(l.annualInterestRate)}</p></div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2"><p className="text-slate-400">Monthly Due</p><p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(l.monthlyInterestAmount)}</p></div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2"><p className="text-slate-400">Age</p><p className="font-semibold text-slate-800 mt-0.5">{loanAge(l.dateGiven)}</p></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table rows */}
          {list.map((l) => (
            <tr key={l.loanId} className={`hidden md:table-row border-t border-slate-50 hover:bg-slate-50/60 ${muted ? 'opacity-60' : ''}`}>
              <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{l.loanId}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{loanSource(l)}</span>
                  <ArrowRight size={10} className="text-slate-300" />
                  <span className="text-xs text-slate-500">You</span>
                </div>
              </td>
              <td className="px-5 py-3 text-sm font-semibold text-slate-800">{formatCurrency(l.principalAmount)}</td>
              <td className="px-5 py-3 text-sm text-slate-600">{formatRateAsRupees(l.annualInterestRate)}</td>
              <td className="px-5 py-3 text-sm text-slate-700">{formatCurrency(l.monthlyInterestAmount)}</td>
              <td className="px-5 py-3 text-xs text-slate-400">{formatDate(l.dateGiven)} · Due {ordinal(l.monthlyDueDay)}</td>
              <td className="px-5 py-3 text-xs text-slate-400">{loanAge(l.dateGiven)}</td>
              <td className="px-5 py-3"><StatusBadge status={l.loanStatus} /></td>
            </tr>
          ))}
        </>);

        return (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">My Loans</p>
            </div>

            {activeLoans.length === 0 ? (
              <div className="px-5 py-6 text-sm text-slate-400">No active loans</div>
            ) : (
              <table className="hidden md:table min-w-full">
                <thead><tr className="border-b border-slate-50">
                  {['Loan','From','Principal','Rate','Monthly Due','Date Given','Age','Status'].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody><LoanRows list={activeLoans} /></tbody>
              </table>
            )}
            <div className="md:hidden">
              {activeLoans.length === 0
                ? <div className="px-5 py-6 text-sm text-slate-400">No active loans</div>
                : <LoanRows list={activeLoans} />}
            </div>

            {closedLoans.length > 0 && (
              <div className="border-t border-slate-100">
                <button onClick={() => setShowClosedLoans((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 text-xs font-medium text-slate-400 hover:bg-slate-50 transition-colors">
                  <span>{closedLoans.length} Closed Loan{closedLoans.length > 1 ? 's' : ''}</span>
                  {showClosedLoans ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showClosedLoans && (
                  <>
                    <table className="hidden md:table min-w-full bg-slate-50/30">
                      <tbody><LoanRows list={closedLoans} muted /></tbody>
                    </table>
                    <div className="md:hidden"><LoanRows list={closedLoans} muted /></div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Loans I Gave (as lender) — grouped by borrower ── */}
      {hasLender && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Loans I Gave</p>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Total: <span className="font-semibold text-indigo-600">{formatCurrency(totalLentPrincipal)}</span></span>
              <span>Income: <span className="font-semibold text-emerald-600">{formatCurrency(monthlyLendIncome)}/mo</span></span>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden">
            {lenderByBorrower.map((g) => (
              <div key={g.phone || g.name} className="border-b border-slate-50 last:border-0">
                {/* Borrower header */}
                <div className="px-5 py-2.5 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                    {g.phone && <p className="text-xs text-slate-400">{g.phone}</p>}
                  </div>
                  {g.loans.length > 1 && (
                    <div className="text-right text-xs">
                      <p className="font-semibold text-indigo-600">{formatCurrency(g.totalPrincipal)}</p>
                      <p className="text-emerald-600">{formatCurrency(g.totalReceipt)}/mo</p>
                    </div>
                  )}
                </div>
                {/* Individual loans */}
                {g.loans.map((l) => (
                  <div key={l.loanId} className="px-5 py-3 flex items-center justify-between border-t border-slate-50/80 ml-3">
                    <div>
                      <p className="text-xs font-mono font-semibold text-indigo-500">{l.loanId}</p>
                      <p className="text-xs text-slate-500">{formatRateAsRupees(l.annualInterestRate)} · Given {formatDate(l.dateGiven)}</p>
                      {l.loanType === 'Through Mediator' && l.mediatorName && (
                        <p className="text-xs text-amber-600 mt-0.5">Via {l.mediatorName}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">{formatCurrency(l.principalAmount)}</p>
                      <div className="flex items-center gap-2 justify-end mt-0.5">
                        <span className="text-xs text-emerald-600">{formatCurrency(l.netMonthlyReceipt)}/mo</span>
                        <StatusBadge status={l.loanStatus} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Desktop */}
          <table className="hidden md:table min-w-full">
            <thead>
              <tr className="border-b border-slate-50">
                {['Borrower', 'Loan', 'Principal', 'Rate', 'Via (Mediator)', 'Monthly Receipt', 'Given On', 'Status'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lenderByBorrower.map((g) => (
                <>
                  {g.loans.length > 1 && (
                    <tr key={`hdr-${g.phone || g.name}`} className="bg-indigo-50/40 border-t border-indigo-100/60">
                      <td className="pl-4 pr-5 py-2.5 border-l-4 border-indigo-300" colSpan={2}>
                        <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                        {g.phone && <p className="text-xs text-slate-400">{g.phone}</p>}
                      </td>
                      <td className="px-5 py-2.5 text-sm font-bold text-indigo-600">{formatCurrency(g.totalPrincipal)}</td>
                      <td className="px-5 py-2.5 text-xs text-slate-400">{g.loans.length} loans</td>
                      <td />
                      <td className="px-5 py-2.5 text-sm font-bold text-emerald-600">{formatCurrency(g.totalReceipt)}/mo</td>
                      <td colSpan={2} />
                    </tr>
                  )}
                  {g.loans.map((l) => (
                    <tr key={l.loanId} className="hover:bg-slate-50/60 border-t border-slate-50">
                      <td className={`py-3 text-sm text-slate-700 ${g.loans.length > 1 ? 'pl-8 pr-5 border-l-4 border-indigo-100' : 'px-5'}`}>
                        {g.loans.length === 1
                          ? <><p className="font-medium">{l.borrowerName}</p>{l.borrowerPhone && <p className="text-xs text-slate-400">{l.borrowerPhone}</p>}</>
                          : null}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{l.loanId}</td>
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{formatCurrency(l.principalAmount)}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{formatRateAsRupees(l.annualInterestRate)}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">
                        {l.loanType === 'Through Mediator' && l.mediatorName
                          ? <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">{l.mediatorName}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(l.netMonthlyReceipt)}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{formatDate(l.dateGiven)}</td>
                      <td className="px-5 py-3"><StatusBadge status={l.loanStatus} /></td>
                    </tr>
                  ))}
                </>
              ))}
              <tr className="border-t-2 border-slate-100 bg-slate-50/60">
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider" colSpan={2}>Total</td>
                <td className="px-5 py-3 text-sm font-bold text-indigo-600">{formatCurrency(totalLentPrincipal)}</td>
                <td colSpan={2} />
                <td className="px-5 py-3 text-sm font-bold text-emerald-600">{formatCurrency(monthlyLendIncome)}/mo</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Loans I Mediated — grouped by borrower ── */}
      {hasMediator && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Loans I Mediated</p>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Principal: <span className="font-semibold text-indigo-600">{formatCurrency(totalMediatedPrincipal)}</span></span>
              <span>Commission: <span className="font-semibold text-emerald-600">{formatCurrency(monthlyCommission)}/mo</span></span>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden">
            {mediatorByBorrower.map((g) => (
              <div key={g.phone || g.name} className="border-b border-slate-50 last:border-0">
                <div className="px-5 py-2.5 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                    {g.phone && <p className="text-xs text-slate-400">{g.phone}</p>}
                  </div>
                  {g.loans.length > 1 && (
                    <div className="text-right text-xs">
                      <p className="font-semibold text-indigo-600">{formatCurrency(g.totalPrincipal)}</p>
                      <p className="text-emerald-600">{formatCurrency(g.totalShare)}/mo</p>
                    </div>
                  )}
                </div>
                {g.loans.map((l) => (
                  <div key={l.loanId} className="px-5 py-3 flex items-center justify-between border-t border-slate-50/80 ml-3">
                    <div>
                      <p className="text-xs font-mono font-semibold text-indigo-500">{l.loanId}</p>
                      <p className="text-xs text-slate-500">{formatCurrency(l.principalAmount)} · {formatRateAsRupees(l.annualInterestRate)}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-slate-400">{l.lenderName || 'Admin'}</span>
                        <ArrowRight size={10} className="text-slate-300" />
                        <span className="text-xs text-slate-400">You</span>
                        <ArrowRight size={10} className="text-slate-300" />
                        <span className="text-xs text-slate-400">{l.borrowerName}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-emerald-600 font-semibold">{formatCurrency(l.mediatorMonthlyShare)}/mo</p>
                      <StatusBadge status={l.loanStatus} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Desktop */}
          <table className="hidden md:table min-w-full">
            <thead>
              <tr className="border-b border-slate-50">
                {['Loan Flow (Lender → Borrower)', 'Loan', 'Principal', 'Monthly Interest', 'My Share / mo', 'Status'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mediatorByBorrower.map((g) => (
                <>
                  {g.loans.length > 1 && (
                    <tr key={`hdr-${g.phone || g.name}`} className="bg-indigo-50/40 border-t border-indigo-100/60">
                      <td className="pl-4 pr-5 py-2.5 border-l-4 border-indigo-300" colSpan={2}>
                        <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                        {g.phone && <p className="text-xs text-slate-400">{g.phone} · {g.loans.length} loans</p>}
                      </td>
                      <td className="px-5 py-2.5 text-sm font-bold text-indigo-600">{formatCurrency(g.totalPrincipal)}</td>
                      <td className="px-5 py-2.5 text-sm text-slate-500">{formatCurrency(g.totalMonthlyInterest)}</td>
                      <td className="px-5 py-2.5 text-sm font-bold text-emerald-600">{formatCurrency(g.totalShare)}/mo</td>
                      <td />
                    </tr>
                  )}
                  {g.loans.map((l) => (
                    <tr key={l.loanId} className="hover:bg-slate-50/60 border-t border-slate-50">
                      <td className={`py-3 ${g.loans.length > 1 ? 'pl-8 pr-5 border-l-4 border-indigo-100' : 'px-5'}`}>
                        {/* Loan chain flow */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                            {l.lenderName || 'Admin'}
                          </span>
                          <ArrowRight size={12} className="text-slate-300 shrink-0" />
                          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">You</span>
                          <ArrowRight size={12} className="text-slate-300 shrink-0" />
                          <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                            {g.loans.length === 1 ? l.borrowerName : l.borrowerName}
                          </span>
                        </div>
                        {g.loans.length === 1 && l.borrowerPhone && (
                          <p className="text-xs text-slate-400 mt-0.5 pl-0.5">{l.borrowerPhone}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{l.loanId}</td>
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{formatCurrency(l.principalAmount)}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{formatCurrency(l.monthlyInterestAmount)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(l.mediatorMonthlyShare)}</td>
                      <td className="px-5 py-3"><StatusBadge status={l.loanStatus} /></td>
                    </tr>
                  ))}
                </>
              ))}
              <tr className="border-t-2 border-slate-100 bg-slate-50/60">
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider" colSpan={2}>Total</td>
                <td className="px-5 py-3 text-sm font-bold text-indigo-600">{formatCurrency(totalMediatedPrincipal)}</td>
                <td className="px-5 py-3 text-sm text-slate-600">{formatCurrency(mediatorLoans.reduce((s, l) => s + l.monthlyInterestAmount, 0))}</td>
                <td className="px-5 py-3 text-sm font-bold text-emerald-600">{formatCurrency(monthlyCommission)}/mo</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Payment history ── */}
      {myPayments.length > 0 && (() => {
        const pendingFirst = (s: string) => (s === 'Received' || s === 'Waived' ? 1 : 0);
        const sorted = [...myPayments]
          .sort((a, b) => {
            const statusDiff = pendingFirst(a.paymentStatus) - pendingFirst(b.paymentStatus);
            if (statusDiff !== 0) return statusDiff;
            return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
          })
          .slice(0, 30);
        return (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Payment History</p>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-slate-50">
              {sorted.map((p) => (
                <div key={p.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono font-semibold text-indigo-500">{p.loanId}</p>
                    <p className="text-sm text-slate-700">{p.borrowerName} · {p.monthYear}</p>
                    <p className="text-xs text-slate-400">Due {formatDate(p.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lenderLoanIds.has(p.loanId) && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived' && (
                      <button onClick={() => handleMarkReceived(p.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all shadow-sm">
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">{formatCurrency(borrowerLoanIds.has(p.loanId) ? p.interestAmount : p.netAmountExpected)}</p>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <StatusBadge status={p.paymentStatus} label={borrowerLoanIds.has(p.loanId) && p.paymentStatus === 'Received' ? 'Paid' : undefined} />
                        {p.daysOverdue > 0 && <span className="text-xs text-red-500">{p.daysOverdue}d</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <table className="hidden md:table min-w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  {['Loan', 'Borrower', 'Month', 'Due Date', 'Amount', 'Status', ''].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{p.loanId}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">{p.borrowerName}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{p.monthYear}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{formatDate(p.dueDate)}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-slate-800">{formatCurrency(borrowerLoanIds.has(p.loanId) ? p.interestAmount : p.netAmountExpected)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.paymentStatus} label={borrowerLoanIds.has(p.loanId) && p.paymentStatus === 'Received' ? 'Paid' : undefined} />
                        {p.daysOverdue > 0 && <span className="text-xs text-red-500">{p.daysOverdue}d overdue</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {lenderLoanIds.has(p.loanId) && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived' && (
                        <button onClick={() => handleMarkReceived(p.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-3 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap">
                          <CheckCircle2 size={13} /> Mark Received
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {!hasBorrower && !hasMediator && !hasLender && (
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-slate-400">No loans found for your phone number</p>
          <button
            onClick={() => navigate('/add-loan')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600"
          >
            <Plus size={15} /> Add Loan
          </button>
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
