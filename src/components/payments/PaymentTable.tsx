import { useState } from 'react';
import { Edit2, Trash2, Plus, Search, ChevronUp, ChevronDown, CheckCircle2 } from 'lucide-react';
import type { Payment, PaymentStatus } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatUtils';

interface PaymentTableProps {
  payments: Payment[];
  onEdit: (payment: Payment) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onMarkPaid: (id: string) => void;
}

type SortKey = 'monthYear' | 'loanId' | 'borrowerName' | 'netAmountExpected' | 'amountReceived' | 'daysOverdue' | 'paymentStatus';

export function PaymentTable({ payments, onEdit, onDelete, onAdd, onMarkPaid }: PaymentTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('daysOverdue');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const filtered = payments
    .filter((p) => {
      const matchSearch =
        !search ||
        p.borrowerName.toLowerCase().includes(search.toLowerCase()) ||
        p.loanId.toLowerCase().includes(search.toLowerCase()) ||
        p.monthYear.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || p.paymentStatus === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(1);
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

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as PaymentStatus | 'All'); setPage(1); }}
          className="px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none"
        >
          <option value="All">All</option>
          <option value="Pending">Pending</option>
          <option value="Received">Received</option>
          <option value="Partial">Partial</option>
          <option value="Waived">Waived</option>
        </select>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 shrink-0"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Record Payment</span>
          <span className="sm:hidden">Add</span>
        </button>
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
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {paged.map((p) => (
              <div
                key={p.id}
                className={`bg-white rounded-2xl border p-4 ${p.daysOverdue > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-100'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xs font-mono font-semibold text-indigo-500">{p.loanId}</span>
                    <p className="text-sm font-semibold text-slate-800">{p.borrowerName}</p>
                    <p className="text-xs text-slate-400">{p.monthYear} · Due {formatDate(p.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => onDelete(p.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={15} />
                    </button>
                  </div>
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
                    {p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived' && (
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Due Date</th>
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
                      <td className="px-4 py-3 text-xs font-mono font-semibold text-indigo-500">{p.loanId}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{p.borrowerName}</td>
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
