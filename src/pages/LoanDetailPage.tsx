import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLoans } from '@/context/LoanContext';
import { usePayments } from '@/context/PaymentContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
import { Modal } from '@/components/common/Modal';
import { LoanForm } from '@/components/loans/LoanForm';
import {
  confirmationsService,
  type PartyConfirmation,
  type ConfirmationStatus,
} from '@/services/confirmationsService';
import { profilesService } from '@/services/profilesService';
import { formatCurrency, formatDate, ordinal } from '@/utils/formatUtils';
import { compareMonthYear } from '@/utils/dateUtils';
import { useApp } from '@/context/AppContext';
import { resolveProfileName } from '@/utils/profileUtils';
import { ChevronLeft, CheckCircle, XCircle, Clock, Edit2, MessageSquare, Smartphone, ArrowRight } from 'lucide-react';
import type { Loan } from '@/types';

const STATUS_CONFIG: Record<ConfirmationStatus, { icon: React.ReactNode; color: string; label: string }> = {
  Confirmed: { icon: <CheckCircle size={14} />, color: 'text-emerald-600 bg-emerald-50', label: 'Confirmed' },
  Disputed:  { icon: <XCircle size={14} />,    color: 'text-red-600 bg-red-50',         label: 'Disputed'  },
  Pending:   { icon: <Clock size={14} />,       color: 'text-amber-600 bg-amber-50',     label: 'Pending'   },
};

function ConfirmationBadge({ status }: { status: ConfirmationStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function DisputeModal({ onConfirm, onCancel }: { onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Describe what is incorrect about this loan:</p>
      <textarea
        rows={3}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Wrong principal amount, date incorrect…"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button
          disabled={!note.trim()}
          onClick={() => onConfirm(note.trim())}
          className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
        >
          Submit Dispute
        </button>
      </div>
    </div>
  );
}

function OfflineConfirmModal({ partyName, onConfirm, onCancel }: { partyName: string; onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Confirm on behalf of <strong>{partyName}</strong> (offline / verbal confirmation):
      </p>
      <textarea
        rows={2}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Confirmed over phone on 24 Apr 2026"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button
          disabled={!note.trim()}
          onClick={() => onConfirm(note.trim())}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-50"
        >
          Mark Confirmed
        </button>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { lender: 'Lender', borrower: 'Borrower', mediator: 'Mediator' };

export function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loans, updateLoan } = useLoans();
  const { payments } = usePayments();
  const { phone, user, isSuperAdmin, hasFullAccess } = useAuth();
  const { profileMap } = useApp();
  const { claimPayment } = usePayments();
  const { showSuccess, showError } = useToast();

  const myPhone = phone.replace(/\D/g, '').slice(-10);

  const loan = loans.find((l) => l.loanId === id);
  const loanPayments = payments.filter((p) => p.loanId === id).sort((a, b) => compareMonthYear(b.monthYear, a.monthYear));

  const [confirmations, setConfirmations] = useState<PartyConfirmation[]>([]);
  const [loadingConf, setLoadingConf] = useState(true);
  const [editing, setEditing] = useState(false);
  const [disputingId, setDisputingId] = useState<string | null>(null);
  const [offlineConfirmId, setOfflineConfirmId] = useState<string | null>(null);
  const [payUpiId, setPayUpiId] = useState('');
  const [payUpiName, setPayUpiName] = useState('');
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiStep, setUpiStep] = useState<'initiate' | 'confirm'>('initiate');
  const [utrInput, setUtrInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoadingConf(true);
    confirmationsService.fetchByLoan(id).then((rows) => {
      setConfirmations(rows);
      setLoadingConf(false);
    });
  }, [id]);

  // Fetch lender/mediator UPI for the "Pay via UPI" button
  useEffect(() => {
    if (!loan) return;
    const payPhone = loan.loanType === 'Through Mediator'
      ? (loan.mediatorPhone ?? '')
      : (loan.lenderPhone ?? '');
    const payName = loan.loanType === 'Through Mediator'
      ? (loan.mediatorName ?? '')
      : (loan.lenderName ?? '');
    if (!payPhone) return;
    setPayUpiName(payName);
    profilesService.getUpiIdByPhone(payPhone).then(setPayUpiId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.loanId]);

  if (!loan) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-lg font-medium">Loan not found</p>
        <button onClick={() => navigate('/loans')} className="mt-4 text-sm text-indigo-500 hover:underline">
          Back to Loans
        </button>
      </div>
    );
  }

  const myNormPhone = myPhone;
  // Use creatorId (UUID) when available; fall back to lender-phone match for old loans
  const isCreator = isSuperAdmin
    || (loan.creatorId != null && loan.creatorId === user?.id)
    || (!loan.creatorId && loan.lenderPhone?.replace(/\D/g, '').slice(-10) === myNormPhone);
  const myConfirmation = confirmations.find(
    (c) => c.partyPhone.replace(/\D/g, '').slice(-10) === myNormPhone
  );

  async function handleConfirm() {
    if (!myConfirmation) return;
    const { error } = await confirmationsService.confirm(myConfirmation.id);
    if (error) { showError(error); return; }
    setConfirmations((prev) => prev.map((c) => c.id === myConfirmation.id ? { ...c, status: 'Confirmed', respondedAt: new Date().toISOString() } : c));
    showSuccess('Loan confirmed');
  }

  async function handleDispute(note: string) {
    if (!disputingId) return;
    const { error } = await confirmationsService.dispute(disputingId, note);
    if (error) { showError(error); return; }
    setConfirmations((prev) => prev.map((c) => c.id === disputingId ? { ...c, status: 'Disputed', note, respondedAt: new Date().toISOString() } : c));
    setDisputingId(null);
    showSuccess('Dispute submitted');
  }

  async function handleOfflineConfirm(id: string, note: string) {
    const { error } = await confirmationsService.confirmOffline(id, note);
    if (error) { showError(error); return; }
    setConfirmations((prev) => prev.map((c) => c.id === id ? { ...c, status: 'Confirmed', note, respondedAt: new Date().toISOString() } : c));
    setOfflineConfirmId(null);
    showSuccess('Marked as confirmed');
  }

  async function handleUpdate(updated: Loan) {
    try {
      await updateLoan(updated);
      setEditing(false);
      showSuccess('Loan updated');
      // Reload confirmations — edit may have reset them
      const rows = await confirmationsService.fetchByLoan(updated.loanId);
      setConfirmations(rows);
    } catch {
      showError('Failed to update loan');
    }
  }

  // Guard against empty array: every() on [] returns true, which would
  // falsely show "All Confirmed" while confirmations are still loading.
  const overallStatus = confirmations.length === 0
    ? 'Pending'
    : confirmations.every((c) => c.status === 'Confirmed')
    ? 'All Confirmed'
    : confirmations.some((c) => c.status === 'Disputed')
    ? 'Disputed'
    : 'Pending';

  const canEdit = hasFullAccess && isCreator && overallStatus !== 'All Confirmed';
  const isBorrower = !!myNormPhone && loan.borrowerPhone?.replace(/\D/g, '').slice(-10) === myNormPhone;
  const offlineConf = confirmations.find((x) => x.id === offlineConfirmId);

  // Earliest unclaimed/unpaid payment — used for the UPI pay flow
  const targetPayment = useMemo(() =>
    [...loanPayments]
      .filter((p) => p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived' && p.paymentStatus !== 'Claimed')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0],
    [loanPayments]
  );

  function openUpiModal() {
    setUpiStep('initiate');
    setUtrInput('');
    setShowUpiModal(true);
  }

  function handleOpenUpiApp() {
    const amount  = targetPayment?.netAmountExpected ?? loan!.monthlyInterestAmount;
    const note    = `Loan ${loan!.loanId}${targetPayment ? ' ' + targetPayment.monthYear : ''}`;
    window.open(`upi://pay?pa=${encodeURIComponent(payUpiId)}&pn=${encodeURIComponent(payUpiName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`, '_blank');
    setUpiStep('confirm');
  }

  async function handleClaimPayment() {
    if (!targetPayment) return;
    setClaiming(true);
    try {
      await claimPayment(targetPayment, utrInput.trim());
      showSuccess('Payment recorded — awaiting lender confirmation');
      setShowUpiModal(false);
    } catch {
      showError('Failed to record payment');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate('/loans')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ChevronLeft size={16} /> Back to Loans
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{loan.loanId}</p>
            <h2 className="text-lg font-bold text-slate-800 mt-0.5">{resolveProfileName(loan.borrowerName, loan.borrowerPhone, profileMap)}</h2>
            {loan.borrowerPhone && <p className="text-xs text-slate-400 mt-0.5">{loan.borrowerPhone}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="text-right">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                loan.loanStatus === 'Active' ? 'bg-emerald-50 text-emerald-700' :
                loan.loanStatus === 'Closed' ? 'bg-slate-100 text-slate-500' :
                'bg-amber-50 text-amber-700'
              }`}>
                {loan.loanStatus}
              </span>
              {loan.closedAt && loan.loanStatus !== 'Active' && (
                <p className="text-[10px] text-slate-400 mt-1">Closed {new Date(loan.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              )}
            </div>
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
              >
                <Edit2 size={12} /> Edit
              </button>
            )}
            {isBorrower && payUpiId && loan.loanStatus === 'Active' && targetPayment && (
              <button
                onClick={openUpiModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                title={`Pay ${payUpiName} via UPI`}
              >
                <Smartphone size={12} /> Pay via UPI
              </button>
            )}
          </div>
        </div>

        {/* Key figures */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {[
            { label: 'Principal',          value: formatCurrency(loan.principalAmount),      highlight: false },
            { label: 'Monthly Interest',   value: formatCurrency(loan.monthlyInterestAmount), highlight: false },
            { label: 'Net Monthly Receipt', value: formatCurrency(loan.netMonthlyReceipt),   highlight: true  },
            { label: 'Due Day',            value: ordinal(loan.monthlyDueDay),                highlight: false },
            ...(loan.principalDueDate
              ? [{ label: 'Principal Due', value: formatDate(loan.principalDueDate), highlight: false }]
              : []),
          ].map(({ label, value, highlight }) => (
            <div key={label} className={`rounded-xl p-3 border ${highlight ? 'border-indigo-100 bg-indigo-50/60' : 'border-slate-100 bg-slate-50'}`}>
              <p className={`text-[10px] font-medium uppercase tracking-wide ${highlight ? 'text-indigo-400' : 'text-slate-400'}`}>{label}</p>
              <p className={`font-bold mt-1 tabular-nums ${highlight ? 'text-indigo-700' : 'text-slate-800'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Parties */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { role: 'Lender', name: resolveProfileName(loan.lenderName, loan.lenderPhone, profileMap), phone: loan.lenderPhone },
            { role: 'Borrower', name: resolveProfileName(loan.borrowerName, loan.borrowerPhone, profileMap), phone: loan.borrowerPhone },
            ...(loan.loanType === 'Through Mediator'
              ? [{ role: 'Mediator', name: resolveProfileName(loan.mediatorName, loan.mediatorPhone, profileMap), phone: loan.mediatorPhone }]
              : []),
          ].map(({ role, name, phone: ph }) => (
            <div key={role} className="border border-slate-100 rounded-xl p-3">
              <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px]">{role}</p>
              <p className="font-semibold text-slate-800 mt-0.5">{name}</p>
              {ph && <p className="text-slate-400 mt-0.5">{ph}</p>}
            </div>
          ))}
        </div>

        {loan.remarks && (
          <p className="mt-3 text-xs text-slate-500 italic border-t border-slate-100 pt-3">{loan.remarks}</p>
        )}
      </div>

      {/* Confirmation Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Party Confirmations</h3>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            overallStatus === 'All Confirmed' ? 'bg-emerald-50 text-emerald-700' :
            overallStatus === 'Disputed' ? 'bg-red-50 text-red-700' :
            'bg-amber-50 text-amber-700'
          }`}>
            {overallStatus}
          </span>
        </div>

        {loadingConf ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : confirmations.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No confirmation records found.</p>
        ) : (
          <div className="space-y-3">
            {confirmations.map((c) => {
              const isMe = c.partyPhone.replace(/\D/g, '').slice(-10) === myNormPhone;
              const isUnregistered = !c.userId;
              return (
                <div key={c.id} className={`flex items-start justify-between gap-3 p-3 rounded-xl border ${isMe ? 'border-indigo-100 bg-indigo-50/40' : 'border-slate-100'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{ROLE_LABEL[c.partyRole]}</span>
                      {isMe && <span className="text-[10px] font-medium text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded">You</span>}
                      {isUnregistered && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Not registered</span>}
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">{c.partyName}</p>
                    <p className="text-xs text-slate-400">{c.partyPhone}</p>
                    {c.note && (
                      <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                        <MessageSquare size={10} className="mt-0.5 shrink-0" /> {c.note}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <ConfirmationBadge status={c.status} />
                    {/* Own party action buttons */}
                    {isMe && c.status === 'Pending' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleConfirm}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDisputingId(c.id)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600"
                        >
                          Dispute
                        </button>
                      </div>
                    )}
                    {/* Creator can offline-confirm unregistered parties */}
                    {!isMe && isUnregistered && c.status === 'Pending' && isCreator && (
                      <button
                        onClick={() => setOfflineConfirmId(c.id)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        Confirm Offline
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment History */}
      {loanPayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Payment History</h3>
          <div className="space-y-2">
            {(showAllPayments ? loanPayments : loanPayments.slice(0, 12)).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-50 last:border-0">
                <div>
                  <span className="font-medium text-slate-700">{p.monthYear}</span>
                  {p.dateReceived && <span className="text-slate-400 ml-2">received {p.dateReceived}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-800">{formatCurrency(p.amountReceived)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    p.paymentStatus === 'Received' ? 'bg-emerald-50 text-emerald-700' :
                    p.paymentStatus === 'Partial' ? 'bg-amber-50 text-amber-700' :
                    p.paymentStatus === 'Waived' ? 'bg-slate-100 text-slate-500' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {p.paymentStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {loanPayments.length > 12 && (
            <button
              onClick={() => setShowAllPayments(v => !v)}
              className="mt-3 w-full text-xs text-indigo-500 hover:text-indigo-700 font-medium py-1.5 border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-colors"
            >
              {showAllPayments ? 'Show less' : `Show all ${loanPayments.length} payments`}
            </button>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <Modal title={`Edit Loan — ${loan.loanId}`} onClose={() => setEditing(false)} size="xl">
          <LoanForm
            initialValues={loan}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
            myPhone={myPhone}
            lockLender={!isSuperAdmin}
          />
        </Modal>
      )}

      {/* Dispute Modal */}
      {disputingId && (
        <Modal title="Dispute This Loan" onClose={() => setDisputingId(null)}>
          <DisputeModal onConfirm={handleDispute} onCancel={() => setDisputingId(null)} />
        </Modal>
      )}

      {/* Offline Confirm Modal */}
      {offlineConfirmId && offlineConf && (
        <Modal title="Offline Confirmation" onClose={() => setOfflineConfirmId(null)}>
          <OfflineConfirmModal
            partyName={offlineConf.partyName}
            onConfirm={(note) => handleOfflineConfirm(offlineConfirmId, note)}
            onCancel={() => setOfflineConfirmId(null)}
          />
        </Modal>
      )}

      {/* UPI Pay Modal */}
      {showUpiModal && targetPayment && (
        <Modal
          title="Pay via UPI"
          onClose={() => { setShowUpiModal(false); setUpiStep('initiate'); setUtrInput(''); }}
        >
          {upiStep === 'initiate' ? (
            <div className="space-y-4">
              {/* Payment summary */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Payment Details</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCurrency(targetPayment.netAmountExpected)}
                </p>
                <p className="text-xs text-slate-500 mt-1">{targetPayment.monthYear} · Due {targetPayment.dueDate}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <ArrowRight size={12} className="text-slate-300" />
                  <span className="text-sm font-medium text-slate-700">{payUpiName}</span>
                  <span className="text-xs text-slate-400">({payUpiId})</span>
                </div>
              </div>

              <button
                onClick={handleOpenUpiApp}
                className="w-full py-3 text-sm font-semibold text-white rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <Smartphone size={16} /> Open UPI App to Pay
              </button>

              <button
                onClick={() => setUpiStep('confirm')}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Already paid? Confirm here →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-emerald-800">Confirm your payment</p>
                <p className="text-xs text-emerald-600 mt-1">
                  {formatCurrency(targetPayment.netAmountExpected)} to {payUpiName} · {targetPayment.monthYear}
                </p>
                <p className="text-xs text-emerald-600 mt-1.5">
                  The lender will verify and mark it as received.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  UTR / Transaction ID <span className="font-normal text-slate-400">(optional but recommended)</span>
                </label>
                <input
                  type="text"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  placeholder="e.g. 405816736148"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 placeholder:text-slate-300 transition-all"
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-1">Find this in Google Pay / PhonePe transaction history</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setUpiStep('initiate')}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleClaimPayment}
                  disabled={claiming}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none transition-all"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  {claiming ? 'Recording…' : "I've Paid — Record"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
