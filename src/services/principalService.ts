import { supabase } from '@/lib/supabase';
import type { Loan, Payment, PrincipalTxn, PrincipalTxnType } from '@/types';

function fromDb(r: Record<string, unknown>): PrincipalTxn {
  return {
    id: r.id as string,
    loanId: r.loan_id as string,
    txnType: r.txn_type as PrincipalTxnType,
    amount: Number(r.amount),
    txnDate: r.txn_date as string,
    principalBefore: Number(r.principal_before),
    principalAfter: Number(r.principal_after),
    remarks: (r.remarks as string) ?? '',
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at as string,
  };
}

/** The loan's new monthly figures, as the RPCs expect them. */
function loanAmounts(l: Loan): Record<string, number> {
  return {
    principal_amount: l.principalAmount,
    monthly_interest_amount: l.monthlyInterestAmount,
    mediator_monthly_share: l.mediatorMonthlyShare,
    net_monthly_receipt: l.netMonthlyReceipt,
  };
}

/** Re-priced pending payments, as the RPCs expect them. */
function paymentAmounts(payments: Payment[]): Record<string, unknown>[] {
  return payments.map((p) => ({
    id: p.id,
    interest_amount: p.interestAmount,
    mediator_share: p.mediatorShare,
    net_amount_expected: p.netAmountExpected,
    pending_amount: p.pendingAmount,
  }));
}

/** Turns a Supabase error into something a lender can act on. */
function describe(error: { code?: string; message?: string }): Error {
  const notInstalled =
    error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || error.code === 'PGRST205';
  if (notInstalled) {
    return new Error('Principal tracking is not set up yet — run supabase/v2_23_principal_transactions.sql in Supabase.');
  }
  return new Error(error.message || 'Could not save the principal entry');
}

export const principalService = {
  /** Ledger of a loan, newest first. Returns [] when the table isn't installed yet. */
  async fetchByLoan(loanId: string): Promise<PrincipalTxn[]> {
    const { data, error } = await supabase
      .from('principal_transactions')
      .select('*')
      .eq('loan_id', loanId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []).map((r) => fromDb(r as Record<string, unknown>));
  },

  /**
   * Record a principal movement atomically (SECURITY DEFINER RPC).
   * For Repayment / TopUp pass the loan with its NEW amounts and the pending
   * payments already re-priced; for Closure neither is needed.
   */
  async record(args: {
    loanId: string;
    type: PrincipalTxnType;
    amount: number;
    date: string;
    remarks?: string;
    loan?: Loan;
    payments?: Payment[];
  }): Promise<PrincipalTxn> {
    const { data, error } = await supabase.rpc('record_principal_txn', {
      p_loan_id: args.loanId,
      p_type: args.type,
      p_amount: args.amount,
      p_date: args.date,
      p_remarks: args.remarks ?? '',
      p_loan: args.loan ? loanAmounts(args.loan) : null,
      p_payments: paymentAmounts(args.payments ?? []),
    });
    if (error) throw describe(error);
    const row = Array.isArray(data) ? data[0] : data;
    return fromDb(row as Record<string, unknown>);
  },

  /** Undo the most recent entry of a loan. For Repayment / TopUp pass the loan
   *  restored to `principalBefore` and the pending payments re-priced back. */
  async undo(txnId: string, loan?: Loan, payments?: Payment[]): Promise<void> {
    const { error } = await supabase.rpc('undo_principal_txn', {
      p_txn_id: txnId,
      p_loan: loan ? loanAmounts(loan) : null,
      p_payments: paymentAmounts(payments ?? []),
    });
    if (error) throw describe(error);
  },
};
