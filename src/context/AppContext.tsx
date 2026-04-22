import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { loansService, paymentsService } from '@/services/supabaseService';
import { importFromExcel, exportToExcel } from '@/services/excelService';
import { profilesService } from '@/services/profilesService';
import { generateMonthlyPayment } from '@/services/calculationService';
import { useLoans } from './LoanContext';
import { usePayments } from './PaymentContext';
import { useAuth } from './AuthContext';
import type { Loan, Payment } from '@/types';

// Generate payment entries from May 2026 → today for all active loans.
// Skips months already in existingPayments. Safe to call on every load (idempotent).
const AUTO_GEN_FROM = new Date(2026, 4, 1); // May 1, 2026 — month is 0-indexed

function buildMissingPayments(loans: Loan[], existingPayments: Payment[]): Payment[] {
  const have   = new Set(existingPayments.map((p) => `${p.loanId}::${p.monthYear}`));
  const now    = new Date();
  const result: Payment[] = [];

  for (const loan of loans) {
    if (loan.loanStatus !== 'Active') continue;

    // Start from May 2026, never before that
    let yr = AUTO_GEN_FROM.getFullYear();
    let mo = AUTO_GEN_FROM.getMonth(); // 0-indexed

    while (yr < now.getFullYear() || (yr === now.getFullYear() && mo <= now.getMonth())) {
      const p = generateMonthlyPayment(loan, yr, mo);
      if (!have.has(`${loan.loanId}::${p.monthYear}`)) {
        result.push(p);
        have.add(`${loan.loanId}::${p.monthYear}`);
      }
      mo++;
      if (mo > 11) { mo = 0; yr++; }
    }
  }

  return result;
}

interface AppContextValue {
  loading: boolean;
  autoImporting: boolean;
  importFile: (file: File) => Promise<void>;
  exportData: () => void;
  clearAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// The bundled Excel file served from /public — Vite makes it available at base path
const BUNDLED_EXCEL_PATH = `${import.meta.env.BASE_URL}LoanTracker.xlsx`;

async function fetchBundledExcel(): Promise<File> {
  const res = await fetch(BUNDLED_EXCEL_PATH);
  if (!res.ok) throw new Error(`Could not fetch bundled Excel: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], 'LoanTracker.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [autoImporting, setAutoImporting] = useState(false);
  const { user, isAdmin, displayName, adminPhone } = useAuth();
  const { loans, bulkLoadLoans } = useLoans();
  const { payments, bulkLoadPayments } = usePayments();

  // Load all data from Supabase when user is authenticated
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.all([
      loansService.fetchAll(),
      paymentsService.fetchAll(),
    ])
      .then(async ([l0, p]) => {
        let l = l0;
        if (l.length > 0) {
          // If admin has a real name, backfill loans that have no lender name set
          if (isAdmin && displayName && !displayName.includes('@')) {
            const hasBlank = l.some((loan) => !loan.lenderName);
            if (hasBlank) {
              await loansService.fillBlankLenderName(displayName);
              l = l.map((loan) => loan.lenderName ? loan : { ...loan, lenderName: displayName });
            }
            // If admin has a phone stored, backfill loans that have no lender phone set
            if (adminPhone) {
              const normalized = adminPhone.replace(/\D/g, '').slice(-10);
              const hasBlankPhone = normalized && l.some((loan) => !loan.lenderPhone);
              if (hasBlankPhone) {
                await loansService.fillBlankLenderPhone(adminPhone);
                l = l.map((loan) => loan.lenderPhone ? loan : { ...loan, lenderPhone: normalized });
              }
            }
          }

          // Silently clean up stale pending payments older than 6 months
          paymentsService.deleteOlderThan6Months().then((n) => {
            if (n > 0) console.log(`[Cleanup] Removed ${n} stale payment(s) older than 6 months`);
          });

          // Data already in Supabase — load it then auto-generate any missing payments
          bulkLoadLoans(l);
          const cutoff6mo = new Date();
          cutoff6mo.setMonth(cutoff6mo.getMonth() - 6);
          bulkLoadPayments(p.filter((pay) => new Date(pay.dueDate) >= cutoff6mo));

          const missing = buildMissingPayments(l, p);
          if (missing.length > 0) {
            console.log(`[AutoGen] Creating ${missing.length} missing payment(s)`);
            await paymentsService.bulkUpsert(missing);
            bulkLoadPayments([...p, ...missing]);
          }
        } else {
          // No data in Supabase — auto-import the bundled Excel file
          setAutoImporting(true);
          try {
            const file = await fetchBundledExcel();
            const result = await importFromExcel(file);
            console.log('[AutoImport] Parsed:', result.loans.length, 'loans');
            if (result.loans.length > 0) {
              await loansService.bulkUpsert(result.loans);
              if (result.payments.length > 0) await paymentsService.bulkUpsert(result.payments);
              profilesService.provisionFromLoans(result.loans).catch(console.warn);
              bulkLoadLoans(result.loans);
              bulkLoadPayments(result.payments);
            }
          } catch (err) {
            // Bundled file not available or empty — that's fine, user can add data manually
            console.info('Auto-import skipped:', err);
          } finally {
            setAutoImporting(false);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const importFile = useCallback(async (file: File) => {
    const result = await importFromExcel(file);
    console.log('[Import] Parsed:', result.loans.length, 'loans,', result.payments.length, 'payments');

    if (result.loans.length === 0) {
      throw new Error('No loans found in the Excel file. Check that the "Loan Master" sheet has data.');
    }

    // Insert in order: loans first (payments reference loans via FK)
    await loansService.bulkUpsert(result.loans);
    if (result.payments.length > 0) await paymentsService.bulkUpsert(result.payments);

    // Auto-create phone accounts for all borrowers and mediators
    profilesService.provisionFromLoans(result.loans).catch(console.warn);

    bulkLoadLoans(result.loans);
    bulkLoadPayments(result.payments);
  }, [bulkLoadLoans, bulkLoadPayments]);

  const exportData = useCallback(() => {
    exportToExcel(loans, payments);
  }, [loans, payments]);

  const clearAllData = useCallback(async () => {
    // Delete payments first (FK dependency), then loans — both in one query each
    await paymentsService.deleteAll();
    await loansService.deleteAll();
    bulkLoadLoans([]);
    bulkLoadPayments([]);
  }, [bulkLoadLoans, bulkLoadPayments]);

  return (
    <AppContext.Provider value={{ loading, autoImporting, importFile, exportData, clearAllData }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
