// ── Enumerations ──────────────────────────────────────────────────────────────

export type LoanType = 'Direct' | 'Through Mediator';
export type LoanStatus = 'Active' | 'Closed' | 'Defaulted' | 'Restructured';
export type PaymentStatus = 'Received' | 'Pending' | 'Waived' | 'Partial' | 'Claimed';

// ── Loan Master ───────────────────────────────────────────────────────────────

export interface Loan {
  loanId: string;                   // "L001", auto-generated
  lenderName?: string;              // who gave the money (blank = admin/self)
  lenderPhone?: string;             // lender's phone
  borrowerName: string;
  borrowerPhone: string;
  borrowerAddress: string;
  loanType: LoanType;
  mediatorName: string;
  mediatorPhone: string;
  mediatorCommissionPct: number;    // % of interest going to mediator
  principalAmount: number;          // ₹
  annualInterestRate: number;       // %
  // Derived (always recalculated via deriveLoanFields, not directly edited)
  monthlyInterestRate: number;      // annualInterestRate / 12
  dateGiven: string;                // ISO date string
  monthlyDueDay: number;            // day-of-month from dateGiven
  expectedTenureMonths: number;
  principalDueDate?: string | null; // optional expected principal repayment date (ISO date)
  monthlyInterestAmount: number;    // principal × monthlyInterestRate / 100
  mediatorMonthlyShare: number;     // monthlyInterestAmount × commissionPct / 100
  netMonthlyReceipt: number;        // monthlyInterestAmount − mediatorMonthlyShare
  loanStatus: LoanStatus;
  remarks: string;
  createdAt: string;                // ISO timestamp
  updatedAt: string;
  deletedAt?: string | null;        // soft-delete timestamp (null = active)
  deletedBy?: string | null;        // phone or email of who deleted it
  creatorId?: string;               // auth.users.id of who created this loan record
  confirmationStatus?: 'Pending' | 'Confirmed' | 'Disputed';
  closedAt?: string | null;           // ISO timestamp when loan was closed/written off
}

// ── Monthly Payment ───────────────────────────────────────────────────────────

export interface Payment {
  id: string;                       // uuid
  loanId: string;
  borrowerName: string;             // denormalized for display
  monthYear: string;                // "Apr-2025"
  dueDate: string;                  // ISO date
  interestAmount: number;           // from Loan.monthlyInterestAmount
  mediatorShare: number;            // from Loan.mediatorMonthlyShare
  netAmountExpected: number;        // from Loan.netMonthlyReceipt
  amountReceived: number;
  dateReceived: string;             // ISO date or ""
  paymentStatus: PaymentStatus;
  daysOverdue: number;              // calculated: today - dueDate (if overdue)
  pendingAmount: number;            // netAmountExpected − amountReceived
  remarks: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;        // soft-delete timestamp (null = active)
  deletedBy?: string | null;        // phone or email of who deleted it
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  tableName: string;                // 'loans' | 'payments'
  recordId: string;
  action: 'created' | 'updated' | 'deleted' | 'restored';
  performedBy: string | null;       // phone or email
  performedAt: string;              // ISO timestamp
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
}

// ── App Meta ──────────────────────────────────────────────────────────────────

export interface AppMeta {
  isDataLoaded: boolean;
  lastImportedAt: string;
  lastExportedAt: string;
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────

export interface DashboardKPIs {
  totalActiveLoans: number;
  totalPrincipalOutstanding: number;
  monthlyInterestExpected: number;
  netMonthlyIncome: number;
  totalOverduePayments: number;
  totalPendingAmount: number;
}
