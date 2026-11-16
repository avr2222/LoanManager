import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Loan } from '@/types';
import { Modal } from '@/components/common/Modal';
import { formatCurrency } from '@/utils/formatUtils';
import { toISODateString } from '@/utils/dateUtils';

interface CloseLoanDialogProps {
  loan: Loan;
  /** Upcoming pending payments that closing will waive */
  waiveCount: number;
  onConfirm: (received: { amount: number; date: string }) => void | Promise<void>;
  onCancel: () => void;
}

/** Confirms closing a loan and captures how much principal came back, and when. */
export function CloseLoanDialog({ loan, waiveCount, onConfirm, onCancel }: CloseLoanDialogProps) {
  const { t } = useTranslation();
  const today = toISODateString(new Date());
  const [amountText, setAmountText] = useState(String(loan.principalAmount));
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = parseFloat(amountText);
  const shortfall = !isNaN(amount) && amount >= 0 && amount < loan.principalAmount
    ? loan.principalAmount - amount
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (amountText.trim() === '' || isNaN(amount) || amount < 0) { setError(t('principal.errAmount')); return; }
    if (amount > loan.principalAmount) {
      setError(t('loans.principalReceivedHint', { amount: formatCurrency(loan.principalAmount) }));
      return;
    }
    if (!date) { setError(t('principal.errDateRequired')); return; }
    if (date > today) { setError(t('principal.errDateFuture')); return; }
    setSaving(true);
    try {
      await onConfirm({ amount, date });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <Modal title={`${t('loans.closeLoan')} — ${loan.loanId}`} onClose={onCancel} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          {loan.borrowerName} · {formatCurrency(loan.principalAmount)}
          {waiveCount > 0 && (
            <span className="block text-xs text-amber-600 mt-1">{t('loans.closeWaiveNote', { count: waiveCount })}</span>
          )}
        </p>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('loans.principalReceived')}</label>
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
          <p className="text-xs text-slate-400 mt-1">
            {t('loans.principalReceivedHint', { amount: formatCurrency(loan.principalAmount) })}
          </p>
          {shortfall > 0 && (
            <p className="text-xs text-amber-600 mt-1">{t('loans.closureShortfall', { amount: formatCurrency(shortfall) })}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('loans.principalReceivedOn')}</label>
          <input
            type="date"
            max={today}
            className={inputClass}
            value={date}
            onChange={(e) => { setDate(e.target.value); setError(''); }}
          />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-60">
            {saving ? '…' : t('loans.closeLoan')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
