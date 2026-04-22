import { useState, useMemo } from 'react';
import type { Loan, LoanType, LoanStatus } from '@/types';
import { deriveLoanFields } from '@/services/calculationService';
import { generateLoanId } from '@/utils/idUtils';
import { formatCurrency, ordinal } from '@/utils/formatUtils';
import { useLoans } from '@/context/LoanContext';

interface LoanFormProps {
  initialValues?: Loan;
  onSubmit: (loan: Loan) => void | Promise<void>;
  onCancel: () => void;
  /** If set, borrower/mediator dropdowns are scoped to loans related to this phone */
  myPhone?: string;
  /** Pre-fill the lender fields with the current user's details */
  defaultLenderName?: string;
  defaultLenderPhone?: string;
  /** If true, lender fields are read-only (phone users). Admin always gets editable fields. */
  lockLender?: boolean;
}

const defaultForm = {
  lenderName: '',
  lenderPhone: '',
  borrowerName: '',
  borrowerPhone: '',
  borrowerAddress: '',
  loanType: 'Direct' as LoanType,
  mediatorName: '',
  mediatorPhone: '',
  mediatorCommissionPct: 0,
  principalAmount: 0,
  annualInterestRate: 0,
  dateGiven: new Date().toISOString().split('T')[0],
  expectedTenureMonths: 0,
  loanStatus: 'Active' as LoanStatus,
  remarks: '',
};

export function LoanForm({ initialValues, onSubmit, onCancel, myPhone, defaultLenderName, defaultLenderPhone, lockLender }: LoanFormProps) {
  const { loans } = useLoans();

  // If myPhone is given (phone user), only suggest people from their own loans
  const scopedLoans = useMemo(() => {
    if (!myPhone) return loans;
    const p = myPhone.replace(/\D/g, '').slice(-10);
    return loans.filter((l) =>
      l.borrowerPhone?.replace(/\D/g, '').slice(-10) === p ||
      l.mediatorPhone?.replace(/\D/g, '').slice(-10) === p ||
      l.lenderPhone?.replace(/\D/g, '').slice(-10) === p
    );
  }, [loans, myPhone]);

  const [form, setForm] = useState(initialValues ? {
    lenderName: initialValues.lenderName ?? '',
    lenderPhone: initialValues.lenderPhone ?? '',
    borrowerName: initialValues.borrowerName,
    borrowerPhone: initialValues.borrowerPhone,
    borrowerAddress: initialValues.borrowerAddress,
    loanType: initialValues.loanType,
    mediatorName: initialValues.mediatorName,
    mediatorPhone: initialValues.mediatorPhone,
    mediatorCommissionPct: initialValues.mediatorCommissionPct,
    principalAmount: initialValues.principalAmount,
    annualInterestRate: initialValues.annualInterestRate,
    dateGiven: initialValues.dateGiven,
    expectedTenureMonths: initialValues.expectedTenureMonths,
    loanStatus: initialValues.loanStatus,
    remarks: initialValues.remarks,
  } : {
    ...defaultForm,
    lenderName:  defaultLenderName  ?? '',
    lenderPhone: defaultLenderPhone ?? '',
  });

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  // Separate display state so typing "24" doesn't immediately jump to "2"
  const [rateDisplay, setRateDisplay] = useState(() =>
    form.annualInterestRate ? String(+(form.annualInterestRate / 12).toFixed(2)) : ''
  );

  const myNormPhone = myPhone ? myPhone.replace(/\D/g, '').slice(-10) : '';

  // Unique borrowers from scoped loans — exclude the current user themselves
  const knownBorrowers = useMemo(() => {
    const seen = new Map<string, { name: string; phone: string; address: string }>();
    for (const l of scopedLoans) {
      const key = l.borrowerPhone?.replace(/\D/g, '').slice(-10) || l.borrowerName;
      if (myNormPhone && key === myNormPhone) continue; // skip self
      if (!seen.has(key)) {
        seen.set(key, { name: l.borrowerName, phone: l.borrowerPhone, address: l.borrowerAddress });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedLoans, myNormPhone]);

  // Unique mediators from scoped loans — exclude the current user themselves
  const knownMediators = useMemo(() => {
    const seen = new Map<string, { name: string; phone: string; commissionPct: number }>();
    for (const l of scopedLoans) {
      if (l.loanType === 'Through Mediator' && l.mediatorName) {
        const key = l.mediatorPhone?.replace(/\D/g, '').slice(-10) || l.mediatorName;
        if (myNormPhone && key === myNormPhone) continue; // skip self
        if (!seen.has(key)) {
          seen.set(key, { name: l.mediatorName, phone: l.mediatorPhone ?? '', commissionPct: l.mediatorCommissionPct ?? 0 });
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedLoans, myNormPhone]);

  const preview = deriveLoanFields({ loanId: '', ...form, createdAt: '' });

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function selectBorrower(key: string) {
    if (!key) return;
    const b = knownBorrowers.find(
      (x) => (x.phone?.replace(/\D/g, '').slice(-10) || x.name) === key
    );
    if (b) {
      setForm((prev) => ({ ...prev, borrowerName: b.name, borrowerPhone: b.phone, borrowerAddress: b.address }));
      setErrors((prev) => ({ ...prev, borrowerName: undefined }));
    }
  }

  function selectMediator(key: string) {
    if (!key) return;
    const m = knownMediators.find(
      (x) => (x.phone?.replace(/\D/g, '').slice(-10) || x.name) === key
    );
    if (m) {
      setForm((prev) => ({ ...prev, mediatorName: m.name, mediatorPhone: m.phone, mediatorCommissionPct: m.commissionPct }));
      setErrors((prev) => ({ ...prev, mediatorName: undefined }));
    }
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.borrowerName.trim()) errs.borrowerName = 'Required';
    if (!form.principalAmount || form.principalAmount <= 0) errs.principalAmount = 'Must be > 0';
    if (!form.annualInterestRate || form.annualInterestRate <= 0) errs.annualInterestRate = 'Must be > 0';
    if (!form.dateGiven) errs.dateGiven = 'Required';
    if (form.loanType === 'Through Mediator' && !form.mediatorName.trim()) {
      errs.mediatorName = 'Required for mediator loans';
    }
    if (form.mediatorCommissionPct < 0 || form.mediatorCommissionPct > 100) {
      errs.mediatorCommissionPct = 'Must be between 0 and 100';
    }
    if (form.expectedTenureMonths < 0) {
      errs.expectedTenureMonths = 'Cannot be negative';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const loanId = initialValues?.loanId ?? generateLoanId(loans);
      const loan = deriveLoanFields({ loanId, ...form, createdAt: initialValues?.createdAt ?? now });
      await onSubmit(loan);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      errors[field] ? 'border-red-400' : 'border-slate-200'
    }`;

  const selectClass = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Lender Details */}
      <fieldset>
        <legend className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-100 w-full">
          Lender Details{' '}
          {defaultLenderPhone
            ? <span className="normal-case font-normal text-emerald-500 ml-1">— you are the lender</span>
            : <span className="normal-case font-normal text-slate-300 ml-1">(leave blank if you are the lender)</span>}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Lender Name</label>
            <input
              className={`${inputClass('lenderName')} ${lockLender ? 'bg-slate-50 text-slate-500' : ''}`}
              value={form.lenderName}
              onChange={(e) => set('lenderName', e.target.value)}
              placeholder="Who gave the money?"
              readOnly={!!lockLender}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Lender Phone</label>
            <input
              className={`${inputClass('lenderPhone')} ${lockLender ? 'bg-slate-50 text-slate-500' : ''}`}
              value={form.lenderPhone}
              onChange={(e) => set('lenderPhone', e.target.value)}
              placeholder="10-digit number"
              readOnly={!!lockLender}
            />
          </div>
        </div>
      </fieldset>

      {/* Borrower Details */}
      <fieldset>
        <legend className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-100 w-full">
          Borrower Details
        </legend>
        <div className="space-y-3">

          {/* Existing borrower picker */}
          {knownBorrowers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Select Existing Borrower</label>
              <select
                className={selectClass}
                value={form.borrowerPhone?.replace(/\D/g, '').slice(-10) || form.borrowerName || ''}
                onChange={(e) => selectBorrower(e.target.value)}
              >
                <option value="">— new borrower —</option>
                {knownBorrowers.map((b) => {
                  const key = b.phone?.replace(/\D/g, '').slice(-10) || b.name;
                  return (
                    <option key={key} value={key}>
                      {b.name}{b.phone ? ` · ${b.phone}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
            <input className={inputClass('borrowerName')} value={form.borrowerName} onChange={(e) => set('borrowerName', e.target.value)} placeholder="Enter borrower name" />
            {errors.borrowerName && <p className="text-red-500 text-xs mt-1">{errors.borrowerName}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone No.</label>
              <input
                className={inputClass('borrowerPhone')}
                value={form.borrowerPhone}
                onChange={(e) => set('borrowerPhone', e.target.value)}
                placeholder="10-digit number"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Address / City</label>
              <input className={inputClass('borrowerAddress')} value={form.borrowerAddress} onChange={(e) => set('borrowerAddress', e.target.value)} />
            </div>
          </div>
        </div>
      </fieldset>

      {/* Loan Details */}
      <fieldset>
        <legend className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-100 w-full">
          Loan Details
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Loan Type *</label>
            <select className={inputClass('loanType')} value={form.loanType} onChange={(e) => set('loanType', e.target.value as LoanType)}>
              <option value="Direct">Direct</option>
              <option value="Through Mediator">Through Mediator</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Loan Status</label>
            <select className={inputClass('loanStatus')} value={form.loanStatus} onChange={(e) => set('loanStatus', e.target.value as LoanStatus)}>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
              <option value="Defaulted">Defaulted</option>
              <option value="Restructured">Restructured</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Principal Amount (₹) *</label>
            <input type="number" min="0" className={inputClass('principalAmount')} value={form.principalAmount || ''} onChange={(e) => set('principalAmount', parseFloat(e.target.value) || 0)} />
            {errors.principalAmount && <p className="text-red-500 text-xs mt-1">{errors.principalAmount}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Interest Rate * <span className="font-normal text-slate-400">(₹ per ₹100 / month)</span>
            </label>
            <datalist id="rate-suggestions">
              {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <input
              list="rate-suggestions"
              inputMode="decimal"
              className={inputClass('annualInterestRate')}
              value={rateDisplay}
              onChange={(e) => {
                const txt = e.target.value;
                setRateDisplay(txt);
                const raw = parseFloat(txt) || 0;
                // if > 10 assume user typed annual % (e.g. 24 → 24% p.a.)
                const annual = raw > 10 ? raw : raw * 12;
                set('annualInterestRate', annual);
              }}
              placeholder="e.g. 2"
            />
            {form.annualInterestRate > 0 && (
              <p className="text-xs text-indigo-500 mt-1 font-medium">
                = ₹{+(form.annualInterestRate / 12).toFixed(2)} per ₹100/mo &nbsp;·&nbsp; {form.annualInterestRate}% per year
              </p>
            )}
            {errors.annualInterestRate && <p className="text-red-500 text-xs mt-1">{errors.annualInterestRate}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date Given *</label>
            <input type="date" className={inputClass('dateGiven')} value={form.dateGiven} onChange={(e) => set('dateGiven', e.target.value)} />
            {errors.dateGiven && <p className="text-red-500 text-xs mt-1">{errors.dateGiven}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Expected Tenure (Months)</label>
            <input type="number" min="0" className={inputClass('expectedTenureMonths')} value={form.expectedTenureMonths || ''} onChange={(e) => set('expectedTenureMonths', parseInt(e.target.value) || 0)} />
            {errors.expectedTenureMonths && <p className="text-red-500 text-xs mt-1">{errors.expectedTenureMonths}</p>}
          </div>
        </div>
      </fieldset>

      {/* Mediator Section */}
      {form.loanType === 'Through Mediator' && (
        <fieldset>
          <legend className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-100 w-full">
            Mediator Details
          </legend>
          <div className="space-y-3">

            {/* Existing mediator picker */}
            {knownMediators.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Select Existing Mediator</label>
                <select
                  className={selectClass}
                  value={form.mediatorPhone?.replace(/\D/g, '').slice(-10) || form.mediatorName || ''}
                  onChange={(e) => selectMediator(e.target.value)}
                >
                  <option value="">— new mediator —</option>
                  {knownMediators.map((m) => {
                    const key = m.phone?.replace(/\D/g, '').slice(-10) || m.name;
                    return (
                      <option key={key} value={key}>
                        {m.name}{m.phone ? ` · ${m.phone}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mediator Name *</label>
                <input className={inputClass('mediatorName')} value={form.mediatorName} onChange={(e) => set('mediatorName', e.target.value)} placeholder="Enter mediator name" />
                {errors.mediatorName && <p className="text-red-500 text-xs mt-1">{errors.mediatorName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mediator Phone</label>
                <input className={inputClass('mediatorPhone')} value={form.mediatorPhone} onChange={(e) => set('mediatorPhone', e.target.value)} placeholder="10-digit number" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Commission (% of Interest)</label>
                <input type="number" min="0" max="100" step="0.1" className={inputClass('mediatorCommissionPct')} value={form.mediatorCommissionPct || ''} onChange={(e) => set('mediatorCommissionPct', parseFloat(e.target.value) || 0)} />
                {errors.mediatorCommissionPct && <p className="text-red-500 text-xs mt-1">{errors.mediatorCommissionPct}</p>}
              </div>
            </div>
          </div>
        </fieldset>
      )}

      {/* Live Preview */}
      {form.principalAmount > 0 && form.annualInterestRate > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">Calculated Preview</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-500">Rate / year</span>
              <p className="font-semibold text-slate-800 mt-0.5">{form.annualInterestRate}%</p>
            </div>
            <div>
              <span className="text-slate-500">Monthly Interest</span>
              <p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(preview.monthlyInterestAmount)}</p>
            </div>
            {form.loanType === 'Through Mediator' && (
              <div>
                <span className="text-slate-500">Mediator Share</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(preview.mediatorMonthlyShare)}</p>
              </div>
            )}
            <div>
              <span className="text-slate-500">Net Monthly Receipt</span>
              <p className="font-semibold text-emerald-600 mt-0.5">{formatCurrency(preview.netMonthlyReceipt)}</p>
            </div>
            <div>
              <span className="text-slate-500">Due Day</span>
              <p className="font-semibold text-slate-800 mt-0.5">{ordinal(preview.monthlyDueDay)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Remarks */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
        <textarea rows={2} className={inputClass('remarks')} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel} className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-60">
          {saving ? 'Saving…' : initialValues ? 'Update Loan' : 'Add Loan'}
        </button>
      </div>
    </form>
  );
}
