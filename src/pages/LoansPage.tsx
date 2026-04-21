import { useState } from 'react';
import type { Loan, LoanStatus } from '@/types';
import { useLoans } from '@/context/LoanContext';
import { usePayments } from '@/context/PaymentContext';
import { useToast } from '@/components/common/Toast';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LoanForm } from '@/components/loans/LoanForm';
import { LoanTable } from '@/components/loans/LoanTable';

export function LoansPage() {
  const { loans, addLoan, updateLoan, deleteLoan, setLoanStatus } = useLoans();
  const { deletePaymentsByLoan } = usePayments();
  const { showSuccess, showError } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | undefined>();
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null);

  async function handleAdd(loan: Loan) {
    try {
      await addLoan(loan);
      setShowForm(false);
      showSuccess(`Loan ${loan.loanId} added for ${loan.borrowerName}`);
    } catch {
      showError('Failed to add loan');
    }
  }

  async function handleUpdate(loan: Loan) {
    try {
      await updateLoan(loan);
      setEditingLoan(undefined);
      showSuccess('Loan updated successfully');
    } catch {
      showError('Failed to update loan');
    }
  }

  async function handleDelete() {
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

  async function handleSetStatus(loanId: string, status: LoanStatus) {
    try {
      await setLoanStatus(loanId, status);
      showSuccess(`Loan marked as ${status}`);
    } catch {
      showError('Failed to update status');
    }
  }

  const deletingLoan = loans.find((l) => l.loanId === deletingLoanId);

  return (
    <div>
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
        {[
          { label: 'Total Loans', value: loans.length },
          { label: 'Active', value: loans.filter((l) => l.loanStatus === 'Active').length },
          { label: 'Closed / Other', value: loans.filter((l) => l.loanStatus !== 'Active').length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 px-3 md:px-5 py-3 md:py-4">
            <p className="text-[10px] md:text-xs font-medium text-slate-400 uppercase tracking-widest">{label}</p>
            <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <LoanTable
        loans={loans}
        onEdit={(loan) => setEditingLoan(loan)}
        onDelete={(id) => setDeletingLoanId(id)}
        onSetStatus={handleSetStatus}
        onAdd={() => setShowForm(true)}
      />

      {/* Add Modal */}
      {showForm && (
        <Modal title="Add New Loan" onClose={() => setShowForm(false)} size="xl">
          <LoanForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </Modal>
      )}

      {/* Edit Modal */}
      {editingLoan && (
        <Modal title={`Edit Loan — ${editingLoan.loanId}`} onClose={() => setEditingLoan(undefined)} size="xl">
          <LoanForm
            initialValues={editingLoan}
            onSubmit={handleUpdate}
            onCancel={() => setEditingLoan(undefined)}
          />
        </Modal>
      )}

      {/* Delete Confirm */}
      {deletingLoanId && deletingLoan && (
        <ConfirmDialog
          title="Delete Loan?"
          message={`This will permanently delete the loan for ${deletingLoan.borrowerName} (${deletingLoanId}) and all associated payment records.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeletingLoanId(null)}
        />
      )}
    </div>
  );
}
