import type { Loan, Payment, AppMeta } from '@/types';

const KEYS = {
  LOANS: 'lm_loans_v1',
  PAYMENTS: 'lm_payments_v1',
  META: 'lm_meta_v1',
} as const;

function save<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('localStorage save failed', e);
  }
}

function load<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const storageService = {
  saveLoans: (loans: Loan[]) => save(KEYS.LOANS, loans),
  loadLoans: (): Loan[] => load<Loan[]>(KEYS.LOANS, []),

  savePayments: (payments: Payment[]) => save(KEYS.PAYMENTS, payments),
  loadPayments: (): Payment[] => load<Payment[]>(KEYS.PAYMENTS, []),

  saveMeta: (meta: AppMeta) => save(KEYS.META, meta),
  loadMeta: (): AppMeta =>
    load<AppMeta>(KEYS.META, {
      isDataLoaded: false,
      lastImportedAt: '',
      lastExportedAt: '',
    }),

  clearAll(): void {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },

  hasData(): boolean {
    const meta = storageService.loadMeta();
    return meta.isDataLoaded;
  },
};
