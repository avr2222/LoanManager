import { supabase } from '@/lib/supabase';
import type { Loan, Payment, AuditLog } from '@/types';

// ── Column mapping helpers ────────────────────────────────────────────────────

/** Strip non-digits and keep last 10 digits. Returns '' if input is blank. */
function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

function toDbLoan(l: Loan, fallbackCreatorId?: string): Record<string, unknown> {
  return {
    loan_id: l.loanId,
    creator_id: l.creatorId ?? fallbackCreatorId,   // always set — required by RLS
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
    closed_at: l.closedAt ?? null,
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
    deletedAt: (r.deleted_at as string) ?? null,
    deletedBy: (r.deleted_by as string) ?? null,
    creatorId: (r.creator_id as string) ?? undefined,
    confirmationStatus: (r.confirmation_status as Loan['confirmationStatus']) ?? 'Pending',
    closedAt: (r.closed_at as string) ?? null,
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
    deletedAt: (r.deleted_at as string) ?? null,
    deletedBy: (r.deleted_by as string) ?? null,
  };
}

function fromDbAuditLog(r: Record<string, unknown>): AuditLog {
  return {
    id: r.id as string,
    tableName: r.table_name as string,
    recordId: r.record_id as string,
    action: r.action as AuditLog['action'],
    performedBy: (r.performed_by as string) ?? null,
    performedAt: r.performed_at as string,
    oldData: (r.old_data as Record<string, unknown>) ?? null,
    newData: (r.new_data as Record<string, unknown>) ?? null,
  };
}

// ── Loans ──────────────────────────────────────────────────────────────────────

export const loansService = {
  /** Fetch all active (non-deleted) loans */
  async fetchAll(): Promise<Loan[]> {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .is('deleted_at', null)
      .order('loan_id', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => fromDbLoan(r as Record<string, unknown>));
  },

  /** Fetch soft-deleted loans (admin trash view) */
  async fetchDeleted(): Promise<Loan[]> {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => fromDbLoan(r as Record<string, unknown>));
  },

  /** INSERT a brand-new loan via SECURITY DEFINER RPC — bypasses RLS entirely.
   *  The function runs as postgres superuser and stamps creator_id = auth.uid()
   *  server-side, so non-admin phone users are never blocked by RLS policies. */
  async insert(loan: Loan): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated — please log in again.');
    const row = toDbLoan(loan, user.id);
    const { error } = await supabase.rpc('create_loan', { p_loan: row });
    if (error) throw error;
  },

  /** UPDATE an existing loan (edit form, status change). Preserves creator_id. */
  async upsert(loan: Loan): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const row = toDbLoan(loan, user?.id);
    console.log('[upsert] creator_id=', row.creator_id, ' user.id=', user?.id);
    const { error } = await supabase.from('loans').upsert(row);
    if (error) throw error;
  },

  async bulkUpsert(loans: Loan[]): Promise<void> {
    if (loans.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    const { error } = await supabase.from('loans').upsert(loans.map((l) => toDbLoan(l, uid)));
    if (error) throw error;
  },

  /** Soft-delete via SECURITY DEFINER RPC — bypasses RLS (same pattern as insert). */
  async delete(loanId: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_loan', { p_loan_id: loanId });
    if (error) throw error;
  },

  /** Soft-delete all loans (used by Clear All Data) */
  async deleteAll(): Promise<void> {
    const { error } = await supabase
      .from('loans')
      .update({ deleted_at: new Date().toISOString() })
      .is('deleted_at', null);
    if (error) throw error;
  },

  /** Restore a soft-deleted loan */
  async restore(loanId: string): Promise<void> {
    const { error } = await supabase
      .from('loans')
      .update({ deleted_at: null, deleted_by: null })
      .eq('loan_id', loanId);
    if (error) throw error;
  },

  /** Permanently hard-delete records already soft-deleted (admin purge) */
  async hardDeletePurge(loanId: string): Promise<void> {
    const { error } = await supabase
      .from('loans')
      .delete()
      .eq('loan_id', loanId)
      .not('deleted_at', 'is', null);
    if (error) throw error;
  },

  /** Returns the next sequential loan ID (e.g. "L026") using a SECURITY DEFINER
   *  RPC so phone users — who can't see all loans via RLS — get the correct global max. */
  async getNextLoanId(): Promise<string> {
    const { data, error } = await supabase.rpc('get_next_loan_id');
    if (error || !data) {
      return `L${Date.now()}`;
    }
    return data as string;
  },

  async fillBlankLenderName(name: string): Promise<void> {
    if (!name) return;
    await supabase
      .from('loans')
      .update({ lender_name: name })
      .or('lender_name.is.null,lender_name.eq.');
  },

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
  /** Fetch all active (non-deleted) payments */
  async fetchAll(): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .is('deleted_at', null)
      .order('due_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => fromDbPayment(r as Record<string, unknown>));
  },

  /** Fetch soft-deleted payments (admin trash view) */
  async fetchDeleted(): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => fromDbPayment(r as Record<string, unknown>));
  },

  async upsert(payment: Payment): Promise<void> {
    const { error } = await supabase.from('payments').upsert(toDbPayment(payment));
    if (error) throw error;
  },

  async bulkUpsert(payments: Payment[]): Promise<void> {
    if (payments.length === 0) return;
    const { error } = await supabase
      .from('payments')
      .upsert(payments.map(toDbPayment), { onConflict: 'loan_id,month_year' });
    if (error) throw error;
  },

  /** Soft-delete a single payment */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** Soft-delete all payments */
  async deleteAll(): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: new Date().toISOString() })
      .is('deleted_at', null);
    if (error) throw error;
  },

  /** Soft-delete all payments for a given loan */
  async deleteByLoan(loanId: string): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('loan_id', loanId)
      .is('deleted_at', null);
    if (error) throw error;
  },

  /** Restore a soft-deleted payment */
  async restore(id: string): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id);
    if (error) throw error;
  },

  /** Permanently hard-delete a record already soft-deleted (admin purge) */
  async hardDeletePurge(id: string): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', id)
      .not('deleted_at', 'is', null);
    if (error) throw error;
  },

  // Borrower claims they've paid via UPI (or any method).
  // Uses a SECURITY DEFINER RPC because borrowers cannot directly UPDATE payment rows.
  // Sets status='Claimed', amountReceived=netAmountExpected, stores UTR in remarks.
  async claimPayment(paymentId: string, utrNumber: string): Promise<void> {
    const { error } = await supabase.rpc('claim_payment', {
      p_payment_id: paymentId,
      p_utr_number: utrNumber,
    });
    if (error) throw error;
  },
};

// ── Audit Log ──────────────────────────────────────────────────────────────────

export const auditLogService = {
  /** Fetch audit log entries, optionally filtered by table or record */
  async fetch(opts?: { tableName?: string; recordId?: string; limit?: number }): Promise<AuditLog[]> {
    let query = supabase
      .from('audit_log')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(opts?.limit ?? 200);

    if (opts?.tableName) query = query.eq('table_name', opts.tableName);
    if (opts?.recordId)  query = query.eq('record_id', opts.recordId);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromDbAuditLog(r as Record<string, unknown>));
  },
};

