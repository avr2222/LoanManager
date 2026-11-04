import type { Loan } from '@/types';
import { resolveProfileName } from '@/utils/profileUtils';

/** Filter a loan list (or payments, via their loan) by who is involved. */
export type PartyRole = 'borrower' | 'mediator' | 'lender';

export interface PartyFilters {
  borrower: string;
  mediator: string;
  lender: string;
}

export interface PartyOption {
  key: string;
  label: string;
}

export const PARTY_ROLES: PartyRole[] = ['borrower', 'mediator', 'lender'];
export const EMPTY_PARTY_FILTERS: PartyFilters = { borrower: '', mediator: '', lender: '' };
/** Mediator filter value meaning "loans with no mediator" */
export const DIRECT_KEY = 'direct';

const normPhone = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-10);

/**
 * Stable identity for a person: their last 10 phone digits, or their
 * lower-cased name when no phone is stored. Empty when neither is known.
 */
export function partyKey(name?: string, phone?: string): string {
  const p = normPhone(phone);
  if (p) return p;
  const n = (name ?? '').trim().toLowerCase();
  return n ? `name:${n}` : '';
}

function partyOf(loan: Loan, role: PartyRole): { name?: string; phone?: string } | null {
  if (role === 'borrower') return { name: loan.borrowerName, phone: loan.borrowerPhone };
  if (role === 'lender') return { name: loan.lenderName, phone: loan.lenderPhone };
  return loan.loanType === 'Through Mediator' ? { name: loan.mediatorName, phone: loan.mediatorPhone } : null;
}

export function loanPartyKey(loan: Loan, role: PartyRole): string {
  const p = partyOf(loan, role);
  return p ? partyKey(p.name, p.phone) : '';
}

/**
 * Distinct people in `role` across `loans`, sorted by display name.
 * Names that appear more than once get their phone appended so the
 * options stay distinguishable.
 */
export function buildPartyOptions(loans: Loan[], role: PartyRole, profileMap: Map<string, string>): PartyOption[] {
  const byKey = new Map<string, { name: string; phone: string }>();
  for (const loan of loans) {
    const p = partyOf(loan, role);
    if (!p) continue;
    const key = partyKey(p.name, p.phone);
    if (!key || byKey.has(key)) continue;
    const resolved = resolveProfileName(p.name, p.phone, profileMap);
    const phone = (p.phone ?? '').trim();
    byKey.set(key, { name: resolved !== '—' ? resolved : phone, phone });
  }
  const nameCount = new Map<string, number>();
  for (const { name } of byKey.values()) nameCount.set(name.toLowerCase(), (nameCount.get(name.toLowerCase()) ?? 0) + 1);
  return Array.from(byKey.entries())
    .map(([key, { name, phone }]) => ({
      key,
      label: (nameCount.get(name.toLowerCase()) ?? 0) > 1 && phone && phone !== name ? `${name} · ${phone}` : name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function hasPartyFilters(f: PartyFilters): boolean {
  return !!(f.borrower || f.mediator || f.lender);
}

export function matchesPartyFilters(loan: Loan | undefined, f: PartyFilters): boolean {
  if (!hasPartyFilters(f)) return true;
  if (!loan) return false;
  if (f.borrower && loanPartyKey(loan, 'borrower') !== f.borrower) return false;
  if (f.lender && loanPartyKey(loan, 'lender') !== f.lender) return false;
  if (f.mediator) {
    const isMediated = loan.loanType === 'Through Mediator';
    if (f.mediator === DIRECT_KEY) return !isMediated;
    if (!isMediated || loanPartyKey(loan, 'mediator') !== f.mediator) return false;
  }
  return true;
}
