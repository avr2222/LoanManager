import { useState } from 'react';
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
  // Phone users pick whether they are adding as lender or mediator
  const [myRole, setMyRole] = useState<'lender' | 'mediator'>('lender');

  async function handleSubmit(loan: Loan) {
    try {
      const added = await addLoan(loan);
      showSuccess(`Loan ${added.loanId} added`);
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
        <h2 className="text-base font-semibold text-slate-800 mb-4">Add New Loan</h2>

        {/* Role toggle — only for phone users */}
        {!isAdmin && (
          <div className="flex gap-2 mb-5 p-1 bg-slate-100 rounded-xl w-fit">
            {(['lender', 'mediator'] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setMyRole(role)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                  myRole === role
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                I am the {role}
              </button>
            ))}
          </div>
        )}

        {myRole === 'lender' || isAdmin ? (
          <LoanForm
            key="lender"
            onSubmit={handleSubmit}
            onCancel={() => navigate('/dashboard')}
            myPhone={myPhone}
            defaultLenderName={isAdmin ? (adminPhone ? displayName : '') : displayName || userPhone}
            defaultLenderPhone={isAdmin ? adminPhone : userPhone}
            lockLender={!isAdmin}
          />
        ) : (
          <LoanForm
            key="mediator"
            onSubmit={handleSubmit}
            onCancel={() => navigate('/dashboard')}
            myPhone={myPhone}
            defaultMediatorName={displayName || userPhone}
            defaultMediatorPhone={userPhone}
            lockMediator
          />
        )}
      </div>
    </div>
  );
}
