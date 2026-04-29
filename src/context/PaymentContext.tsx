import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { Payment } from '@/types';
import { paymentsService } from '@/services/supabaseService';
import { derivePaymentFields } from '@/services/calculationService';

// ── Actions ───────────────────────────────────────────────────────────────────

type PaymentAction =
  | { type: 'BULK_LOAD'; payload: Payment[] }
  | { type: 'ADD'; payload: Payment }
  | { type: 'UPDATE'; payload: Payment }
  | { type: 'DELETE'; payload: string }
  | { type: 'DELETE_BY_LOAN'; payload: string };

function paymentReducer(state: Payment[], action: PaymentAction): Payment[] {
  switch (action.type) {
    case 'BULK_LOAD':
      return action.payload.map(derivePaymentFields);
    case 'ADD':
      return [...state, derivePaymentFields(action.payload)];
    case 'UPDATE':
      return state.map((p) =>
        p.id === action.payload.id ? derivePaymentFields(action.payload) : p
      );
    case 'DELETE':
      return state.filter((p) => p.id !== action.payload);
    case 'DELETE_BY_LOAN':
      return state.filter((p) => p.loanId !== action.payload);
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface PaymentContextValue {
  payments: Payment[];
  addPayment: (payment: Payment) => Promise<void>;
  updatePayment: (payment: Payment) => Promise<void>;
  claimPayment: (payment: Payment, utrNumber: string) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  restorePayment: (id: string) => Promise<void>;
  deletePaymentsByLoan: (loanId: string) => Promise<void>;
  bulkLoadPayments: (payments: Payment[]) => void;
}

const PaymentContext = createContext<PaymentContextValue | null>(null);

export function PaymentProvider({ children }: { children: ReactNode }) {
  const [payments, dispatch] = useReducer(paymentReducer, []);

  const addPayment = useCallback(async (payment: Payment) => {
    const derived = derivePaymentFields(payment);
    await paymentsService.upsert(derived);
    dispatch({ type: 'ADD', payload: derived });
  }, []);

  const updatePayment = useCallback(async (payment: Payment) => {
    const derived = derivePaymentFields(payment);
    await paymentsService.upsert(derived);
    dispatch({ type: 'UPDATE', payload: derived });
  }, []);

  const claimPayment = useCallback(async (payment: Payment, utrNumber: string) => {
    await paymentsService.claimPayment(payment.id, utrNumber);
    const remarksWithUtr = utrNumber.trim()
      ? `${payment.remarks ? payment.remarks + ' ' : ''}UTR: ${utrNumber.trim()}`
      : payment.remarks;
    const claimed = derivePaymentFields({
      ...payment,
      paymentStatus: 'Claimed',
      amountReceived: payment.netAmountExpected,
      remarks: remarksWithUtr,
    });
    dispatch({ type: 'UPDATE', payload: claimed });
  }, []);

  const deletePayment = useCallback(async (id: string) => {
    await paymentsService.delete(id);
    dispatch({ type: 'DELETE', payload: id });
  }, []);

  const restorePayment = useCallback(async (id: string) => {
    await paymentsService.restore(id);
    dispatch({ type: 'DELETE', payload: id });
  }, []);

  const deletePaymentsByLoan = useCallback(async (loanId: string) => {
    await paymentsService.deleteByLoan(loanId);
    dispatch({ type: 'DELETE_BY_LOAN', payload: loanId });
  }, []);

  const bulkLoadPayments = useCallback((payments: Payment[]) => {
    dispatch({ type: 'BULK_LOAD', payload: payments });
  }, []);

  return (
    <PaymentContext.Provider value={{ payments, addPayment, updatePayment, claimPayment, deletePayment, restorePayment, deletePaymentsByLoan, bulkLoadPayments }}>
      {children}
    </PaymentContext.Provider>
  );
}

export function usePayments(): PaymentContextValue {
  const ctx = useContext(PaymentContext);
  if (!ctx) throw new Error('usePayments must be used within PaymentProvider');
  return ctx;
}
