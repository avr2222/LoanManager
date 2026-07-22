import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { loansService, paymentsService } from '@/services/supabaseService';
import { importFromExcel, exportToExcel } from '@/services/excelService';
import { profilesService } from '@/services/profilesService';
import { buildMissingPayments } from '@/services/calculationService';
import { initPushNotifications } from '@/services/pushNotificationService';
import { useLoans } from './LoanContext';
import { usePayments } from './PaymentContext';
import { useAuth } from './AuthContext';

/** `${loanId}::${monthYear}` keys of soft-deleted payments — passed to
 *  buildMissingPayments so a deleted month is never regenerated. Fetched fresh
 *  (source of truth in the DB) so mid-session deletions are always reflected.
 *  Degrades to an empty set on error, so generation is never blocked. */
async function fetchDeletedKeys(): Promise<Set<string>> {
  try {
    const deleted = await paymentsService.fetchDeleted();
    return new Set(deleted.map((p) => `${p.loanId}::${p.monthYear}`));
  } catch (err) {
    console.warn('[AutoGen] Could not fetch deleted payments for exclusion:', err);
    return new Set();
  }
}

interface AppContextValue {
  loading: boolean;
  autoImporting: boolean;
  importFile: (file: File) => Promise<{ warnings: string[] }>;
  exportData: () => void;
  clearAllData: () => Promise<void>;
  profileMap: Map<string, string>;
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
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const { user, isAdmin, displayName, adminPhone } = useAuth();
  const { loans, bulkLoadLoans } = useLoans();
  const { payments, bulkLoadPayments } = usePayments();

  // Init push notifications once user is known
  useEffect(() => {
    if (user?.id) initPushNotifications(user.id).catch(console.warn);
  }, [user?.id]);

  // Load all data from Supabase when user is authenticated
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.all([
      loansService.fetchAll(),
      paymentsService.fetchAll(),
      profilesService.listAll(),
      fetchDeletedKeys(),
    ])
      .then(async ([l0, p, profiles, deletedKeys]) => {
        const normPh = (ph: string) => ph.replace(/\D/g, '').slice(-10);
        const map = new Map<string, string>();
        for (const pr of profiles) {
          const name = pr.fullName || pr.displayName;
          if (pr.phone && name) map.set(normPh(pr.phone), name);
        }
        setProfileMap(map);
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

          // Data already in Supabase — load it then auto-generate any missing payments
          bulkLoadLoans(l);
          bulkLoadPayments(p);

          const missing = buildMissingPayments(l, p, deletedKeys);
          if (missing.length > 0) {
            try {
              await paymentsService.bulkUpsert(missing);
            } catch (err) {
              console.warn('[AutoGen] Could not persist payments (RLS?), using in-memory:', err);
            }
            bulkLoadPayments([...p, ...missing]);
          }
        } else if (isAdmin) {
          // No data in Supabase — auto-import the bundled Excel file (admin only)
          // Non-admin users returning 0 loans simply have no loans yet; don't import.
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
  }, [user?.id]); // user?.id — not user — so token refresh doesn't re-trigger a full reload

  // Re-run payment generation when a loan is added or deleted mid-session.
  // Idempotent: buildMissingPayments skips months already present or deleted.
  useEffect(() => {
    if (loading || loans.length === 0) return;
    let cancelled = false;
    (async () => {
      const deletedKeys = await fetchDeletedKeys();
      if (cancelled) return;
      const missing = buildMissingPayments(loans, payments, deletedKeys);
      if (missing.length === 0) return;
      try {
        await paymentsService.bulkUpsert(missing);
      } catch (err) {
        console.warn('[AutoGen] Could not persist payments:', err);
      }
      if (!cancelled) bulkLoadPayments([...payments, ...missing]);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans.length]); // loans.length — fires only on add/delete, not on edit

  const importFile = useCallback(async (file: File): Promise<{ warnings: string[] }> => {
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
    return { warnings: result.warnings };
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
    <AppContext.Provider value={{ loading, autoImporting, importFile, exportData, clearAllData, profileMap }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
