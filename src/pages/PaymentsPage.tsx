import { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
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
import { toISODateString } from '@/utils/dateUtils';
import { derivePaymentFields, isOverduePayment } from '@/services/calculationService';
import { exportPaymentsView } from '@/services/excelService';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { PageSkeleton } from '@/components/common/Skeleton';
import { useTranslation } from 'react-i18next';

export function PaymentsPage() {
  const { loading } = useApp();
  const { payments, addPayment, updatePayment, deletePayment } = usePayments();
  const { loans } = useLoans();
  const { hasFullAccess, isAdmin, userPhone, phone, adminPhone } = useAuth();
  const [searchParams] = useSearchParams();
  const showAll = isAdmin && searchParams.get('all') === '1';

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

  // Admin personal filter: only payments for loans where admin is lender/mediator
  const myLoanIds = useMemo(() => {
    if (!isAdmin || showAll) return null;
    const norm = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-10);
    const myPhone = norm(phone || adminPhone);
    if (!myPhone) return null;
    return new Set(
      loans
        .filter((l) => norm(l.lenderPhone) === myPhone || norm(l.mediatorPhone) === myPhone)
        .map((l) => l.loanId)
    );
  }, [isAdmin, showAll, loans, phone, adminPhone]);

  const visiblePayments = myLoanIds ? payments.filter((p) => myLoanIds.has(p.loanId)) : payments;

  const { showSuccess, showError } = useToast();
  const { t } = useTranslation();
  const location = useLocation();

  const [showForm, setShowForm] = useState(false);
  const [defaultLoanId, setDefaultLoanId] = useState<string | undefined>();
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Seed filter/search from navigation state (e.g. dashboard KPI card clicks)
  // synchronously so PaymentTable mounts with them already applied
  const navState = location.state as { openForm?: boolean; loanId?: string; filter?: 'All' | 'Received' | 'Pending' | 'Overdue'; search?: string } | null;
  const [activeFilter, setActiveFilter] = useState<'All' | 'Received' | 'Pending' | 'Overdue'>(navState?.filter ?? 'All');
  const [initialSearch] = useState(navState?.search ?? '');

  // Auto-open form when navigated here with a loanId (e.g. from Dashboard "Record" button)
  useEffect(() => {
    const state = location.state as { openForm?: boolean; loanId?: string; filter?: string; search?: string } | null;
    if (state?.openForm) {
      setDefaultLoanId(state.loanId);
      setShowForm(true);
    }
    // Clear state so back-navigation doesn't re-apply it
    if (state?.openForm || state?.filter || state?.search) window.history.replaceState({}, '');
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

  function markPaidFields(payment: Payment): Payment {
    return derivePaymentFields({
      ...payment,
      amountReceived: payment.netAmountExpected,
      dateReceived: toISODateString(new Date()),
      paymentStatus: 'Received',
    });
  }

  async function handleMarkPaid(id: string) {
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;
    try {
      await updatePayment(markPaidFields(payment));
      showSuccess(`${payment.borrowerName} — ${payment.monthYear} marked as paid`);
    } catch {
      showError('Failed to mark payment as paid');
    }
  }

  async function handleBulkMarkPaid(ids: string[]) {
    const targets = payments.filter((p) => ids.includes(p.id));
    if (targets.length === 0) return;
    try {
      for (const payment of targets) {
        await updatePayment(markPaidFields(payment));
      }
      showSuccess(t('payments.bulkMarkPaidSuccess', { count: targets.length }));
    } catch {
      showError('Failed to mark some payments as paid');
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

  const totalExpected = visiblePayments.reduce((s, p) => s + p.netAmountExpected, 0);
  const totalReceived = visiblePayments.reduce((s, p) => s + p.amountReceived, 0);
  const totalPending = visiblePayments.filter((p) => p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial').reduce((s, p) => s + p.pendingAmount, 0);
  const overduePayments = visiblePayments.filter(isOverduePayment);
  const overdueAmount = overduePayments.reduce((s, p) => s + p.pendingAmount, 0);

  if (loading) return <PageSkeleton />;

  return (
    <div>
      {/* Summary — 2 cols on mobile, 4 on md — clickable to filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {([
          { label: 'Total Expected', value: formatCurrency(totalExpected), subtitle: '',                                                          color: 'text-slate-900',   bg: 'from-slate-50 to-white border-slate-200/60', filter: 'All'      as const },
          { label: 'Total Received', value: formatCurrency(totalReceived), subtitle: '',                                                          color: 'text-emerald-600', bg: 'from-emerald-50 to-white border-emerald-100', filter: 'Received' as const },
          { label: 'Total Pending',  value: formatCurrency(totalPending),  subtitle: '',                                                          color: 'text-amber-500',   bg: 'from-amber-50 to-white border-amber-100',     filter: 'Pending'  as const },
          { label: 'Overdue',        value: formatCurrency(overdueAmount), subtitle: t('payments.paymentsCount', { count: overduePayments.length }), color: 'text-red-500',     bg: 'from-red-50 to-white border-red-100',         filter: 'Overdue'  as const },
        ] as const).map(({ label, value, subtitle, color, bg, filter }) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={label}
              onClick={() => setActiveFilter(isActive ? 'All' : filter)}
              className={`text-left bg-gradient-to-br ${bg} rounded-2xl border shadow-sm px-4 py-3.5 w-full transition-all ${isActive ? 'ring-2 ring-indigo-400 shadow-md' : 'hover:shadow-md hover:-translate-y-0.5'}`}
            >
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
              <p className={`text-xl md:text-2xl font-bold mt-1.5 ${color}`}>{value}</p>
              {subtitle && !isActive && <p className="text-[10px] text-slate-400 mt-1 font-medium">{subtitle}</p>}
              {isActive && <p className="text-[10px] text-indigo-400 mt-1 font-medium">Filtered ↑ click to clear</p>}
            </button>
          );
        })}
      </div>

      <PaymentTable
        payments={visiblePayments}
        onEdit={(p) => setEditingPayment(p)}
        onDelete={(id) => setDeletingId(id)}
        onAdd={() => { setDefaultLoanId(undefined); setShowForm(true); }}
        onMarkPaid={handleMarkPaid}
        readOnly={!hasFullAccess}
        ownedLoanIds={ownedLoanIds}
        canAdd={isAdmin || (ownedLoanIds !== undefined && ownedLoanIds.size > 0)}
        activeFilter={activeFilter}
        initialSearch={initialSearch}
        onBulkMarkPaid={hasFullAccess ? handleBulkMarkPaid : undefined}
        onExport={(filtered) => { exportPaymentsView(filtered); showSuccess('Excel exported!'); }}
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
