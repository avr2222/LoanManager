import { useState, useEffect, useRef } from 'react';
import { Edit2, Trash2, XCircle, Plus, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Loan, LoanStatus } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatUtils';
import { useApp } from '@/context/AppContext';
import { resolveProfileName } from '@/utils/profileUtils';

type RoleFilter = 'MyLoans' | 'All' | 'Lender' | 'Borrower' | 'Mediator';

interface LoanTableProps {
  loans: Loan[];
  onEdit: (loan: Loan) => void;
  onDelete: (loanId: string) => void;
  onSetStatus: (loanId: string, status: LoanStatus) => void;
  onAdd: () => void;
  onRowClick?: (loan: Loan) => void;
  readOnly?: boolean;
  /** undefined = admin (all loans); empty Set = none; Set with ids = owned loans */
  ownedLoanIds?: Set<string>;
  /** Phone of the logged-in user — used to show "From: Lender" when user is the mediator */
  userPhone?: string;
  /** Active role filter — determines which party name to show in the counterparty column */
  roleFilter?: RoleFilter;
}

function getCounterparty(loan: Loan, roleFilter: RoleFilter | undefined, userPhone: string | undefined, profileMap: Map<string, string>) {
  const normP = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-10);
  if (roleFilter === 'Borrower') {
    return { name: resolveProfileName(loan.lenderName, loan.lenderPhone, profileMap), phone: loan.lenderPhone };
  }
  if (roleFilter === 'MyLoans' && userPhone) {
    const my = normP(userPhone);
    if (my && normP(loan.borrowerPhone) === my) {
      return { name: resolveProfileName(loan.lenderName, loan.lenderPhone, profileMap), phone: loan.lenderPhone };
    }
  }
  return { name: resolveProfileName(loan.borrowerName, loan.borrowerPhone, profileMap), phone: loan.borrowerPhone };
}

type SortKey = 'loanId' | 'borrowerName' | 'principalAmount' | 'monthlyInterestAmount' | 'loanStatus' | 'dateGiven';

export function LoanTable({ loans, onEdit, onDelete, onSetStatus, onAdd, onRowClick, readOnly, ownedLoanIds, userPhone, roleFilter }: LoanTableProps) {
  const { t } = useTranslation();
  const { profileMap } = useApp();
  const canAct = (loan: Loan) => !readOnly && (!ownedLoanIds || ownedLoanIds.has(loan.loanId));

  const counterpartyLabel =
    roleFilter === 'Borrower' ? t('loans.lender') :
    roleFilter === 'MyLoans'  ? t('loans.counterparty') :
    t('loans.borrower');

  // For mediators viewing their own loans, show lender name ("From: X") instead of their own name
  function loanTypeLabel(loan: Loan): string {
    if (loan.loanType !== 'Through Mediator') return t('loans.direct');
    const norm = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-10);
    const isSelf = userPhone && norm(loan.mediatorPhone) === norm(userPhone);
    if (isSelf) return t('loans.fromLender', { name: resolveProfileName(loan.lenderName, loan.lenderPhone, profileMap) || 'Admin' });
    return t('loans.viaMediator', { name: resolveProfileName(loan.mediatorName, loan.mediatorPhone, profileMap) || t('loans.mediator') });
  }
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LoanStatus | 'All'>('Active');
  const [sortKey, setSortKey] = useState<SortKey>('loanId');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);           // desktop pagination
  const [mobilePage, setMobilePage] = useState(1); // mobile infinite scroll
  const PAGE_SIZE = 25;
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtered = loans
    .filter((l) => {
      const matchSearch =
        !search ||
        l.borrowerName.toLowerCase().includes(search.toLowerCase()) ||
        l.loanId.toLowerCase().includes(search.toLowerCase()) ||
        l.borrowerPhone.includes(search);
      const matchStatus = statusFilter === 'All' || l.loanStatus === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE); // desktop
  const mobileItems = filtered.slice(0, mobilePage * PAGE_SIZE);           // mobile cumulative
  const hasMoreMobile = mobileItems.length < filtered.length;

  // Infinite scroll: load more when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMoreMobile) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setMobilePage((p) => p + 1); },
      { rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreMobile]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(1);
    setMobilePage(1);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  const thClass = 'px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none';

  // Desktop only — mobile uses infinite scroll instead
  const pagination = totalPages > 1 && (
    <div className="hidden md:flex items-center justify-between mt-4 text-sm text-slate-500">
      <span>{filtered.length} {t('nav.loans').toLowerCase()}</span>
      <div className="flex gap-2">
        <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">{t('common.prev')}</button>
        <span className="px-3 py-1.5">{page}/{totalPages}</span>
        <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">{t('common.next')}</button>
      </div>
    </div>
  );

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('loans.searchLoans')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); setMobilePage(1); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as LoanStatus | 'All'); setPage(1); setMobilePage(1); }}
          className="px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none"
        >
          <option value="All">{t('common.all')}</option>
          <option value="Active">{t('common.active')}</option>
          <option value="Closed">{t('common.closed')}</option>
          <option value="Defaulted">{t('common.defaulted')}</option>
          <option value="Restructured">{t('common.restructured')}</option>
        </select>
        {!readOnly && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 shrink-0"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">{t('loans.addLoan')}</span>
            <span className="sm:hidden">{t('common.add')}</span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={t('loans.noLoansFound')}
          description={t('loans.noLoansDesc')}
          action={{ label: t('loans.addLoan'), onClick: onAdd }}
        />
      ) : (
        <>
          {/* Mobile card view — infinite scroll */}
          <div className="md:hidden space-y-3">
            {mobileItems.map((loan) => (
              <div
                key={loan.loanId}
                className={`bg-white rounded-2xl border border-slate-100 p-4 ${onRowClick ? 'cursor-pointer hover:border-indigo-200' : ''}`}
                onClick={() => onRowClick?.(loan)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-semibold text-indigo-500">{loan.loanId}</span>
                    {(() => { const cp = getCounterparty(loan, roleFilter, userPhone, profileMap); return (<>
                      <p className="text-sm font-semibold text-slate-900">{cp.name}</p>
                      <p className="text-xs text-slate-400">{cp.phone}</p>
                    </>); })()}
                  </div>
                  {canAct(loan) && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onEdit(loan)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit2 size={15} /></button>
                      {loan.loanStatus === 'Active' && (
                        <button onClick={() => onSetStatus(loan.loanId, 'Closed')} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Close loan"><XCircle size={15} /></button>
                      )}
                      <button onClick={() => onDelete(loan.loanId)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t border-slate-50">
                  <div>
                    <p className="text-slate-400">Principal</p>
                    <p className="font-semibold text-slate-800">{formatCurrency(loan.principalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Monthly</p>
                    <p className="font-semibold text-slate-800">{formatCurrency(loan.monthlyInterestAmount)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Net Receipt</p>
                    <p className="font-semibold text-emerald-600">{formatCurrency(loan.netMonthlyReceipt)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                  <span>Given: {formatDate(loan.dateGiven)}</span>
                  <span>{loanTypeLabel(loan)}</span>
                  <StatusBadge status={loan.loanStatus} />
                </div>
              </div>
            ))}
            {/* Infinite scroll sentinel */}
            {hasMoreMobile && (
              <div ref={sentinelRef} className="py-4 flex justify-center">
                <span className="text-xs text-slate-400">{t('common.loadingMore')}</span>
              </div>
            )}
            {!hasMoreMobile && filtered.length > PAGE_SIZE && (
              <p className="text-center text-xs text-slate-400 py-3">{t('common.allShown', { count: filtered.length })}</p>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-slate-100">
                    <th className={thClass} onClick={() => toggleSort('loanId')}><span className="flex items-center gap-1">{t('loans.loanId')} <SortIcon col="loanId" /></span></th>
                    <th className={thClass} onClick={() => toggleSort('borrowerName')}><span className="flex items-center gap-1">{counterpartyLabel} <SortIcon col="borrowerName" /></span></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">{t('loans.type')}</th>
                    <th className={thClass} onClick={() => toggleSort('principalAmount')}><span className="flex items-center gap-1">{t('loans.principal')} <SortIcon col="principalAmount" /></span></th>
                    <th className={thClass} onClick={() => toggleSort('monthlyInterestAmount')}><span className="flex items-center gap-1">{t('loans.monthly')} <SortIcon col="monthlyInterestAmount" /></span></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">{t('loans.netMonthly')}</th>
                    <th className={thClass} onClick={() => toggleSort('dateGiven')}><span className="flex items-center gap-1">{t('loans.dateGiven')} <SortIcon col="dateGiven" /></span></th>
                    <th className={thClass} onClick={() => toggleSort('loanStatus')}><span className="flex items-center gap-1">{t('loans.status')} <SortIcon col="loanStatus" /></span></th>
                    {!readOnly && <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">{t('loans.actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paged.map((loan) => (
                    <tr
                      key={loan.loanId}
                      className={`hover:bg-slate-50/60 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                      onClick={() => onRowClick?.(loan)}
                    >
                      <td className="px-4 py-3 text-xs font-mono font-semibold text-indigo-500">{loan.loanId}</td>
                      <td className="px-4 py-3">
                        {(() => { const cp = getCounterparty(loan, roleFilter, userPhone, profileMap); return (<>
                          <div className="text-sm font-medium text-slate-800">{cp.name}</div>
                          <div className="text-xs text-slate-400">{cp.phone}</div>
                        </>); })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {loanTypeLabel(loan)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{formatCurrency(loan.principalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatCurrency(loan.monthlyInterestAmount)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(loan.netMonthlyReceipt)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(loan.dateGiven)}</td>
                      <td className="px-4 py-3"><StatusBadge status={loan.loanStatus} /></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {canAct(loan) && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => onEdit(loan)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit"><Edit2 size={14} /></button>
                          {loan.loanStatus === 'Active' && (
                            <button onClick={() => onSetStatus(loan.loanId, 'Closed')} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Close loan"><XCircle size={14} /></button>
                          )}
                          <button onClick={() => onDelete(loan.loanId)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={14} /></button>
                        </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pagination}
        </>
      )}
    </div>
  );
}
