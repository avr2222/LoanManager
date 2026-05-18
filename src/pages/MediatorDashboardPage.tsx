import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, ArrowRight, ChevronDown, ChevronUp, CheckCircle2, Users, X, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LoanForm } from '@/components/loans/LoanForm';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line } from 'recharts';
import { useLoans } from '@/context/LoanContext';
import type { Loan } from '@/types';
import { usePayments } from '@/context/PaymentContext';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate, ordinal, formatRateAsRupees, formatMonthYear } from '@/utils/formatUtils';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/Toast';
import { WhatsAppButton } from '@/components/common/WhatsAppButton';
import { overdueMessage, dueMessage } from '@/utils/whatsappUtils';
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

export function MediatorDashboardPage() {
  const { loans, updateLoan, deleteLoan } = useLoans();
  const { payments, updatePayment, deletePaymentsByLoan } = usePayments();
  const { userPhone, hasFullAccess, isAdmin, profile, phone: profilePhone, adminPhone } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [showClosedLoans, setShowClosedLoans]   = useState(false);
  const [viewAsPhone, setViewAsPhone]           = useState('');
  const [viewAsName, setViewAsName]             = useState('');
  const [showUserPicker, setShowUserPicker]     = useState(false);
  const [editingLoan, setEditingLoan]           = useState<Loan | undefined>();
  const [deletingLoanId, setDeletingLoanId]     = useState<string | null>(null);

  const isViewAs = !!viewAsPhone;

  // Admin (no view-as): uses their own phone for role filters like any other user.
  // profilePhone (profiles.phone) is preferred; adminPhone (user_metadata) is fallback
  // in case profiles.phone was not synced when admin first set their phone.
  const myPhone = norm(viewAsPhone || profilePhone || adminPhone || userPhone);

  const borrowerLoans = useMemo(() => {
    if (!myPhone) return [];
    return loans.filter((l) => l.loanStatus === 'Active' && norm(l.borrowerPhone) === myPhone);
  }, [loans, myPhone]);

  const mediatorLoans = useMemo(() => {
    if (!myPhone) return [];
    return loans.filter((l) => l.loanStatus === 'Active' && l.loanType === 'Through Mediator' && norm(l.mediatorPhone ?? '') === myPhone);
  }, [loans, myPhone]);

  const lenderLoans = useMemo(() => {
    if (!myPhone) return [];
    return loans.filter((l) => l.loanStatus === 'Active' && l.lenderPhone && norm(l.lenderPhone) === myPhone);
  }, [loans, myPhone]);

  // System-wide stats for admin overview (only when not viewing as another user)
  const adminStats = useMemo(() => {
    if (!isAdmin || isViewAs) return null;
    const active = loans.filter((l) => l.loanStatus === 'Active');
    return {
      totalLoans:    active.length,
      closedLoans:   loans.length - active.length,
      totalPrincipal: active.reduce((s, l) => s + l.principalAmount, 0),
      monthlyExpected: active.reduce((s, l) => s + l.netMonthlyReceipt, 0),
      totalOverdue: new Set(
        payments
          .filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived')
          .map((p) => p.loanId)
      ).size,
    };
  }, [loans, payments, isAdmin, isViewAs]);

  // Known phone users for admin "View As" picker
  const knownUsers = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, string>();
    for (const l of loans) {
      if (l.borrowerPhone) map.set(norm(l.borrowerPhone), l.borrowerName);
      if (l.mediatorPhone) map.set(norm(l.mediatorPhone), l.mediatorName || l.mediatorPhone);
      if (l.lenderPhone)  map.set(norm(l.lenderPhone),  l.lenderName   || l.lenderPhone);
    }
    return Array.from(map.entries())
      .map(([phone, name]) => ({ phone, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loans, isAdmin]);

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

  const myPayments = useMemo(() => {
    // Admin with no personal loans: show all payments (system-wide overview)
    if (isAdmin && !isViewAs && allMyLoanIds.size === 0) return payments;
    return payments.filter((p) => allMyLoanIds.has(p.loanId));
  }, [payments, allMyLoanIds, isAdmin, isViewAs]);

  // Claimed by borrower, awaiting lender verification
  const claimedPayments = useMemo(() =>
    myPayments
      .filter((p) => p.paymentStatus === 'Claimed')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [myPayments]
  );

  // Overdue excludes claimed (borrower has already initiated payment)
  const overduePayments = useMemo(() =>
    myPayments
      .filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived' && p.paymentStatus !== 'Claimed')
      .sort((a, b) => b.daysOverdue - a.daysOverdue),
    [myPayments]
  );

  const upcomingPayments = useMemo(() => {
    const today = new Date();
    const in45  = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
    return myPayments
      .filter((p) => {
        if (p.paymentStatus === 'Received' || p.paymentStatus === 'Waived' || p.paymentStatus === 'Claimed') return false;
        if (p.daysOverdue > 0) return false;
        const due = new Date(p.dueDate);
        return due >= today && due <= in45;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [myPayments]);

  // KPI amounts — active loans only (base arrays already filtered to Active)
  const totalBorrowed          = borrowerLoans.reduce((s, l) => s + l.principalAmount, 0);
  const totalMonthlyDue        = borrowerLoans.reduce((s, l) => s + l.monthlyInterestAmount, 0);
  const monthlyCommission      = mediatorLoans.reduce((s, l) => s + l.mediatorMonthlyShare, 0);
  const totalMediatedPrincipal = mediatorLoans.reduce((s, l) => s + l.principalAmount, 0);
  const monthlyLendIncome      = lenderLoans.reduce((s, l) => s + l.netMonthlyReceipt, 0);
  const totalLentPrincipal     = lenderLoans.reduce((s, l) => s + l.principalAmount, 0);
  const netMonthly             = monthlyLendIncome + monthlyCommission - totalMonthlyDue;
  const overdueCount           = myPayments.filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived').length;

  // Loans where I am the lender — only I can mark payments as received
  const lenderLoanIds   = useMemo(() => new Set(lenderLoans.map((l) => l.loanId)),   [lenderLoans]);
  // Loans where I am the borrower — show full interest amount and "Paid" label
  const borrowerLoanIds = useMemo(() => new Set(borrowerLoans.map((l) => l.loanId)), [borrowerLoans]);
  // Loans where I am the mediator — show lender context in overdue/upcoming tables
  const mediatorLoanIds = useMemo(() => new Set(mediatorLoans.map((l) => l.loanId)), [mediatorLoans]);

  const hasBorrower = borrowerLoans.length > 0;
  const hasMediator = mediatorLoans.length > 0;
  const hasLender   = lenderLoans.length > 0;

  // ── This month collection stats ──────────────────────────────
  const thisMonthStats = useMemo(() => {
    const now = new Date();
    const currentLabel = formatMonthYear(now); // "May-2026" — same format as payment.monthYear
    const mp = myPayments.filter((p) => p.monthYear === currentLabel);
    const monthFull = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
const expected  = mp.reduce((s, p) => s + p.netAmountExpected, 0);
    const collected = mp.reduce((s, p) => s + p.amountReceived, 0);
    const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
    return { label: monthFull, expected, collected, rate, pending: Math.max(0, expected - collected) };
  }, [myPayments]);

  // ── Monthly Expected vs Received chart (last 6 months) ──────
  const monthlyChartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      // Use formatMonthYear so keys match payment.monthYear exactly ("May-2026")
      const key = formatMonthYear(d);
      const shortMonth = d.toLocaleString('en-IN', { month: 'short' }); // "May"

      let expected = 0, received = 0, commission = 0, due = 0, paid = 0;
      for (const p of myPayments) {
        if (p.monthYear !== key) continue;
        if (isAdmin && !isViewAs) {
          expected += p.netAmountExpected;
          received += p.amountReceived;
        } else {
          if (lenderLoanIds.has(p.loanId))                              { expected += p.netAmountExpected; received += p.amountReceived; }
          if (mediatorLoans.some((l) => l.loanId === p.loanId))         { commission += p.mediatorShare; }
          if (borrowerLoanIds.has(p.loanId))                            { due += p.netAmountExpected; paid += p.amountReceived; }
        }
      }

      return {
        month: shortMonth,
        Expected: expected, Received: received,
        Commission: commission, Due: due, Paid: paid,
        Rate: expected > 0 ? Math.round((received / expected) * 100) : 0,
      };
    });
  }, [myPayments, lenderLoanIds, mediatorLoans, borrowerLoanIds]);

  const showChart = (hasLender || hasMediator || hasBorrower) &&
    monthlyChartData.some((d) => d.Expected > 0 || d.Commission > 0 || d.Due > 0);

  async function handleUpdateLoan(loan: Loan) {
    try {
      await updateLoan(loan);
      setEditingLoan(undefined);
      showSuccess('Loan updated');
    } catch {
      showError('Failed to update loan');
    }
  }

  async function handleDeleteLoan() {
    if (!deletingLoanId) return;
    try {
      await deletePaymentsByLoan(deletingLoanId);
      await deleteLoan(deletingLoanId);
      setDeletingLoanId(null);
      showSuccess('Loan deleted');
    } catch {
      showError('Failed to delete loan');
    }
  }

  const deletingLoan = loans.find((l) => l.loanId === deletingLoanId);


  async function handleVerifyPayment(paymentId: string) {
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
      showSuccess(`Verified — ${payment.borrowerName} ${payment.monthYear} marked as received`);
    } catch {
      showError('Failed to verify payment');
    }
  }

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
            onClick={() => { setViewAsPhone(''); setViewAsName(''); }}
            className="text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Back to My Dashboard
          </button>
        </div>
      )}

      {/* View-only banner for phone users who haven't set a password */}
      {!isViewAs && !hasFullAccess && !isAdmin && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <p className="text-sm text-indigo-700">
            <span className="font-semibold">View-only mode.</span> Sign out and log in with your password to add loans or mark payments.
          </p>
        </div>
      )}

      {/* Header action row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!isViewAs && hasFullAccess && (
            <button
              onClick={() => navigate('/add-loan')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 active:scale-95 transition-all shadow-sm"
            >
              <Plus size={16} /> Add Loan
            </button>
          )}
          {isAdmin && !isViewAs && knownUsers.length > 0 && (
            <button
              onClick={() => setShowUserPicker(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <Users size={15} /> View as User
            </button>
          )}
        </div>
        {(hasBorrower || hasMediator || hasLender) && (
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-rose-500 rounded-lg hover:bg-rose-600 active:scale-95 transition-all shadow-sm"
          >
            <FileText size={15} /> Statement
          </button>
        )}
      </div>

      {/* ── Admin system-wide overview — only when admin has no personal loans ── */}
      {isAdmin && !isViewAs && adminStats && !hasLender && !hasBorrower && !hasMediator && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">System Overview</p>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label="Active Loans"
              value={String(adminStats.totalLoans)}
              sub={adminStats.closedLoans > 0 ? `${adminStats.closedLoans} closed` : `${loans.length} total`}
            />
            <KpiCard
              label="Total Principal"
              value={formatCurrency(adminStats.totalPrincipal)}
              color="indigo"
            />
            <KpiCard
              label="Total Mthly Due"
              value={formatCurrency(adminStats.monthlyExpected)}
              color="green"
            />
            <KpiCard
              label="Overdue"
              value={String(adminStats.totalOverdue)}
              color="red"
              sub={adminStats.totalOverdue > 0 ? 'loans overdue' : 'all on time'}
            />
          </div>
        </div>
      )}

      {/* ── KPI cards — one row per role ── */}
      {hasBorrower && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard label="Loans Taken"    value={String(borrowerLoans.length)} />
          <KpiCard label="Total Borrowed" value={formatCurrency(totalBorrowed)}  color="indigo" />
          <KpiCard label="Monthly Pay"    value={formatCurrency(totalMonthlyDue)} color="red" />
        </div>
      )}

      {hasLender && !hasMediator && !hasBorrower ? (
        // Lender only: 2×2 grid — no orphaned card on mobile
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Loans Given"  value={String(lenderLoans.length)}
            sub={`${lenderByBorrower.length} borrowers`} />
          <KpiCard label="Total Lent"   value={formatCurrency(totalLentPrincipal)} color="indigo" />
          <KpiCard label="Monthly Earn" value={formatCurrency(monthlyLendIncome)}  color="green" />
          <KpiCard label="Overdue"      value={String(overdueCount)} color="red"
            sub={overdueCount > 0 ? 'payments late' : 'all on time'} />
        </div>
      ) : hasLender ? (
        // Lender with other roles: 3-card row + separate net/overdue below
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Loans Given"  value={String(lenderLoans.length)}
              sub={`${lenderByBorrower.length} borrowers`} />
            <KpiCard label="Total Lent"   value={formatCurrency(totalLentPrincipal)} color="indigo" />
            <KpiCard label="Monthly Earn" value={formatCurrency(monthlyLendIncome)}  color="green" />
          </div>
          {!hasMediator && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
        </>
      ) : null}

      {hasMediator && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Loans Mediated"     value={String(mediatorLoans.length)}
            sub={`${mediatorByBorrower.length} borrowers`} />
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

      {!hasLender && !hasMediator && hasBorrower && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard
            label="Overdue"
            value={String(overdueCount)}
            color="red"
          />
        </div>
      )}

      {/* ── This Month Collection ── */}
      {thisMonthStats.expected > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {thisMonthStats.label} — Collection Progress
            </p>
            <span className={`text-sm font-bold ${
              thisMonthStats.rate >= 90 ? 'text-emerald-500' :
              thisMonthStats.rate >= 60 ? 'text-amber-500' : 'text-red-500'
            }`}>{thisMonthStats.rate}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                thisMonthStats.rate >= 90 ? 'bg-emerald-500' :
                thisMonthStats.rate >= 60 ? 'bg-amber-400' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(100, thisMonthStats.rate)}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-400 mb-1">Expected</p>
              <p className="text-base font-bold text-slate-700">{formatCurrency(thisMonthStats.expected)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Collected</p>
              <p className="text-base font-bold text-emerald-600">{formatCurrency(thisMonthStats.collected)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Pending</p>
              <p className={`text-base font-bold ${thisMonthStats.pending > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {formatCurrency(thisMonthStats.pending)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Monthly chart ── */}
      {showChart && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
            Monthly Summary — Last 6 Months
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthlyChartData} barCategoryGap="30%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`}
                width={48}
              />
              {hasLender && (
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={36} />
              )}
              <Tooltip
                formatter={(value, name) => name === 'Rate %'
                  ? [`${value}%`, 'Rate %']
                  : [formatCurrency(typeof value === 'number' ? value : 0), String(name ?? '')]}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {hasLender && (
                <Bar yAxisId="left" dataKey="Expected" name="Expected" fill="#6366f1" radius={[4, 4, 0, 0]} />
              )}
              {hasLender && (
                <Bar yAxisId="left" dataKey="Received" name="Received" fill="#10b981" radius={[4, 4, 0, 0]} />
              )}
              {hasMediator && (
                <Bar yAxisId="left" dataKey="Commission" name="Commission" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              )}
              {hasBorrower && !hasLender && (
                <Bar yAxisId="left" dataKey="Due" name="Interest Due" fill="#e879f9" radius={[4, 4, 0, 0]} />
              )}
              {hasBorrower && !hasLender && (
                <Bar yAxisId="left" dataKey="Paid" name="Interest Paid" fill="#10b981" radius={[4, 4, 0, 0]} />
              )}
              {hasLender && (
                <Line yAxisId="right" dataKey="Rate" name="Rate %" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Pending Verification (borrower claimed, lender to confirm) ── */}
      {claimedPayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-violet-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-violet-100 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #f5f3ff, #fff)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">
                {lenderLoanIds.size > 0 ? 'Pending Verification' : 'Awaiting Confirmation'}
              </p>
            </div>
            <span className="text-xs font-bold text-white bg-violet-500 px-2 py-0.5 rounded-full">
              {claimedPayments.length}
            </span>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-slate-50">
            {claimedPayments.map((p) => (
              <div key={p.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono font-semibold text-indigo-500">{p.loanId}</p>
                  <p className="text-sm font-medium text-slate-800">{p.borrowerName}</p>
                  <p className="text-xs text-violet-600 mt-0.5">{p.monthYear} · {p.dueDate}</p>
                  {p.remarks && p.remarks.includes('UTR:') && (
                    <p className="text-xs text-slate-400 mt-0.5">{p.remarks.slice(p.remarks.indexOf('UTR:'))}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasFullAccess && lenderLoanIds.has(p.loanId) && (
                    <button onClick={() => handleVerifyPayment(p.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-white bg-violet-500 hover:bg-violet-600 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap">
                      <CheckCircle2 size={13} /> Verify
                    </button>
                  )}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-violet-600">{formatCurrency(p.netAmountExpected)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Claimed</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <table className="hidden md:table min-w-full">
            <thead>
              <tr className="border-b border-violet-50">
                {['Loan', 'Borrower', 'Month', 'Due Date', 'Amount', 'UTR / Note', ''].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claimedPayments.map((p) => (
                <tr key={p.id} className="border-t border-violet-50 hover:bg-violet-50/20">
                  <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{p.loanId}</td>
                  <td className="px-5 py-3 text-sm font-medium text-slate-800">{p.borrowerName}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">{p.monthYear}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{p.dueDate}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-violet-600">{formatCurrency(p.netAmountExpected)}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {p.remarks?.includes('UTR:')
                      ? p.remarks.slice(p.remarks.indexOf('UTR:'))
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {hasFullAccess && lenderLoanIds.has(p.loanId) && (
                      <button onClick={() => handleVerifyPayment(p.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-500 hover:bg-violet-600 active:scale-95 px-3 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap">
                        <CheckCircle2 size={13} /> Verify & Confirm
                      </button>
                    )}
                    {borrowerLoanIds.has(p.loanId) && (
                      <span className="text-xs text-violet-600 font-medium">Awaiting lender</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Overdue Payments ── */}
      {overduePayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-red-100 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #fef2f2, #fff)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <p className="text-xs font-semibold text-red-700 uppercase tracking-widest">Overdue Payments</p>
            </div>
            <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">
              {overduePayments.length}
            </span>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-slate-50">
            {overduePayments.map((p) => (
              <div key={p.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono font-semibold text-indigo-500">{p.loanId}</p>
                  <p className="text-sm font-medium text-slate-800">{p.borrowerName}</p>
                  {mediatorLoanIds.has(p.loanId) && (
                    <p className="text-xs text-slate-400">via {loans.find(l => l.loanId === p.loanId)?.lenderName || 'Lender'}</p>
                  )}
                  <p className="text-xs text-red-500 font-semibold mt-0.5">{p.daysOverdue} days overdue · Due {p.dueDate}</p>
                </div>
                <div className="flex items-center gap-2">
                  {lenderLoanIds.has(p.loanId) && (
                    <WhatsAppButton
                      phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                      message={overdueMessage({ borrowerName: p.borrowerName, amount: p.netAmountExpected, monthYear: p.monthYear, daysOverdue: p.daysOverdue, upiId: profile?.upiId ?? undefined })}
                    />
                  )}
                  {mediatorLoanIds.has(p.loanId) && (() => {
                    const loan = loans.find(l => l.loanId === p.loanId);
                    return loan?.lenderPhone ? (
                      <WhatsAppButton
                        phone={loan.lenderPhone}
                        message={`Hi ${loan.lenderName || 'there'}, ${p.borrowerName}'s payment for ${p.monthYear} is overdue by ${p.daysOverdue} days (₹${p.netAmountExpected}). Please follow up.`}
                      />
                    ) : null;
                  })()}
                  {hasFullAccess && lenderLoanIds.has(p.loanId) && (
                    <button onClick={() => handleMarkReceived(p.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all shadow-sm">
                      <CheckCircle2 size={13} />
                    </button>
                  )}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">{formatCurrency(borrowerLoanIds.has(p.loanId) ? p.interestAmount : p.netAmountExpected)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{p.monthYear}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <table className="hidden md:table min-w-full">
            <thead>
              <tr className="border-b border-red-50">
                {['Loan', 'Borrower', 'Month', 'Due Date', 'Overdue', 'Amount', ''].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overduePayments.map((p) => (
                <tr key={p.id} className="border-t border-red-50 hover:bg-red-50/30">
                  <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{p.loanId}</td>
                  <td className="px-5 py-3">
                    <div className="text-sm font-medium text-slate-800">{p.borrowerName}</div>
                    {mediatorLoanIds.has(p.loanId) && !lenderLoanIds.has(p.loanId) && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Lender: {loans.find(l => l.loanId === p.loanId)?.lenderName || '—'}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">{p.monthYear}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{p.dueDate}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{p.daysOverdue}d late</span>
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-red-600">{formatCurrency(borrowerLoanIds.has(p.loanId) ? p.interestAmount : p.netAmountExpected)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {lenderLoanIds.has(p.loanId) && (
                        <WhatsAppButton
                          phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                          message={overdueMessage({ borrowerName: p.borrowerName, amount: p.netAmountExpected, monthYear: p.monthYear, daysOverdue: p.daysOverdue, upiId: profile?.upiId ?? undefined })}
                        />
                      )}
                      {mediatorLoanIds.has(p.loanId) && (() => {
                        const loan = loans.find(l => l.loanId === p.loanId);
                        return loan?.lenderPhone ? (
                          <WhatsAppButton
                            phone={loan.lenderPhone}
                            message={`Hi ${loan.lenderName || 'there'}, ${p.borrowerName}'s payment for ${p.monthYear} is overdue by ${p.daysOverdue} days (₹${p.netAmountExpected}). Please follow up.`}
                          />
                        ) : null;
                      })()}
                      {hasFullAccess && lenderLoanIds.has(p.loanId) && (
                        <button onClick={() => handleMarkReceived(p.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-3 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap">
                          <CheckCircle2 size={13} /> Mark Received
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Upcoming Payments ── */}
      {upcomingPayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-100 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #fffbeb, #fff)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest">Upcoming Payments</p>
            </div>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">
              {upcomingPayments.length}
            </span>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-slate-50">
            {upcomingPayments.map((p) => (
              <div key={p.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono font-semibold text-indigo-500">{p.loanId}</p>
                  <p className="text-sm font-medium text-slate-800">{p.borrowerName}</p>
                  {mediatorLoanIds.has(p.loanId) && !lenderLoanIds.has(p.loanId) && (
                    <p className="text-xs text-slate-400 mt-0.5">Lender: {loans.find(l => l.loanId === p.loanId)?.lenderName || '—'}</p>
                  )}
                  <p className="text-xs text-amber-600 mt-0.5">Due {p.dueDate} · {p.monthYear}</p>
                </div>
                <div className="flex items-center gap-2">
                  {lenderLoanIds.has(p.loanId) && (
                    <WhatsAppButton
                      phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                      message={dueMessage({ borrowerName: p.borrowerName, amount: p.netAmountExpected, monthYear: p.monthYear, dueDate: p.dueDate, upiId: profile?.upiId ?? undefined })}
                    />
                  )}
                  {hasFullAccess && lenderLoanIds.has(p.loanId) && (
                    <button onClick={() => handleMarkReceived(p.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all shadow-sm">
                      <CheckCircle2 size={13} />
                    </button>
                  )}
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(borrowerLoanIds.has(p.loanId) ? p.interestAmount : p.netAmountExpected)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <table className="hidden md:table min-w-full">
            <thead>
              <tr className="border-b border-amber-50">
                {['Loan', 'Borrower', 'Month', 'Due Date', 'Amount', ''].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingPayments.map((p) => (
                <tr key={p.id} className="border-t border-amber-50 hover:bg-amber-50/30">
                  <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{p.loanId}</td>
                  <td className="px-5 py-3">
                    <div className="text-sm font-medium text-slate-800">{p.borrowerName}</div>
                    {mediatorLoanIds.has(p.loanId) && !lenderLoanIds.has(p.loanId) && (
                      <div className="text-xs text-slate-400 mt-0.5">Lender: {loans.find(l => l.loanId === p.loanId)?.lenderName || '—'}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">{p.monthYear}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">{p.dueDate}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-slate-800">{formatCurrency(borrowerLoanIds.has(p.loanId) ? p.interestAmount : p.netAmountExpected)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {lenderLoanIds.has(p.loanId) && (
                        <WhatsAppButton
                          phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                          message={dueMessage({ borrowerName: p.borrowerName, amount: p.netAmountExpected, monthYear: p.monthYear, dueDate: p.dueDate, upiId: profile?.upiId ?? undefined })}
                        />
                      )}
                      {hasFullAccess && lenderLoanIds.has(p.loanId) && (
                        <button onClick={() => handleMarkReceived(p.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-3 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap">
                          <CheckCircle2 size={13} /> Mark Received
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── My Loans (as borrower) ── */}
      {hasBorrower && (() => {
        const activeLoans = borrowerLoans.filter((l) => l.loanStatus === 'Active');
        const closedLoans = borrowerLoans.filter((l) => l.loanStatus !== 'Active');

        const loanSource = (l: typeof borrowerLoans[0]) =>
          l.loanType === 'Through Mediator' && l.mediatorName ? l.mediatorName : (l.lenderName || 'Admin');

        const canEditBorrower = !isViewAs && hasFullAccess;

        const LoanRows = ({ list, muted, showActions }: { list: typeof borrowerLoans; muted?: boolean; showActions?: boolean }) => (<>
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
                {canEditBorrower && showActions && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setEditingLoan(l)} className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => setDeletingLoanId(l.loanId)} className="flex items-center gap-1 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}
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
              <td className="px-5 py-3">
                {canEditBorrower && showActions && (
                  <div className="flex gap-1">
                    <button onClick={() => setEditingLoan(l)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => setDeletingLoanId(l.loanId)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                )}
              </td>
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
                  {['Loan','From','Principal','Rate','Monthly Due','Date Given','Age','Status', ''].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody><LoanRows list={activeLoans} showActions /></tbody>
              </table>
            )}
            <div className="md:hidden">
              {activeLoans.length === 0
                ? <div className="px-5 py-6 text-sm text-slate-400">No active loans</div>
                : <LoanRows list={activeLoans} showActions />}
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
                      <tbody><LoanRows list={closedLoans} muted showActions /></tbody>
                    </table>
                    <div className="md:hidden"><LoanRows list={closedLoans} muted showActions /></div>
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

      {/* View As User picker — admin only */}
      {showUserPicker && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={() => setShowUserPicker(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm z-10">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">View as User</h2>
                <button onClick={() => setShowUserPicker(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={18} />
                </button>
              </div>
              <div className="p-2 max-h-80 overflow-y-auto">
                {knownUsers.map(({ phone, name }) => (
                  <button
                    key={phone}
                    onClick={() => { setViewAsPhone(phone); setViewAsName(name); setShowUserPicker(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold shrink-0">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{name}</p>
                      <p className="text-xs text-slate-400">{phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingLoan && (
        <Modal title="Edit Loan" onClose={() => setEditingLoan(undefined)}>
          <LoanForm
            initialValues={editingLoan}
            onSubmit={handleUpdateLoan}
            onCancel={() => setEditingLoan(undefined)}
          />
        </Modal>
      )}

      {deletingLoanId && deletingLoan && (
        <ConfirmDialog
          title="Delete Loan?"
          message={`This will permanently delete loan ${deletingLoanId} and all associated payment records.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteLoan}
          onCancel={() => setDeletingLoanId(null)}
        />
      )}
    </div>
  );
}
