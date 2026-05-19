import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Payment } from '@/types';
import { usePayments } from '@/context/PaymentContext';
import { useLoans } from '@/context/LoanContext';
import { useToast } from '@/components/common/Toast';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PaymentForm } from '@/components/payments/PaymentForm';
import { PaymentTable } from '@/components/payments/PaymentTable';
import { formatCurrency } from '@/utils/formatUtils';
import { derivePaymentFields } from '@/services/calculationService';
import { useAuth } from '@/context/AuthContext';

export function PaymentsPage() {
  const { payments, addPayment, updatePayment, deletePayment } = usePayments();
  const { loans } = useLoans();
  const { hasFullAccess, isAdmin, userPhone } = useAuth();

  // For phone users: allow actions on payments for loans they own as lender or mediator
  // (mediator manages payments when the lender doesn't use the app)
  const ownedLoanIds = useMemo<Set<string> | undefined>(() => {
    if (isAdmin) return undefined; // admin owns all
    if (!userPhone) return new Set();
    const norm = (p: string) => p.replace(/\D/g, '').slice(-10);
    const myPhone = norm(userPhone);
    return new Set(
      loans
        .filter((l) =>
          (l.lenderPhone  && norm(l.lenderPhone)  === myPhone) ||
          (l.mediatorPhone && norm(l.mediatorPhone) === myPhone)
        )
        .map((l) => l.loanId)
    );
  }, [isAdmin, userPhone, loans]);
  const { showSuccess, showError } = useToast();
  const location = useLocation();

  const [showForm, setShowForm] = useState(false);
  const [defaultLoanId, setDefaultLoanId] = useState<string | undefined>();
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Received' | 'Pending' | 'Overdue'>('All');

  // Auto-open form when navigated here with a loanId (e.g. from Dashboard "Record" button)
  useEffect(() => {
    const state = location.state as { openForm?: boolean; loanId?: string } | null;
    if (state?.openForm) {
      setDefaultLoanId(state.loanId);
      setShowForm(true);
      // Clear state so back-navigation doesn't re-open
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  async function handleAdd(payment: Payment) {
    try {
      await addPayment(payment);
      setShowForm(false);
      setDefaultLoanId(undefined);
      showSuccess('Payment recorded successfully');
    } catch {
      showError('Failed to record payment');
    }
  }

  async function handleUpdate(payment: Payment) {
    try {
      await updatePayment(payment);
      setEditingPayment(undefined);
      showSuccess('Payment updated');
    } catch {
      showError('Failed to update payment');
    }
  }

  async function handleMarkPaid(id: string) {
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const updated = derivePaymentFields({
      ...payment,
      amountReceived: payment.netAmountExpected,
      dateReceived: today,
      paymentStatus: 'Received',
    });
    try {
      await updatePayment(updated);
      showSuccess(`${payment.borrowerName} — ${payment.monthYear} marked as paid`);
    } catch {
      showError('Failed to mark payment as paid');
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deletePayment(deletingId);
      setDeletingId(null);
      showSuccess('Payment deleted');
    } catch {
      showError('Failed to delete payment');
    }
  }

  const totalExpected = payments.reduce((s, p) => s + p.netAmountExpected, 0);
  const totalReceived = payments.reduce((s, p) => s + p.amountReceived, 0);
  const totalPending = payments.filter((p) => p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial').reduce((s, p) => s + p.pendingAmount, 0);
  const overdueCount = payments.filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived').length;

  return (
    <div>
      {/* Summary — 2 cols on mobile, 4 on md — clickable to filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {([
          { label: 'Total Expected', value: formatCurrency(totalExpected), color: 'text-slate-900',   bg: 'from-slate-50 to-white border-slate-200/60', filter: 'All'      as const },
          { label: 'Total Received', value: formatCurrency(totalReceived), color: 'text-emerald-600', bg: 'from-emerald-50 to-white border-emerald-100', filter: 'Received' as const },
          { label: 'Total Pending',  value: formatCurrency(totalPending),  color: 'text-amber-500',   bg: 'from-amber-50 to-white border-amber-100',     filter: 'Pending'  as const },
          { label: 'Overdue',        value: overdueCount.toString(),        color: 'text-red-500',     bg: 'from-red-50 to-white border-red-100',         filter: 'Overdue'  as const },
        ] as const).map(({ label, value, color, bg, filter }) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={label}
              onClick={() => setActiveFilter(isActive ? 'All' : filter)}
              className={`text-left bg-gradient-to-br ${bg} rounded-2xl border shadow-sm px-4 py-3.5 w-full transition-all ${isActive ? 'ring-2 ring-indigo-400 shadow-md' : 'hover:shadow-md hover:-translate-y-0.5'}`}
            >
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
              <p className={`text-xl md:text-2xl font-bold mt-1.5 ${color}`}>{value}</p>
              {isActive && <p className="text-[10px] text-indigo-400 mt-1 font-medium">Filtered ↑ click to clear</p>}
            </button>
          );
        })}
      </div>

      <PaymentTable
        payments={payments}
        onEdit={(p) => setEditingPayment(p)}
        onDelete={(id) => setDeletingId(id)}
        onAdd={() => { setDefaultLoanId(undefined); setShowForm(true); }}
        onMarkPaid={handleMarkPaid}
        readOnly={!hasFullAccess}
        ownedLoanIds={ownedLoanIds}
        canAdd={isAdmin || (ownedLoanIds !== undefined && ownedLoanIds.size > 0)}
        activeFilter={activeFilter}
      />

      {/* Floating action button — mobile only */}
      {hasFullAccess && (isAdmin || (ownedLoanIds !== undefined && ownedLoanIds.size > 0)) && (
        <button
          onClick={() => { setDefaultLoanId(undefined); setShowForm(true); }}
          className="fixed bottom-20 right-4 z-30 md:hidden w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-transform"
          aria-label="Record Payment"
        >
          <Plus size={24} />
        </button>
      )}

      {showForm && (
        <Modal title="Record Payment" onClose={() => { setShowForm(false); setDefaultLoanId(undefined); }} size="lg">
          <PaymentForm defaultLoanId={defaultLoanId} onSubmit={handleAdd} onCancel={() => { setShowForm(false); setDefaultLoanId(undefined); }} />
        </Modal>
      )}

      {editingPayment && (
        <Modal title="Edit Payment" onClose={() => setEditingPayment(undefined)} size="lg">
          <PaymentForm initialValues={editingPayment} onSubmit={handleUpdate} onCancel={() => setEditingPayment(undefined)} />
        </Modal>
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete Payment?"
          message="This will permanently delete this payment record."
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
