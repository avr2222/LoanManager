import { useState, useEffect, useRef } from 'react';
import { Edit2, Trash2, XCircle, Plus, Search, ChevronUp, ChevronDown } from 'lucide-react';
import type { Loan, LoanStatus } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatUtils';

interface LoanTableProps {
  loans: Loan[];
  onEdit: (loan: Loan) => void;
  onDelete: (loanId: string) => void;
  onSetStatus: (loanId: string, status: LoanStatus) => void;
  onAdd: () => void;
  readOnly?: boolean;
  /** undefined = admin (all loans); empty Set = none; Set with ids = owned loans */
  ownedLoanIds?: Set<string>;
  /** Phone of the logged-in user — used to show "From: Lender" when user is the mediator */
  userPhone?: string;
}

type SortKey = 'loanId' | 'borrowerName' | 'principalAmount' | 'monthlyInterestAmount' | 'loanStatus' | 'dateGiven';

export function LoanTable({ loans, onEdit, onDelete, onSetStatus, onAdd, readOnly, ownedLoanIds, userPhone }: LoanTableProps) {
  const canAct = (loan: Loan) => !readOnly && (!ownedLoanIds || ownedLoanIds.has(loan.loanId));

  // For mediators viewing their own loans, show lender name ("From: X") instead of their own name
  function loanTypeLabel(loan: Loan): string {
    if (loan.loanType !== 'Through Mediator') return 'Direct';
    const isSelf = userPhone && loan.mediatorPhone === userPhone;
    if (isSelf) return `From: ${loan.lenderName || 'Admin'}`;
    return `Via: ${loan.mediatorName || 'Mediator'}`;
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
      <span>{filtered.length} loans</span>
      <div className="flex gap-2">
        <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Prev</button>
        <span className="px-3 py-1.5">{page}/{totalPages}</span>
        <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Next</button>
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
            placeholder="Search loans..."
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
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Closed">Closed</option>
          <option value="Defaulted">Defaulted</option>
          <option value="Restructured">Restructured</option>
        </select>
        {!readOnly && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 shrink-0"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add Loan</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No loans found"
          description="Add your first loan or import from Excel to get started."
          action={{ label: 'Add Loan', onClick: onAdd }}
        />
      ) : (
        <>
          {/* Mobile card view — infinite scroll */}
          <div className="md:hidden space-y-3">
            {mobileItems.map((loan) => (
              <div key={loan.loanId} className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-semibold text-indigo-500">{loan.loanId}</span>
                    <p className="text-sm font-semibold text-slate-900">{loan.borrowerName}</p>
                    <p className="text-xs text-slate-400">{loan.borrowerPhone}</p>
                  </div>
                  {canAct(loan) && (
                    <div className="flex items-center gap-1">
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
                <span className="text-xs text-slate-400">Loading more…</span>
              </div>
            )}
            {!hasMoreMobile && filtered.length > PAGE_SIZE && (
              <p className="text-center text-xs text-slate-400 py-3">All {filtered.length} loans shown</p>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={thClass} onClick={() => toggleSort('loanId')}><span className="flex items-center gap-1">Loan ID <SortIcon col="loanId" /></span></th>
                    <th className={thClass} onClick={() => toggleSort('borrowerName')}><span className="flex items-center gap-1">Borrower <SortIcon col="borrowerName" /></span></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Type</th>
                    <th className={thClass} onClick={() => toggleSort('principalAmount')}><span className="flex items-center gap-1">Principal <SortIcon col="principalAmount" /></span></th>
                    <th className={thClass} onClick={() => toggleSort('monthlyInterestAmount')}><span className="flex items-center gap-1">Monthly <SortIcon col="monthlyInterestAmount" /></span></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Net Receipt</th>
                    <th className={thClass} onClick={() => toggleSort('dateGiven')}><span className="flex items-center gap-1">Date Given <SortIcon col="dateGiven" /></span></th>
                    <th className={thClass} onClick={() => toggleSort('loanStatus')}><span className="flex items-center gap-1">Status <SortIcon col="loanStatus" /></span></th>
                    {!readOnly && <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paged.map((loan) => (
                    <tr key={loan.loanId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono font-semibold text-indigo-500">{loan.loanId}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-800">{loan.borrowerName}</div>
                        <div className="text-xs text-slate-400">{loan.borrowerPhone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {loanTypeLabel(loan)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{formatCurrency(loan.principalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatCurrency(loan.monthlyInterestAmount)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(loan.netMonthlyReceipt)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(loan.dateGiven)}</td>
                      <td className="px-4 py-3"><StatusBadge status={loan.loanStatus} /></td>
                      <td className="px-4 py-3">
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
