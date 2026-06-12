import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Trash2, Plus, Search, ChevronUp, ChevronDown, CheckCircle2 } from 'lucide-react';
import type { Payment, PaymentStatus } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatUtils';
import { useApp } from '@/context/AppContext';
import { useLoans } from '@/context/LoanContext';
import { resolveProfileName } from '@/utils/profileUtils';
import { compareMonthYear } from '@/utils/dateUtils';
import { isOverduePayment } from '@/services/calculationService';

type FilterValue = PaymentStatus | 'All' | 'Overdue';

interface PaymentTableProps {
  payments: Payment[];
  onEdit: (payment: Payment) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onMarkPaid: (id: string) => void;
  readOnly?: boolean;
  /** When provided, action buttons are only shown for payments whose loanId is in this set */
  ownedLoanIds?: Set<string>;
  /** When false, the Record Payment button is disabled (phone user has no lender loans) */
  canAdd?: boolean;
  /** Controlled status filter driven by parent (e.g. card clicks) */
  activeFilter?: FilterValue;
}

type SortKey = 'monthYear' | 'loanId' | 'borrowerName' | 'netAmountExpected' | 'amountReceived' | 'daysOverdue' | 'paymentStatus' | 'dueDate';

export function PaymentTable({ payments, onEdit, onDelete, onAdd, onMarkPaid, readOnly, ownedLoanIds, canAdd = true, activeFilter }: PaymentTableProps) {
  const navigate = useNavigate();
  const { profileMap } = useApp();
  const { loans } = useLoans();
  // A row is editable if readOnly is false AND (no ownedLoanIds filter, or the payment's loan is owned by the current user)
  const canAct = (p: Payment) => !readOnly && (!ownedLoanIds || ownedLoanIds.has(p.loanId));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterValue>('All');
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);           // desktop pagination
  const [mobilePage, setMobilePage] = useState(1); // mobile infinite scroll
  const PAGE_SIZE = 25;
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Sync external card-click filter into internal state
  useEffect(() => {
    if (activeFilter !== undefined) {
      setStatusFilter(activeFilter);
      setPage(1);
      setMobilePage(1);
    }
  }, [activeFilter]);

  const filtered = payments
    .filter((p) => {
      const matchSearch =
        !search ||
        p.borrowerName.toLowerCase().includes(search.toLowerCase()) ||
        p.loanId.toLowerCase().includes(search.toLowerCase()) ||
        p.monthYear.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === 'All' ? true :
        statusFilter === 'Overdue' ? isOverduePayment(p) :
        p.paymentStatus === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      // "May-2026" strings sort alphabetically, not chronologically — parse them
      else if (sortKey === 'monthYear') cmp = compareMonthYear(String(av), String(bv));
      else cmp = String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
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

  const th = (col: SortKey, label: string, extraClass = '') => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none ${extraClass}`}
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center gap-1">{label} <SortIcon col={col} /></span>
    </th>
  );

  // Desktop only — mobile uses infinite scroll instead
  const pagination = totalPages > 1 && (
    <div className="hidden md:flex items-center justify-between mt-4 text-sm text-slate-500">
      <span>{filtered.length} records</span>
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
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); setMobilePage(1); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as FilterValue); setPage(1); setMobilePage(1); }}
          className="px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none"
        >
          <option value="All">All</option>
          <option value="Overdue">Overdue</option>
          <option value="Pending">Pending</option>
          <option value="Received">Received</option>
          <option value="Partial">Partial</option>
          <option value="Waived">Waived</option>
        </select>
        {!readOnly && (
          <button
            onClick={canAdd ? onAdd : undefined}
            disabled={!canAdd}
            title={!canAdd ? 'You have no loans as lender to record payments for' : undefined}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg shrink-0 transition-colors ${
              canAdd
                ? 'bg-indigo-500 hover:bg-indigo-600 cursor-pointer'
                : 'bg-indigo-300 cursor-not-allowed opacity-60'
            }`}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Record Payment</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No payments found"
          description="Record a payment or import from Excel."
          action={{ label: 'Record Payment', onClick: onAdd }}
        />
      ) : (
        <>
          {/* Mobile card view — infinite scroll */}
          <div className="md:hidden space-y-3">
            {mobileItems.map((p) => (
              <div
                key={p.id}
                className={`bg-white rounded-2xl border p-4 pr-14 md:pr-4 ${p.daysOverdue > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-100'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <button onClick={() => navigate(`/loans/${p.loanId}`)} className="text-xs font-mono font-semibold text-indigo-500 hover:underline">{p.loanId}</button>
                    <p className="text-sm font-semibold text-slate-800">{resolveProfileName(p.borrowerName, loans.find(l => l.loanId === p.loanId)?.borrowerPhone, profileMap)}</p>
                    <p className="text-xs text-slate-400">{p.monthYear} · Due {formatDate(p.dueDate)}</p>
                  </div>
                  {canAct(p) && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => onEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => onDelete(p.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t border-slate-50">
                  <div>
                    <p className="text-slate-400">Expected</p>
                    <p className="font-semibold text-slate-800">{formatCurrency(p.netAmountExpected)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Received</p>
                    <p className="font-semibold text-emerald-600">{p.amountReceived > 0 ? formatCurrency(p.amountReceived) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Pending</p>
                    <p className="font-semibold text-red-500">{p.pendingAmount > 0 ? formatCurrency(p.pendingAmount) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <StatusBadge status={p.paymentStatus} />
                  <div className="flex items-center gap-2">
                    {p.daysOverdue > 0 && (
                      <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{p.daysOverdue}d overdue</span>
                    )}
                    {canAct(p) && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived' && (
                      <button
                        onClick={() => onMarkPaid(p.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <CheckCircle2 size={13} /> Mark Paid
                      </button>
                    )}
                  </div>
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
              <p className="text-center text-xs text-slate-400 py-3">All {filtered.length} records shown</p>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead>
                  <tr className="border-b border-slate-100">
                    {th('loanId', 'Loan')}
                    {th('borrowerName', 'Borrower')}
                    {th('monthYear', 'Month')}
                    {th('dueDate', 'Due Date')}
                    {th('netAmountExpected', 'Expected')}
                    {th('amountReceived', 'Received')}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Pending</th>
                    {th('daysOverdue', 'Overdue')}
                    {th('paymentStatus', 'Status')}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paged.map((p) => (
                    <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${p.daysOverdue > 0 ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3"><button onClick={() => navigate(`/loans/${p.loanId}`)} className="text-xs font-mono font-semibold text-indigo-500 hover:underline">{p.loanId}</button></td>
                      <td className="px-4 py-3 text-sm text-slate-700">{resolveProfileName(p.borrowerName, loans.find(l => l.loanId === p.loanId)?.borrowerPhone, profileMap)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{p.monthYear}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(p.dueDate)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{formatCurrency(p.netAmountExpected)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{p.amountReceived > 0 ? formatCurrency(p.amountReceived) : '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-red-500">{p.pendingAmount > 0 ? formatCurrency(p.pendingAmount) : '—'}</td>
                      <td className="px-4 py-3">
                        {p.daysOverdue > 0 ? (
                          <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{p.daysOverdue}d</span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.paymentStatus} /></td>
                      <td className="px-4 py-3">
                        {canAct(p) && (
                          <div className="flex items-center justify-end gap-1">
                            {p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived' && (
                              <button
                                onClick={() => onMarkPaid(p.id)}
                                title="Mark as Paid"
                                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors"
                              >
                                <CheckCircle2 size={13} /> Paid
                              </button>
                            )}
                            <button onClick={() => onEdit(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit"><Edit2 size={14} /></button>
                            <button onClick={() => onDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={14} /></button>
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
