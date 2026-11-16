import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, RefreshCw, Trash2 } from 'lucide-react';
import type { Loan, Payment } from '@/types';
import { loansService, paymentsService } from '@/services/supabaseService';
import { profilesService } from '@/services/profilesService';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/components/common/Toast';
import { PageSkeleton } from '@/components/common/Skeleton';
import { formatCurrency } from '@/utils/formatUtils';

/** A loan and its payments are deleted moments apart; anything deleted within
 *  this window before the loan counts as "deleted with the loan". */
const WITH_LOAN_WINDOW_MS = 5 * 60 * 1000;

function deletedWithLoanSinceMs(loan: Loan): number {
  const t = loan.deletedAt ? new Date(loan.deletedAt).getTime() : Date.now();
  return t - WITH_LOAN_WINDOW_MS;
}

function deletedWithLoanSince(loan: Loan): string {
  return new Date(deletedWithLoanSinceMs(loan)).toISOString();
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface TrashData {
  loans: Loan[];
  payments: Payment[];
  /** deleted_by → display name. deleted_by holds a user id (newer rows) or a phone / email (older rows). */
  names: Map<string, string>;
}

async function fetchTrash(): Promise<TrashData> {
  const [loans, payments, profiles] = await Promise.all([
    loansService.fetchDeleted(),
    paymentsService.fetchDeleted(),
    profilesService.listAll(),
  ]);
  const names = new Map<string, string>();
  for (const pr of profiles) {
    const name = pr.fullName || pr.displayName || pr.email || pr.phone;
    if (!name) continue;
    names.set(pr.id, name);
    if (pr.phone) names.set(pr.phone, name);
    if (pr.email) names.set(pr.email, name);
  }
  return { loans, payments, names };
}

export function TrashPage() {
  const { t } = useTranslation();
  const { refreshData } = useApp();
  const { showSuccess, showError } = useToast();

  const [tab, setTab] = useState<'loans' | 'payments'>('loans');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function apply(data: TrashData) {
    setLoans(data.loans);
    setPayments(data.payments);
    setNames(data.names);
  }

  // Initial load — runs once. (The toast functions change identity whenever a
  // toast is shown, so they must not be dependencies here.)
  useEffect(() => {
    let cancelled = false;
    fetchTrash()
      .then((data) => { if (!cancelled) apply(data); })
      .catch((err) => { console.error(err); if (!cancelled) showError(t('trash.loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    setLoading(true);
    try {
      apply(await fetchTrash());
    } catch (err) {
      console.error(err);
      showError(t('trash.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  const deletedLoanIds = useMemo(() => new Set(loans.map((l) => l.loanId)), [loans]);

  // Payments of a deleted loan come back with the loan — list only the rest here.
  const standalonePayments = useMemo(
    () => payments.filter((p) => !deletedLoanIds.has(p.loanId)),
    [payments, deletedLoanIds]
  );

  // How many payments would be restored together with each deleted loan
  const paymentsWithLoan = useMemo(() => {
    const counts = new Map<string, number>();
    for (const loan of loans) {
      const since = deletedWithLoanSinceMs(loan);
      counts.set(
        loan.loanId,
        payments.filter(
          (p) => p.loanId === loan.loanId && !!p.deletedAt && new Date(p.deletedAt).getTime() >= since
        ).length
      );
    }
    return counts;
  }, [loans, payments]);

  const who = (deletedBy?: string | null) => (deletedBy ? names.get(deletedBy) ?? deletedBy : '');

  async function handleRestoreLoan(loan: Loan) {
    setBusyId(loan.loanId);
    try {
      await loansService.restore(loan.loanId);
      try {
        await paymentsService.restoreByLoan(loan.loanId, deletedWithLoanSince(loan));
        showSuccess(t('trash.loanRestored', { id: loan.loanId }));
      } catch (err) {
        console.error(err);
        showError(t('trash.loanRestoredPaymentsFailed', { id: loan.loanId }));
      }
      await Promise.all([reload(), refreshData()]);
    } catch (err) {
      console.error(err);
      showError(t('trash.restoreFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestorePayment(payment: Payment) {
    setBusyId(payment.id);
    try {
      await paymentsService.restore(payment.id);
      showSuccess(t('trash.paymentRestored'));
      await Promise.all([reload(), refreshData()]);
    } catch (err) {
      console.error(err);
      // 23505 = unique violation: an active payment for that loan + month exists
      const code = (err as { code?: string }).code;
      showError(code === '23505' ? t('trash.paymentConflict', { month: payment.monthYear }) : t('trash.restoreFailed'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading && loans.length === 0 && payments.length === 0) return <PageSkeleton />;

  const tabClass = (active: boolean) =>
    `px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`;

  const restoreButton = (id: string, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={busyId !== null}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors shrink-0"
    >
      <RotateCcw size={13} />
      {busyId === id ? t('trash.restoring') : t('trash.restore')}
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Trash2 size={18} className="text-slate-400" /> {t('trash.title')}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{t('trash.subtitle')}</p>
        </div>
        <button
          onClick={() => void reload()}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button className={tabClass(tab === 'loans')} onClick={() => setTab('loans')}>
          {t('trash.loansTab', { count: loans.length })}
        </button>
        <button className={tabClass(tab === 'payments')} onClick={() => setTab('payments')}>
          {t('trash.paymentsTab', { count: standalonePayments.length })}
        </button>
      </div>

      {tab === 'loans' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {loans.length === 0 ? (
            <p className="px-5 py-10 text-sm text-slate-400 text-center">{t('trash.emptyLoans')}</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {loans.map((loan) => {
                const withIt = paymentsWithLoan.get(loan.loanId) ?? 0;
                return (
                  <div key={loan.loanId} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {loan.borrowerName}
                        <span className="ml-2 text-xs font-mono font-semibold text-indigo-400">{loan.loanId}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatCurrency(loan.principalAmount)} · {loan.loanStatus}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t('trash.deletedOn', { date: formatDateTime(loan.deletedAt) })}
                        {who(loan.deletedBy) && ` ${t('trash.deletedBy', { name: who(loan.deletedBy) })}`}
                        {withIt > 0 && ` · ${t('trash.withPayments', { count: withIt })}`}
                      </p>
                    </div>
                    {restoreButton(loan.loanId, () => void handleRestoreLoan(loan))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'payments' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {standalonePayments.length === 0 ? (
            <p className="px-5 py-10 text-sm text-slate-400 text-center">{t('trash.emptyPayments')}</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {standalonePayments.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {p.borrowerName}
                      <span className="ml-2 text-xs font-mono font-semibold text-indigo-400">{p.loanId}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {p.monthYear} · {formatCurrency(p.netAmountExpected)} · {p.paymentStatus}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t('trash.deletedOn', { date: formatDateTime(p.deletedAt) })}
                      {who(p.deletedBy) && ` ${t('trash.deletedBy', { name: who(p.deletedBy) })}`}
                    </p>
                  </div>
                  {restoreButton(p.id, () => void handleRestorePayment(p))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
