import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Edit2, Trash2, Plus, Search, ChevronUp, ChevronDown, CheckCircle2, Download, Handshake } from 'lucide-react';
import type { Loan, Payment, PaymentStatus } from '@/types';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatDate } from '@/utils/formatUtils';
import { useApp } from '@/context/AppContext';
import { useLoans } from '@/context/LoanContext';
import { useAuth } from '@/context/AuthContext';
import { resolveProfileName } from '@/utils/profileUtils';
import { compareMonthYear } from '@/utils/dateUtils';
import { isOverduePayment } from '@/services/calculationService';

type FilterValue = PaymentStatus | 'All' | 'Overdue' | 'Outstanding';

const normPhone = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-10);

interface MediatorInfo {
  name: string;
  phone: string;
  share: number;
  /** The logged-in user is this loan's mediator */
  isSelf: boolean;
}

/** Mediator details for a payment's loan, or null for Direct loans. */
function getMediatorInfo(p: Payment, loan: Loan | undefined, myPhone: string, profileMap: Map<string, string>): MediatorInfo | null {
  if (!loan || loan.loanType !== 'Through Mediator') return null;
  const resolved = resolveProfileName(loan.mediatorName, loan.mediatorPhone, profileMap);
  return {
    name: resolved !== '—' ? resolved : (loan.mediatorPhone || 'Mediator'),
    phone: loan.mediatorPhone ?? '',
    share: p.mediatorShare,
    isSelf: !!myPhone && normPhone(loan.mediatorPhone) === myPhone,
  };
}

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
  /** Seeds the search box once (e.g. a monthYear passed via navigation state) */
  initialSearch?: string;
  /** When provided, shows row checkboxes and a bulk "Mark Paid (n)" action bar */
  onBulkMarkPaid?: (ids: string[]) => void | Promise<void>;
  /** When provided, shows an Export button that receives the currently filtered rows */
  onExport?: (filtered: Payment[]) => void;
}

type SortKey = 'monthYear' | 'loanId' | 'borrowerName' | 'mediator' | 'netAmountExpected' | 'amountReceived' | 'daysOverdue' | 'paymentStatus' | 'dueDate';

export function PaymentTable({ payments, onEdit, onDelete, onAdd, onMarkPaid, readOnly, ownedLoanIds, canAdd = true, activeFilter, initialSearch, onBulkMarkPaid, onExport }: PaymentTableProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profileMap } = useApp();
  const { loans } = useLoans();
  const { userPhone, phone, adminPhone } = useAuth();
  const myPhone = normPhone(userPhone || phone || adminPhone);
  const loanMap = useMemo(() => new Map(loans.map((l) => [l.loanId, l])), [loans]);
  // Resolve borrower + mediator once per payment so search, sort and render agree
  const rowInfo = useMemo(() => {
    const map = new Map<string, { borrower: string; mediator: MediatorInfo | null }>();
    for (const p of payments) {
      const loan = loanMap.get(p.loanId);
      map.set(p.id, {
        borrower: resolveProfileName(p.borrowerName, loan?.borrowerPhone, profileMap),
        mediator: getMediatorInfo(p, loan, myPhone, profileMap),
      });
    }
    return map;
  }, [payments, loanMap, myPhone, profileMap]);
  const borrowerOf = (p: Payment) => rowInfo.get(p.id)?.borrower ?? p.borrowerName;
  const mediatorOf = (p: Payment) => rowInfo.get(p.id)?.mediator ?? null;
  // A row is editable if readOnly is false AND (no ownedLoanIds filter, or the payment's loan is owned by the current user)
  const canAct = (p: Payment) => !readOnly && (!ownedLoanIds || ownedLoanIds.has(p.loanId));
  const [search, setSearch] = useState(initialSearch ?? '');
  const [statusFilter, setStatusFilter] = useState<FilterValue>('All');
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const q = search.trim().toLowerCase();
  const filtered = payments
    .filter((p) => {
      const med = mediatorOf(p);
      const matchSearch =
        !q ||
        p.borrowerName.toLowerCase().includes(q) ||
        borrowerOf(p).toLowerCase().includes(q) ||
        p.loanId.toLowerCase().includes(q) ||
        p.monthYear.toLowerCase().includes(q) ||
        (!!med && (med.name.toLowerCase().includes(q) || (/\d/.test(q) && med.phone.includes(q))));
      const matchStatus =
        statusFilter === 'All' ? true :
        statusFilter === 'Outstanding' ? (p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial') :
        statusFilter === 'Overdue' ? isOverduePayment(p) :
        p.paymentStatus === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortKey === 'mediator') {
        // Direct loans (no mediator) always sink to the bottom
        const am = mediatorOf(a)?.name;
        const bm = mediatorOf(b)?.name;
        if (!am || !bm) return (am ? 0 : 1) - (bm ? 0 : 1);
        return sortAsc ? am.localeCompare(bm) : bm.localeCompare(am);
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      // "May-2026" strings sort alphabetically, not chronologically — parse them
      else if (sortKey === 'monthYear') cmp = compareMonthYear(String(av), String(bv));
      // Sort by the name actually shown (profile name may differ from the stored one)
      else if (sortKey === 'borrowerName') cmp = borrowerOf(a).localeCompare(borrowerOf(b));
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

  // ── Bulk selection (desktop) ─────────────────────────────────
  const bulkEnabled = !readOnly && !!onBulkMarkPaid;
  const eligibleForBulk = (p: Payment) => canAct(p) && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived';
  const pageEligible = paged.filter(eligibleForBulk);
  const allPageSelected = pageEligible.length > 0 && pageEligible.every((p) => selected.has(p.id));
  // Selection survives page changes but not filter/search changes (handled in their onChange)
  const selectedEligibleIds = filtered.filter((p) => selected.has(p.id) && eligibleForBulk(p)).map((p) => p.id);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageEligible.forEach((p) => next.delete(p.id));
      else pageEligible.forEach((p) => next.add(p.id));
      return next;
    });
  }

  async function handleBulkMarkPaid() {
    if (!onBulkMarkPaid || selectedEligibleIds.length === 0) return;
    await onBulkMarkPaid(selectedEligibleIds);
    setSelected(new Set());
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
            placeholder={t('payments.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); setMobilePage(1); setSelected(new Set()); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as FilterValue); setPage(1); setMobilePage(1); setSelected(new Set()); }}
          className="px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none"
        >
          <option value="All">All</option>
          <option value="Outstanding">Outstanding</option>
          <option value="Overdue">Overdue</option>
          <option value="Pending">Pending</option>
          <option value="Received">Received</option>
          <option value="Partial">Partial</option>
          <option value="Waived">Waived</option>
        </select>
        {onExport && (
          <button
            onClick={() => onExport(filtered)}
            title={t('payments.exportFiltered')}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"
          >
            <Download size={15} />
            <span className="hidden lg:inline">{t('common.export')}</span>
          </button>
        )}
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
            {mobileItems.map((p) => {
              const med = mediatorOf(p);
              return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl border p-4 pr-14 md:pr-4 ${p.daysOverdue > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-100'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <button onClick={() => navigate(`/loans/${p.loanId}`)} className="text-xs font-mono font-semibold text-indigo-500 hover:underline">{p.loanId}</button>
                    <p className="text-sm font-semibold text-slate-800">{borrowerOf(p)}</p>
                    {med && (
                      <p className="flex flex-wrap items-center gap-x-1 text-xs text-amber-700 mt-0.5" title={med.phone || undefined}>
                        <Handshake size={12} className="shrink-0" />
                        <span>{med.isSelf ? t('payments.viaYou') : t('payments.viaMediator', { name: med.name })}</span>
                        {med.share > 0 && (
                          <span className="text-amber-600/80">· {t(med.isSelf ? 'payments.yourShare' : 'payments.mediatorShare', { amount: formatCurrency(med.share) })}</span>
                        )}
                      </p>
                    )}
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
                    <p className={`font-semibold ${p.amountReceived > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{p.amountReceived > 0 ? formatCurrency(p.amountReceived) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Pending</p>
                    <p className={`font-semibold ${p.pendingAmount > 0 ? 'text-red-500' : 'text-slate-300'}`}>{p.pendingAmount > 0 ? formatCurrency(p.pendingAmount) : '—'}</p>
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
              );
            })}
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

          {/* Bulk action bar — desktop */}
          {bulkEnabled && selectedEligibleIds.length > 0 && (
            <div className="hidden md:flex items-center gap-3 mb-3 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
              <span className="text-sm font-medium text-indigo-700">{t('payments.selectedCount', { count: selectedEligibleIds.length })}</span>
              <button
                onClick={handleBulkMarkPaid}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg hover:bg-emerald-100"
              >
                <CheckCircle2 size={13} /> {t('payments.markPaidSelected', { count: selectedEligibleIds.length })}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                {t('common.clear')}
              </button>
            </div>
          )}

          {/* Desktop table view */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-slate-100">
                    {bulkEnabled && (
                      <th className="px-4 py-3 w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all on page"
                          checked={allPageSelected}
                          disabled={pageEligible.length === 0}
                          onChange={togglePageSelection}
                          className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                        />
                      </th>
                    )}
                    {th('loanId', 'Loan')}
                    {th('borrowerName', 'Borrower')}
                    {th('mediator', t('payments.mediator'))}
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
                  {paged.map((p) => {
                    const med = mediatorOf(p);
                    return (
                    <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${p.daysOverdue > 0 ? 'bg-red-50/40' : ''}`}>
                      {bulkEnabled && (
                        <td className="px-4 py-3">
                          {eligibleForBulk(p) && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${p.loanId} ${p.monthYear}`}
                              checked={selected.has(p.id)}
                              onChange={() => toggleRow(p.id)}
                              className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3"><button onClick={() => navigate(`/loans/${p.loanId}`)} className="text-xs font-mono font-semibold text-indigo-500 hover:underline">{p.loanId}</button></td>
                      <td className="px-4 py-3 text-sm text-slate-700">{borrowerOf(p)}</td>
                      <td className="px-4 py-3">
                        {med ? (
                          <div title={med.phone || undefined}>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded whitespace-nowrap">
                              <Handshake size={12} className="shrink-0" />
                              {med.isSelf ? t('payments.you') : med.name}
                            </span>
                            {med.share > 0 && (
                              <div className="text-xs text-slate-400 mt-0.5 whitespace-nowrap">
                                {t(med.isSelf ? 'payments.yourShare' : 'payments.mediatorShare', { amount: formatCurrency(med.share) })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">{t('payments.direct')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{p.monthYear}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(p.dueDate)}</td>
                      <td
                        className="px-4 py-3 text-sm font-medium text-slate-800"
                        title={med && med.share > 0 ? t('payments.expectedBreakdown', { interest: formatCurrency(p.interestAmount), share: formatCurrency(med.share), net: formatCurrency(p.netAmountExpected) }) : undefined}
                      >
                        {formatCurrency(p.netAmountExpected)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{p.amountReceived > 0 ? formatCurrency(p.amountReceived) : <span className="text-xs text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm font-medium text-red-500">{p.pendingAmount > 0 ? formatCurrency(p.pendingAmount) : <span className="text-xs font-normal text-slate-300">—</span>}</td>
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
                    );
                  })}
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
