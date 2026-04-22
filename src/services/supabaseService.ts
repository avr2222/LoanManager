import { supabase } from '@/lib/supabase';
import type { Loan, Payment } from '@/types';

// ── Column mapping helpers ────────────────────────────────────────────────────

/** Strip non-digits and keep last 10 digits. Returns '' if input is blank. */
function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

function toDbLoan(l: Loan): Record<string, unknown> {
  return {
    loan_id: l.loanId,
    lender_name: l.lenderName ?? '',
    lender_phone: normalizePhone(l.lenderPhone),
    borrower_name: l.borrowerName,
    borrower_phone: normalizePhone(l.borrowerPhone),
    borrower_address: l.borrowerAddress,
    loan_type: l.loanType,
    mediator_name: l.mediatorName,
    mediator_phone: normalizePhone(l.mediatorPhone),
    mediator_commission_pct: l.mediatorCommissionPct,
    principal_amount: l.principalAmount,
    annual_interest_rate: l.annualInterestRate,
    monthly_interest_rate: l.monthlyInterestRate,
    date_given: l.dateGiven,
    monthly_due_day: l.monthlyDueDay,
    expected_tenure_months: l.expectedTenureMonths,
    monthly_interest_amount: l.monthlyInterestAmount,
    mediator_monthly_share: l.mediatorMonthlyShare,
    net_monthly_receipt: l.netMonthlyReceipt,
    loan_status: l.loanStatus,
    remarks: l.remarks,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  };
}

function fromDbLoan(r: Record<string, unknown>): Loan {
  return {
    loanId: r.loan_id as string,
    lenderName: (r.lender_name as string) || '',
    lenderPhone: (r.lender_phone as string) || '',
    borrowerName: r.borrower_name as string,
    borrowerPhone: r.borrower_phone as string,
    borrowerAddress: r.borrower_address as string,
    loanType: r.loan_type as Loan['loanType'],
    mediatorName: r.mediator_name as string,
    mediatorPhone: r.mediator_phone as string,
    mediatorCommissionPct: Number(r.mediator_commission_pct),
    principalAmount: Number(r.principal_amount),
    annualInterestRate: Number(r.annual_interest_rate),
    monthlyInterestRate: Number(r.monthly_interest_rate),
    dateGiven: r.date_given as string,
    monthlyDueDay: Number(r.monthly_due_day),
    expectedTenureMonths: Number(r.expected_tenure_months),
    monthlyInterestAmount: Number(r.monthly_interest_amount),
    mediatorMonthlyShare: Number(r.mediator_monthly_share),
    netMonthlyReceipt: Number(r.net_monthly_receipt),
    loanStatus: r.loan_status as Loan['loanStatus'],
    remarks: r.remarks as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toDbPayment(p: Payment): Record<string, unknown> {
  return {
    id: p.id,
    loan_id: p.loanId,
    borrower_name: p.borrowerName,
    month_year: p.monthYear,
    due_date: p.dueDate,
    interest_amount: p.interestAmount,
    mediator_share: p.mediatorShare,
    net_amount_expected: p.netAmountExpected,
    amount_received: p.amountReceived,
    date_received: p.dateReceived,
    payment_status: p.paymentStatus,
    days_overdue: p.daysOverdue,
    pending_amount: p.pendingAmount,
    remarks: p.remarks,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function fromDbPayment(r: Record<string, unknown>): Payment {
  return {
    id: r.id as string,
    loanId: r.loan_id as string,
    borrowerName: r.borrower_name as string,
    monthYear: r.month_year as string,
    dueDate: r.due_date as string,
    interestAmount: Number(r.interest_amount),
    mediatorShare: Number(r.mediator_share),
    netAmountExpected: Number(r.net_amount_expected),
    amountReceived: Number(r.amount_received),
    dateReceived: r.date_received as string,
    paymentStatus: r.payment_status as Payment['paymentStatus'],
    daysOverdue: Number(r.days_overdue),
    pendingAmount: Number(r.pending_amount),
    remarks: r.remarks as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ── Loans ──────────────────────────────────────────────────────────────────────

export const loansService = {
  async fetchAll(): Promise<Loan[]> {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .order('loan_id', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => fromDbLoan(r as Record<string, unknown>));
  },

  async upsert(loan: Loan): Promise<void> {
    const { error } = await supabase.from('loans').upsert(toDbLoan(loan));
    if (error) throw error;
  },

  async bulkUpsert(loans: Loan[]): Promise<void> {
    if (loans.length === 0) return;
    const { error } = await supabase.from('loans').upsert(loans.map(toDbLoan));
    if (error) throw error;
  },

  async delete(loanId: string): Promise<void> {
    const { error } = await supabase.from('loans').delete().eq('loan_id', loanId);
    if (error) throw error;
  },

  async deleteAll(): Promise<void> {
    const { error } = await supabase.from('loans').delete().neq('loan_id', '');
    if (error) throw error;
  },

  /** Returns the next sequential loan ID (e.g. "L026") using a SECURITY DEFINER
   *  RPC so phone users — who can't see all loans via RLS — get the correct global max. */
  async getNextLoanId(): Promise<string> {
    const { data, error } = await supabase.rpc('get_next_loan_id');
    if (error || !data) {
      // Fallback: timestamp-based ID avoids collisions if RPC not yet deployed
      return `L${Date.now()}`;
    }
    return data as string;
  },

  // Fill in admin's real name on all loans that have no lender name set
  async fillBlankLenderName(name: string): Promise<void> {
    if (!name) return;
    await supabase
      .from('loans')
      .update({ lender_name: name })
      .or('lender_name.is.null,lender_name.eq.');
  },

  // Fill in admin's phone on all loans that have no lender phone set
  async fillBlankLenderPhone(phone: string): Promise<void> {
    if (!phone) return;
    const normalized = phone.replace(/\D/g, '').slice(-10);
    if (!normalized) return;
    await supabase
      .from('loans')
      .update({ lender_phone: normalized })
      .or('lender_phone.is.null,lender_phone.eq.');
  },
};

// ── Payments ───────────────────────────────────────────────────────────────────

export const paymentsService = {
  async fetchAll(): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .order('due_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => fromDbPayment(r as Record<string, unknown>));
  },

  async upsert(payment: Payment): Promise<void> {
    const { error } = await supabase.from('payments').upsert(toDbPayment(payment));
    if (error) throw error;
  },

  async bulkUpsert(payments: Payment[]): Promise<void> {
    if (payments.length === 0) return;
    const { error } = await supabase.from('payments').upsert(payments.map(toDbPayment));
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteAll(): Promise<void> {
    const { error } = await supabase.from('payments').delete().neq('id', '');
    if (error) throw error;
  },

  async deleteByLoan(loanId: string): Promise<void> {
    const { error } = await supabase.from('payments').delete().eq('loan_id', loanId);
    if (error) throw error;
  },

  // Delete ALL payment records whose due_date is older than 6 months.
  async deleteOlderThan6Months(): Promise<number> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('payments')
      .delete()
      .lt('due_date', cutoffStr)
      .select('id');

    if (error) { console.warn('[Cleanup] Failed:', error.message); return 0; }
    return data?.length ?? 0;
  },
};

