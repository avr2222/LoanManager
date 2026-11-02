import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PARTY_ROLES, type PartyFilters, type PartyRole } from '@/utils/partyFilters';

/**
 * Borrower / mediator / lender filters kept in the URL (?borrower=…&mediator=…&lender=…)
 * so they survive opening a loan and pressing Back, and can be linked to.
 */
export function usePartyFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<PartyFilters>(() => ({
    borrower: params.get('borrower') ?? '',
    mediator: params.get('mediator') ?? '',
    lender: params.get('lender') ?? '',
  }), [params]);

  const setFilter = useCallback((role: PartyRole, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(role, value);
      else next.delete(role);
      return next;
    }, { replace: true });
  }, [setParams]);

  const clearFilters = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      PARTY_ROLES.forEach((r) => next.delete(r));
      return next;
    }, { replace: true });
  }, [setParams]);

  return { filters, setFilter, clearFilters };
}
