import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoans } from '@/context/LoanContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
import { LoanForm } from '@/components/loans/LoanForm';
import { ChevronLeft } from 'lucide-react';
import type { Loan } from '@/types';

type MyRole = 'lender' | 'borrower' | 'mediator' | 'other';

const ROLE_LABELS: Record<MyRole, string> = {
  lender:   'I am the Lender',
  borrower: 'I am the Borrower',
  mediator: 'I am the Mediator',
  other:    'Someone else lent',
};

export function AddLoanPage() {
  const navigate = useNavigate();
  const { addLoan } = useLoans();
  const { phone, adminPhone, fullName, displayName, isAdmin } = useAuth();
  const { showSuccess, showError } = useToast();

  // Same phone the Loans page uses for "My Loans", so a loan added here as
  // lender always shows up there.
  const myPhone = (phone || adminPhone).replace(/\D/g, '').slice(-10);
  const myName  = fullName || displayName;

  const [myRole, setMyRole] = useState<MyRole>('lender');
  const roles: MyRole[] = isAdmin ? ['lender', 'borrower', 'mediator', 'other'] : ['lender', 'borrower', 'mediator'];

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
      requireLender: true,
    },
    mediator: {
      defaultMediatorName:  myName,
      defaultMediatorPhone: myPhone,
      lockMediator: !!myPhone,
      requireLender: true,
    },
    other: {
      requireLender: true,
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
          {roles.map((role) => (
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

        {myRole === 'lender' && !myPhone && (
          <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Your profile has no phone number, so this loan won't appear under My Loans. Add it from your profile (your avatar, top right) first, or enter it below.
          </p>
        )}

        <LoanForm
          key={myRole}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
          myPhone={myRole === 'other' ? undefined : myPhone}
          {...roleProps[myRole]}
        />
      </div>
    </div>
  );
}
