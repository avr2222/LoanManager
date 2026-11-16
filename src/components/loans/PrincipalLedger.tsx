import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Undo2 } from 'lucide-react';
import type { Loan, PrincipalTxn } from '@/types';
import { useLoans } from '@/context/LoanContext';
import { usePayments } from '@/context/PaymentContext';
import { useToast } from '@/components/common/Toast';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { principalService } from '@/services/principalService';
import { deriveLoanFields, repricePendingPayments } from '@/services/calculationService';
import { formatCurrency, formatDate } from '@/utils/formatUtils';
import { toISODateString } from '@/utils/dateUtils';

type MovementType = 'Repayment' | 'TopUp';

/** The loan as it will be once its outstanding principal becomes `principal`. */
function withPrincipal(loan: Loan, principal: number): Loan {
  return deriveLoanFields({ ...loan, principalAmount: principal });
}

// ── Record repayment / top-up form ────────────────────────────────────────────

interface MovementFormProps {
  loan: Loan;
  type: MovementType;
  onSubmit: (v: { amount: number; date: string; remarks: string }) => Promise<void>;
  onCancel: () => void;
}

function MovementForm({ loan, type, onSubmit, onCancel }: MovementFormProps) {
  const { t } = useTranslation();
  const { payments } = usePayments();
  const today = toISODateString(new Date());
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(today);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = parseFloat(amountText) || 0;
  const newPrincipal = type === 'Repayment' ? loan.principalAmount - amount : loan.principalAmount + amount;
  const previewable = amount > 0 && newPrincipal > 0;
  const preview = previewable ? withPrincipal(loan, newPrincipal) : null;
  // First payment that will carry the new amount (pending, untouched, due after the date)
  const firstRepriced = preview && date
    ? repricePendingPayments(preview, payments, { from: date, inclusive: false })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    : undefined;

  function validate(): string {
    if (!(amount > 0)) return t('principal.errAmount');
    if (type === 'Repayment' && amount >= loan.principalAmount) return t('principal.errFullRepayment');
    if (!date) return t('principal.errDateRequired');
    if (loan.dateGiven && date < loan.dateGiven.slice(0, 10)) return t('principal.errDateBeforeLoan');
    if (date > today) return t('principal.errDateFuture');
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      await onSubmit({ amount, date, remarks: remarks.trim() });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        {t('principal.outstanding')}: <span className="font-semibold text-slate-800">{formatCurrency(loan.principalAmount)}</span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('principal.amount')}</label>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            className={inputClass}
            value={amountText}
            onChange={(e) => { setAmountText(e.target.value); setError(''); }}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('principal.date')}</label>
          <input
            type="date"
            min={loan.dateGiven ? loan.dateGiven.slice(0, 10) : undefined}
            max={today}
            className={inputClass}
            value={date}
            onChange={(e) => { setDate(e.target.value); setError(''); }}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('principal.remarks')}</label>
        <input className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>

      {preview && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">{t('principal.newPrincipal')}</span>
            <span className="font-semibold text-slate-800">{formatCurrency(preview.principalAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t('principal.monthlyInterest')}</span>
            <span className="font-semibold text-slate-800">
              {formatCurrency(loan.monthlyInterestAmount)} → {formatCurrency(preview.monthlyInterestAmount)}
            </span>
          </div>
          <p className="text-indigo-600 pt-0.5">
            {firstRepriced
              ? t('principal.appliesFrom', { month: firstRepriced.monthYear })
              : t('principal.appliesFromNext')}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-60">
          {saving ? '…' : t('principal.save')}
        </button>
      </div>
    </form>
  );
}

// ── Ledger card ───────────────────────────────────────────────────────────────

interface PrincipalLedgerProps {
  loan: Loan;
  /** Admin, the loan's creator or its lender — may record and undo entries */
  canManage: boolean;
}

/** Principal card on the loan page: outstanding amount, the ledger of
 *  repayments / top-ups / closure, and the actions to record or undo one.
 *  Mount with `key={loan.loanId}` so state resets when the loan changes. */
export function PrincipalLedger({ loan, canManage }: PrincipalLedgerProps) {
  const { t } = useTranslation();
  const { applyLoanLocal } = useLoans();
  const { payments, applyPaymentsLocal } = usePayments();
  const { showSuccess, showError } = useToast();

  const [txns, setTxns] = useState<PrincipalTxn[]>([]); // newest first
  const [formType, setFormType] = useState<MovementType | null>(null);
  const [undoTarget, setUndoTarget] = useState<PrincipalTxn | null>(null);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    principalService.fetchByLoan(loan.loanId).then((rows) => { if (!cancelled) setTxns(rows); });
    return () => { cancelled = true; };
  }, [loan.loanId]);

  const isActive = loan.loanStatus === 'Active';
  const canRecord = canManage && isActive;

  // Nothing to show a borrower / mediator until something has been recorded
  if (!canManage && txns.length === 0) return null;

  const original = txns.length > 0 ? txns[txns.length - 1].principalBefore : loan.principalAmount;

  async function handleRecord(v: { amount: number; date: string; remarks: string }) {
    if (!formType) return;
    const type = formType;
    const newPrincipal = type === 'Repayment' ? loan.principalAmount - v.amount : loan.principalAmount + v.amount;
    const newLoan = withPrincipal(loan, newPrincipal);
    // Next unpaid payment due after the date, and all later ones, use the new principal
    const repriced = repricePendingPayments(newLoan, payments, { from: v.date, inclusive: false });
    try {
      const txn = await principalService.record({
        loanId: loan.loanId, type, amount: v.amount, date: v.date, remarks: v.remarks,
        loan: newLoan, payments: repriced,
      });
      applyLoanLocal(newLoan);
      applyPaymentsLocal(repriced);
      setTxns((prev) => [txn, ...prev]);
      setFormType(null);
      showSuccess(t(type === 'Repayment' ? 'principal.savedRepayment' : 'principal.savedTopUp', { amount: formatCurrency(v.amount) }));
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUndo() {
    if (!undoTarget || undoing) return;
    const txn = undoTarget;
    setUndoing(true);
    try {
      if (txn.txnType === 'Closure') {
        await principalService.undo(txn.id);
      } else {
        const restored = withPrincipal(loan, txn.principalBefore);
        const repriced = repricePendingPayments(restored, payments, { from: txn.txnDate, inclusive: false });
        await principalService.undo(txn.id, restored, repriced);
        applyLoanLocal(restored);
        applyPaymentsLocal(repriced);
      }
      setTxns((prev) => prev.filter((x) => x.id !== txn.id));
      showSuccess(t('principal.undone'));
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setUndoing(false);
      setUndoTarget(null);
    }
  }

  const typeLabel = (txn: PrincipalTxn) =>
    txn.txnType === 'Repayment' ? t('principal.repayment') :
    txn.txnType === 'TopUp' ? t('principal.topUpLabel') :
    t('principal.closure');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{t('principal.title')}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {isActive ? t('principal.outstanding') : t('loans.principal')}:{' '}
            <span className="font-bold text-slate-800 tabular-nums">{formatCurrency(loan.principalAmount)}</span>
            {original !== loan.principalAmount && (
              <span className="text-slate-400"> · {t('principal.originally', { amount: formatCurrency(original) })}</span>
            )}
          </p>
        </div>
        {canRecord && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setFormType('Repayment')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <ArrowDownLeft size={13} /> {t('principal.recordRepayment')}
            </button>
            <button
              onClick={() => setFormType('TopUp')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <ArrowUpRight size={13} /> {t('principal.topUp')}
            </button>
          </div>
        )}
      </div>

      {txns.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">{t('principal.noEntries')}</p>
      ) : (
        <div className="space-y-2">
          {txns.map((txn, i) => (
            <div key={txn.id} className="flex items-center justify-between gap-3 text-xs py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-start gap-2 min-w-0">
                <span className={`mt-0.5 shrink-0 ${
                  txn.txnType === 'Repayment' ? 'text-emerald-500' :
                  txn.txnType === 'TopUp' ? 'text-indigo-500' : 'text-slate-400'
                }`}>
                  {txn.txnType === 'Repayment' ? <ArrowDownLeft size={14} /> :
                   txn.txnType === 'TopUp' ? <ArrowUpRight size={14} /> : <CheckCircle2 size={14} />}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-700">
                    {typeLabel(txn)} <span className="font-normal text-slate-400">· {formatDate(txn.txnDate)}</span>
                  </p>
                  {txn.remarks && <p className="text-slate-400 truncate">{txn.remarks}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="font-semibold text-slate-800 tabular-nums">
                    {txn.txnType === 'Repayment' ? '−' : txn.txnType === 'TopUp' ? '+' : ''}{formatCurrency(txn.amount)}
                  </p>
                  <p className="text-[10px] text-slate-400 tabular-nums">
                    {t('principal.balanceAfter', { amount: formatCurrency(txn.principalAfter) })}
                  </p>
                </div>
                {/* Only the most recent entry can be undone */}
                {canManage && i === 0 && (
                  <button
                    onClick={() => setUndoTarget(txn)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <Undo2 size={11} /> {t('principal.undo')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formType && (
        <Modal
          title={`${formType === 'Repayment' ? t('principal.recordRepayment') : t('principal.topUp')} — ${loan.loanId}`}
          onClose={() => setFormType(null)}
          size="md"
        >
          <MovementForm loan={loan} type={formType} onSubmit={handleRecord} onCancel={() => setFormType(null)} />
        </Modal>
      )}

      {undoTarget && (
        <ConfirmDialog
          title={t('principal.undoTitle')}
          message={
            undoTarget.txnType === 'Closure'
              ? t('principal.undoClosureMessage', { amount: formatCurrency(undoTarget.amount), date: formatDate(undoTarget.txnDate) })
              : t('principal.undoMessage', {
                  type: typeLabel(undoTarget).toLowerCase(),
                  amount: formatCurrency(undoTarget.amount),
                  date: formatDate(undoTarget.txnDate),
                  before: formatCurrency(undoTarget.principalBefore),
                })
          }
          confirmLabel={t('principal.undo')}
          danger
          onConfirm={() => void handleUndo()}
          onCancel={() => setUndoTarget(null)}
        />
      )}
    </div>
  );
}
