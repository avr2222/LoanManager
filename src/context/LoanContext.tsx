import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { Loan } from '@/types';
import { loansService } from '@/services/supabaseService';
import { deriveLoanFields } from '@/services/calculationService';
import { profilesService } from '@/services/profilesService';

// ── Actions ───────────────────────────────────────────────────────────────────

type LoanAction =
  | { type: 'BULK_LOAD'; payload: Loan[] }
  | { type: 'ADD'; payload: Loan }
  | { type: 'UPDATE'; payload: Loan }
  | { type: 'DELETE'; payload: string }
  | { type: 'SET_STATUS'; payload: { loanId: string; status: Loan['loanStatus'] } };

function loanReducer(state: Loan[], action: LoanAction): Loan[] {
  switch (action.type) {
    case 'BULK_LOAD':
      return action.payload;
    case 'ADD':
      return [...state, action.payload];
    case 'UPDATE':
      return state.map((l) => (l.loanId === action.payload.loanId ? action.payload : l));
    case 'DELETE':
      return state.filter((l) => l.loanId !== action.payload);
    case 'SET_STATUS':
      return state.map((l) =>
        l.loanId === action.payload.loanId
          ? { ...l, loanStatus: action.payload.status, updatedAt: new Date().toISOString() }
          : l
      );
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface LoanContextValue {
  loans: Loan[];
  addLoan: (loan: Loan) => Promise<void>;
  updateLoan: (loan: Loan) => Promise<void>;
  deleteLoan: (loanId: string) => Promise<void>;
  setLoanStatus: (loanId: string, status: Loan['loanStatus']) => Promise<void>;
  bulkLoadLoans: (loans: Loan[]) => void;
}

const LoanContext = createContext<LoanContextValue | null>(null);

export function LoanProvider({ children }: { children: ReactNode }) {
  const [loans, dispatch] = useReducer(loanReducer, []);

  const addLoan = useCallback(async (loan: Loan) => {
    await loansService.upsert(loan);
    profilesService.provisionFromLoans([loan]).catch(console.warn);
    dispatch({ type: 'ADD', payload: loan });
  }, []);

  const updateLoan = useCallback(async (loan: Loan) => {
    const updated = deriveLoanFields({ ...loan, updatedAt: undefined as unknown as string } as Parameters<typeof deriveLoanFields>[0]);
    await loansService.upsert(updated);
    dispatch({ type: 'UPDATE', payload: updated });
  }, []);

  const deleteLoan = useCallback(async (loanId: string) => {
    await loansService.delete(loanId);
    dispatch({ type: 'DELETE', payload: loanId });
  }, []);

  const setLoanStatus = useCallback(async (loanId: string, status: Loan['loanStatus']) => {
    const loan = loans.find((l) => l.loanId === loanId);
    if (!loan) return;
    const updated = { ...loan, loanStatus: status, updatedAt: new Date().toISOString() };
    await loansService.upsert(updated);
    dispatch({ type: 'SET_STATUS', payload: { loanId, status } });
  }, [loans]);

  const bulkLoadLoans = useCallback((loans: Loan[]) => {
    dispatch({ type: 'BULK_LOAD', payload: loans });
  }, []);

  return (
    <LoanContext.Provider value={{ loans, addLoan, updateLoan, deleteLoan, setLoanStatus, bulkLoadLoans }}>
      {children}
    </LoanContext.Provider>
  );
}

export function useLoans(): LoanContextValue {
  const ctx = useContext(LoanContext);
  if (!ctx) throw new Error('useLoans must be used within LoanProvider');
  return ctx;
}
