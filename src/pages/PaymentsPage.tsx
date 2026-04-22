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

  // For phone users: only allow actions on payments for loans they own as lender
  const ownedLoanIds = useMemo<Set<string> | undefined>(() => {
    if (isAdmin) return undefined; // admin owns all
    if (!userPhone) return new Set();
    const norm = (p: string) => p.replace(/\D/g, '').slice(-10);
    const myPhone = norm(userPhone);
    return new Set(
      loans.filter((l) => l.lenderPhone && norm(l.lenderPhone) === myPhone).map((l) => l.loanId)
    );
  }, [isAdmin, userPhone, loans]);
  const { showSuccess, showError } = useToast();
  const location = useLocation();

  const [showForm, setShowForm] = useState(false);
  const [defaultLoanId, setDefaultLoanId] = useState<string | undefined>();
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      {/* Summary — 2 cols on mobile, 4 on md */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Expected', value: formatCurrency(totalExpected), color: 'text-slate-900' },
          { label: 'Total Received', value: formatCurrency(totalReceived), color: 'text-emerald-600' },
          { label: 'Total Pending',  value: formatCurrency(totalPending),  color: 'text-amber-500' },
          { label: 'Overdue',        value: overdueCount.toString(),        color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 px-4 py-3.5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-xl md:text-2xl font-bold mt-1.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <PaymentTable
        payments={payments}
        onEdit={(p) => setEditingPayment(p)}
        onDelete={(id) => setDeletingId(id)}
        onAdd={() => { setDefaultLoanId(undefined); setShowForm(true); }}
        onMarkPaid={handleMarkPaid}
        readOnly={!hasFullAccess}
        ownedLoanIds={ownedLoanIds}
      />

      {/* Floating action button — mobile only */}
      {hasFullAccess && (
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
