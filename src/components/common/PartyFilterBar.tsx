import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { Loan } from '@/types';
import { useApp } from '@/context/AppContext';
import {
  buildPartyOptions, hasPartyFilters, DIRECT_KEY, PARTY_ROLES,
  type PartyFilters, type PartyOption, type PartyRole,
} from '@/utils/partyFilters';

interface PartyFilterBarProps {
  /** Loans currently in scope — options are built from these */
  loans: Loan[];
  /** All loans the user can see — used to label a selection that is no longer in scope */
  allLoans: Loan[];
  filters: PartyFilters;
  onChange: (role: PartyRole, value: string) => void;
  onClear: () => void;
}

/** Borrower / Mediator / Lender dropdowns. A dropdown only appears when it can narrow the list. */
export function PartyFilterBar({ loans, allLoans, filters, onChange, onClear }: PartyFilterBarProps) {
  const { t } = useTranslation();
  const { profileMap } = useApp();

  const options = useMemo(() => {
    const result = {} as Record<PartyRole, PartyOption[]>;
    for (const role of PARTY_ROLES) {
      const opts = buildPartyOptions(loans, role, profileMap);
      const selected = filters[role];
      // Keep the current selection visible (and clearable) even if the scope no longer contains it
      if (selected && selected !== DIRECT_KEY && !opts.some((o) => o.key === selected)) {
        const label = buildPartyOptions(allLoans, role, profileMap).find((o) => o.key === selected)?.label
          ?? selected.replace(/^name:/, '');
        opts.unshift({ key: selected, label });
      }
      result[role] = opts;
    }
    return result;
  }, [loans, allLoans, filters, profileMap]);

  const hasDirect = useMemo(() => loans.some((l) => l.loanType !== 'Through Mediator'), [loans]);

  const visible = (role: PartyRole) =>
    !!filters[role] ||
    (role === 'mediator' ? options.mediator.length > 0 : options[role].length > 1);

  const roles = PARTY_ROLES.filter(visible);
  if (roles.length === 0) return null;
  const active = hasPartyFilters(filters);

  return (
    <div className="flex items-center gap-2 mb-3">
      {roles.map((role) => {
        const value = filters[role];
        return (
          <select
            key={role}
            value={value}
            onChange={(e) => onChange(role, e.target.value)}
            aria-label={t(`filters.${role}`)}
            title={t(`filters.${role}`)}
            className={`min-w-0 flex-1 md:flex-none md:w-52 px-2 py-1.5 text-xs md:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
              value ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {/* Unselected state reads as the role name, e.g. "Mediator ▾" */}
            <option value="">{t(`filters.${role}`)}</option>
            {role === 'mediator' && (hasDirect || value === DIRECT_KEY) && (
              <option value={DIRECT_KEY}>{t('filters.directOnly')}</option>
            )}
            {options[role].map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        );
      })}
      {active && (
        <button
          onClick={onClear}
          className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label={t('filters.clear')}
          title={t('filters.clear')}
        >
          <X size={14} />
          <span className="hidden md:inline">{t('filters.clear')}</span>
        </button>
      )}
    </div>
  );
}
