import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Loan, LoanStatus } from '@/types';
import { useLoans } from '@/context/LoanContext';
import { usePayments } from '@/context/PaymentContext';
import { useToast } from '@/components/common/Toast';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LoanForm } from '@/components/loans/LoanForm';
import { LoanTable } from '@/components/loans/LoanTable';
import { useAuth } from '@/context/AuthContext';

type RoleFilter = 'MyLoans' | 'All' | 'Lender' | 'Borrower' | 'Mediator';

export function LoansPage() {
  const { loans, addLoan, updateLoan, deleteLoan, setLoanStatus } = useLoans();
  const { isAdmin, hasFullAccess, userPhone, displayName, phone, user } = useAuth();
  const { deletePaymentsByLoan } = usePayments();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const myPhone = phone.replace(/\D/g, '').slice(-10);

  const [showForm, setShowForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | undefined>();
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('MyLoans');
  const [lenderFilter, setLenderFilter] = useState(''); // admin only: filter by lender phone

  // Unique lenders in the system (admin only)
  const knownLenders = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, string>();
    for (const l of loans) {
      const p = (l.lenderPhone ?? '').replace(/\D/g, '').slice(-10);
      if (p) map.set(p, l.lenderName || p);
    }
    return Array.from(map.entries())
      .map(([phone, name]) => ({ phone, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loans, isAdmin]);

  async function handleAdd(loan: Loan) {
    try {
      const added = await addLoan(loan);
      setShowForm(false);
      showSuccess(`Loan ${added.loanId} added for ${added.borrowerName}`);
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

  // Loans the current user can edit/delete: matches by UUID creator_id first,
  // then falls back to phone match for legacy loans without creator_id.
  const ownedLoanIds = useMemo(() => {
    if (isAdmin) return undefined;           // admin acts on all
    if (!hasFullAccess) return new Set<string>(); // view-only
    return new Set(loans.filter((l) =>
      (user && l.creatorId === user.id) ||
      (myPhone && (
        l.lenderPhone?.replace(/\D/g, '').slice(-10) === myPhone ||
        l.borrowerPhone?.replace(/\D/g, '').slice(-10) === myPhone
      ))
    ).map((l) => l.loanId));
  }, [isAdmin, hasFullAccess, loans, user, myPhone]);

  // Role filter — default 'MyLoans' shows only loans where user has any role
  const roleFilteredLoans = useMemo(() => {
    const norm = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-10);
    let result = loans;
    // Admin: filter by selected lender first
    if (isAdmin && lenderFilter) {
      result = result.filter((l) => norm(l.lenderPhone) === lenderFilter);
    }
    if (roleFilter === 'All') return result;
    if (!myPhone) return result; // no phone — can't filter by role
    if (roleFilter === 'MyLoans') {
      return result.filter((l) =>
        norm(l.lenderPhone) === myPhone ||
        norm(l.borrowerPhone) === myPhone ||
        norm(l.mediatorPhone) === myPhone
      );
    }
    if (roleFilter === 'Lender')   return result.filter((l) => norm(l.lenderPhone) === myPhone);
    if (roleFilter === 'Borrower') return result.filter((l) => norm(l.borrowerPhone) === myPhone);
    if (roleFilter === 'Mediator') return result.filter((l) => norm(l.mediatorPhone) === myPhone);
    return result;
  }, [loans, roleFilter, myPhone, isAdmin, lenderFilter]);

  const deletingLoan = loans.find((l) => l.loanId === deletingLoanId);

  return (
    <div>
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
        {[
          { label: 'Total Loans',  value: roleFilteredLoans.length,                                             accent: 'from-slate-50  to-white',       dot: 'bg-slate-300'   },
          { label: 'Active',       value: roleFilteredLoans.filter((l) => l.loanStatus === 'Active').length,    accent: 'from-emerald-50 to-white',      dot: 'bg-emerald-400' },
          { label: 'Closed / Other', value: roleFilteredLoans.filter((l) => l.loanStatus !== 'Active').length, accent: 'from-slate-50  to-white',       dot: 'bg-slate-300'   },
        ].map(({ label, value, accent, dot }) => (
          <div key={label} className={`bg-gradient-to-br ${accent} rounded-2xl border border-slate-200/60 shadow-sm px-3 md:px-5 py-3 md:py-4`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
              <p className="text-[10px] md:text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Lender selector — admin only */}
      {isAdmin && knownLenders.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">Lender</label>
          <select
            value={lenderFilter}
            onChange={(e) => setLenderFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All Lenders ({loans.length})</option>
            {knownLenders.map(({ phone, name }) => (
              <option key={phone} value={phone}>
                {name} — {phone}
              </option>
            ))}
          </select>
          {lenderFilter && (
            <button
              onClick={() => setLenderFilter('')}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Role filter chips */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {(['MyLoans', 'All', ...(myPhone ? ['Lender', 'Borrower', 'Mediator'] : [])] as RoleFilter[]).map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`px-3.5 py-1 text-xs font-semibold rounded-full border transition-all ${
              roleFilter === r
                ? 'text-white border-transparent shadow-sm shadow-indigo-200'
                : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
            }`}
            style={roleFilter === r ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)' } : {}}
          >
            {r === 'MyLoans' ? 'My Loans' : r === 'All' ? 'All Loans' : `As ${r}`}
          </button>
        ))}
      </div>

      <LoanTable
        loans={roleFilteredLoans}
        onEdit={(loan) => setEditingLoan(loan)}
        onDelete={(id) => setDeletingLoanId(id)}
        onSetStatus={handleSetStatus}
        onAdd={() => setShowForm(true)}
        onRowClick={(loan) => navigate(`/loans/${loan.loanId}`)}
        readOnly={!isAdmin && !hasFullAccess}
        ownedLoanIds={ownedLoanIds}
        userPhone={userPhone}
      />

      {/* Add Modal */}
      {showForm && (
        <Modal title="Add New Loan" onClose={() => setShowForm(false)} size="xl">
          <LoanForm
            onSubmit={handleAdd}
            onCancel={() => setShowForm(false)}
            defaultLenderName={!isAdmin ? displayName : undefined}
            defaultLenderPhone={!isAdmin ? userPhone : undefined}
            lockLender={!isAdmin}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editingLoan && (
        <Modal title={`Edit Loan — ${editingLoan.loanId}`} onClose={() => setEditingLoan(undefined)} size="xl">
          <LoanForm
            initialValues={editingLoan}
            onSubmit={handleUpdate}
            onCancel={() => setEditingLoan(undefined)}
            lockLender={!isAdmin}
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
