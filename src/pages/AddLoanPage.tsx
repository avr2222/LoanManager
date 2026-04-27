import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoans } from '@/context/LoanContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
import { LoanForm } from '@/components/loans/LoanForm';
import { ChevronLeft } from 'lucide-react';
import type { Loan } from '@/types';

type MyRole = 'lender' | 'borrower' | 'mediator';

const ROLE_LABELS: Record<MyRole, string> = {
  lender:   'I am the Lender',
  borrower: 'I am the Borrower',
  mediator: 'I am the Mediator',
};

export function AddLoanPage() {
  const navigate = useNavigate();
  const { addLoan } = useLoans();
  const { phone, fullName, displayName } = useAuth();
  const { showSuccess, showError } = useToast();

  const myPhone = phone.replace(/\D/g, '').slice(-10);
  const myName  = fullName || displayName;

  const [myRole, setMyRole] = useState<MyRole>('lender');

  async function handleSubmit(loan: Loan) {
    try {
      const added = await addLoan(loan);
      showSuccess(`Loan ${added.loanId} added`);
      navigate('/loans', { replace: true });
    } catch {
      showError('Failed to add loan');
    }
  }

  // Props passed to LoanForm differ per role
  const roleProps = {
    lender: {
      defaultLenderName:  myName,
      defaultLenderPhone: myPhone,
      lockLender: !!myPhone,
    },
    borrower: {
      defaultBorrowerName:  myName,
      defaultBorrowerPhone: myPhone,
      lockBorrower: !!myPhone,
    },
    mediator: {
      defaultMediatorName:  myName,
      defaultMediatorPhone: myPhone,
      lockMediator: !!myPhone,
    },
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Add New Loan</h2>

        {/* Role selector */}
        <div className="flex flex-wrap gap-2 mb-5 p-1 bg-slate-100 rounded-xl w-fit">
          {(Object.keys(ROLE_LABELS) as MyRole[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setMyRole(role)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                myRole === role
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        <LoanForm
          key={myRole}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
          myPhone={myPhone}
          {...roleProps[myRole]}
        />
      </div>
    </div>
  );
}
