import { useNavigate } from 'react-router-dom';
import { useLoans } from '@/context/LoanContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
import { LoanForm } from '@/components/loans/LoanForm';
import { ChevronLeft } from 'lucide-react';
import type { Loan } from '@/types';

export function AddLoanPage() {
  const navigate = useNavigate();
  const { addLoan } = useLoans();
  const { userPhone, displayName, isAdmin, adminPhone } = useAuth();
  const { showSuccess, showError } = useToast();

  const myPhone = userPhone.replace(/\D/g, '').slice(-10);
  const lenderPhone = isAdmin ? adminPhone : userPhone;

  async function handleSubmit(loan: Loan) {
    try {
      await addLoan(loan);
      showSuccess(`Loan ${loan.loanId} added`);
      navigate('/dashboard', { replace: true });
    } catch {
      showError('Failed to add loan');
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ChevronLeft size={16} /> Back to Dashboard
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-5">Add New Loan</h2>
        <LoanForm
          onSubmit={handleSubmit}
          onCancel={() => navigate('/dashboard')}
          myPhone={myPhone}
          defaultLenderName={displayName || userPhone}
          defaultLenderPhone={lenderPhone}
          lockLender={!isAdmin}
        />
      </div>
    </div>
  );
}
