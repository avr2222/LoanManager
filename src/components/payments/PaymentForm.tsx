import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Payment, PaymentStatus } from '@/types';
import { useLoans } from '@/context/LoanContext';
import { formatCurrency, formatMonthYear } from '@/utils/formatUtils';
import { getDueDateForMonth, toISODateString } from '@/utils/dateUtils';

interface PaymentFormProps {
  initialValues?: Payment;
  defaultLoanId?: string;
  onSubmit: (payment: Payment) => void | Promise<void>;
  onCancel: () => void;
}

export function PaymentForm({ initialValues, defaultLoanId, onSubmit, onCancel }: PaymentFormProps) {
  const { loans } = useLoans();
  const activeLoans = loans.filter((l) => l.loanStatus === 'Active');

  const now = new Date();
  const defaultMonthYear = formatMonthYear(now);

  const [loanId, setLoanId] = useState(initialValues?.loanId ?? defaultLoanId ?? '');
  const [monthYear, setMonthYear] = useState(initialValues?.monthYear ?? defaultMonthYear);
  const [amountReceived, setAmountReceived] = useState(initialValues?.amountReceived ?? 0);
  const [dateReceived, setDateReceived] = useState(initialValues?.dateReceived ?? toISODateString(now));
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(initialValues?.paymentStatus ?? 'Pending');
  const [remarks, setRemarks] = useState(initialValues?.remarks ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const selectedLoan = loans.find((l) => l.loanId === loanId);

  // Auto-fill status based on amount typed
  useEffect(() => {
    if (!selectedLoan) return;
    if (paymentStatus === 'Waived') return;
    const expected = selectedLoan.netMonthlyReceipt;
    if (amountReceived >= expected) setPaymentStatus('Received');
    else if (amountReceived > 0 && amountReceived < expected) setPaymentStatus('Partial');
    else setPaymentStatus('Pending');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountReceived, selectedLoan]);

  // Auto-fill amount when status is manually set to Received
  function handleStatusChange(status: PaymentStatus) {
    setPaymentStatus(status);
    if (status === 'Received' && selectedLoan && amountReceived === 0) {
      setAmountReceived(selectedLoan.netMonthlyReceipt);
    }
    if (status === 'Waived') {
      setAmountReceived(0);
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!loanId) errs.loanId = 'Select a loan';
    if (!monthYear) errs.monthYear = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !selectedLoan || saving) return;
    setSaving(true);

    const [mon, yr] = monthYear.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthIdx = months.indexOf(mon);
    const year = parseInt(yr);
    const dueDate = monthIdx >= 0
      ? toISODateString(getDueDateForMonth(selectedLoan.monthlyDueDay, year, monthIdx))
      : (initialValues?.dueDate ?? toISODateString(now));

    const today = new Date();
    const dueDateObj = new Date(dueDate);
    const daysOverdue =
      paymentStatus === 'Received' || paymentStatus === 'Waived'
        ? 0
        : Math.max(0, Math.floor((today.getTime() - dueDateObj.getTime()) / 86400000));

    const pendingAmount =
      paymentStatus === 'Received' || paymentStatus === 'Waived'
        ? 0
        : Math.max(0, selectedLoan.netMonthlyReceipt - amountReceived);

    const nowStr = new Date().toISOString();
    const payment: Payment = {
      id: initialValues?.id ?? uuidv4(),
      loanId,
      borrowerName: selectedLoan.borrowerName,
      monthYear,
      dueDate,
      interestAmount: selectedLoan.monthlyInterestAmount,
      mediatorShare: selectedLoan.mediatorMonthlyShare,
      netAmountExpected: selectedLoan.netMonthlyReceipt,
      amountReceived,
      dateReceived: paymentStatus === 'Received' || paymentStatus === 'Partial' ? dateReceived : '',
      paymentStatus,
      daysOverdue,
      pendingAmount,
      remarks,
      createdAt: initialValues?.createdAt ?? nowStr,
      updatedAt: nowStr,
    };

    try {
      await onSubmit(payment);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      errors[field] ? 'border-red-400' : 'border-slate-200'
    }`;

  const monthOptions: string[] = [];
  for (let i = -12; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    monthOptions.push(formatMonthYear(d));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Loan selector */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Loan *</label>
        <select
          className={inputClass('loanId')}
          value={loanId}
          onChange={(e) => setLoanId(e.target.value)}
          disabled={!!initialValues}
        >
          <option value="">Select a loan...</option>
          {activeLoans.map((l) => (
            <option key={l.loanId} value={l.loanId}>
              {l.loanId} — {l.borrowerName}
            </option>
          ))}
        </select>
        {errors.loanId && <p className="text-red-500 text-xs mt-1">{errors.loanId}</p>}
      </div>

      {/* Loan details preview */}
      {selectedLoan && (
        <div className="bg-slate-50 rounded-xl p-3 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-slate-400">Interest</span>
              <p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(selectedLoan.monthlyInterestAmount)}</p>
            </div>
            <div>
              <span className="text-slate-400">Mediator</span>
              <p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(selectedLoan.mediatorMonthlyShare)}</p>
            </div>
            <div>
              <span className="text-slate-400">Net Expected</span>
              <p className="font-semibold text-emerald-600 mt-0.5">{formatCurrency(selectedLoan.netMonthlyReceipt)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Month-Year *</label>
          <select className={inputClass('monthYear')} value={monthYear} onChange={(e) => setMonthYear(e.target.value)}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment Status</label>
          <select className={inputClass('paymentStatus')} value={paymentStatus} onChange={(e) => handleStatusChange(e.target.value as PaymentStatus)}>
            <option value="Pending">Pending</option>
            <option value="Received">Received</option>
            <option value="Partial">Partial</option>
            <option value="Waived">Waived</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Amount Received (₹)</label>
          <input
            type="number"
            min="0"
            className={inputClass('amountReceived')}
            value={amountReceived || ''}
            onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)}
          />
        </div>

        {(paymentStatus === 'Received' || paymentStatus === 'Partial') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date Received</label>
            <input
              type="date"
              className={inputClass('dateReceived')}
              value={dateReceived}
              onChange={(e) => setDateReceived(e.target.value)}
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
        <textarea rows={2} className={inputClass('remarks')} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel} className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-60">
          {saving ? 'Saving…' : initialValues ? 'Update Payment' : 'Record Payment'}
        </button>
      </div>
    </form>
  );
}
