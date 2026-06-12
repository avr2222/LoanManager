import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Line,
} from 'recharts';
import { CheckCircle2, Users, X, FileText } from 'lucide-react';
import { useLoans } from '@/context/LoanContext';
import { usePayments } from '@/context/PaymentContext';
import { useAuth } from '@/context/AuthContext';
import { WhatsAppButton } from '@/components/common/WhatsAppButton';
import { overdueMessage, dueMessage } from '@/utils/whatsappUtils';
import { computeKPIs } from '@/services/calculationService';
import { formatCurrency, formatDate, formatMonthYear } from '@/utils/formatUtils';
import { trimLeadingEmpty } from '@/utils/chartUtils';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { MediatorDashboardPage } from '@/pages/MediatorDashboardPage';
import { exportAdminPDF } from '@/services/pdfService';
import { useApp } from '@/context/AppContext';
import { PageSkeleton } from '@/components/common/Skeleton';

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

interface TooltipPayloadItem { name: string; value: number; color: string; }
function BarTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const expected = payload.find((p) => p.name === 'Expected');
  const received = payload.find((p) => p.name === 'Received');
  const pct = expected?.value ? Math.round(((received?.value ?? 0) / expected.value) * 100) : null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-lg px-4 py-3 min-w-[160px]">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">{label}</p>
      {expected && (
        <div className="flex items-center justify-between gap-6 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-200 shrink-0" />
            <span className="text-xs text-slate-500">Expected</span>
          </div>
          <span className="text-xs font-semibold text-slate-700">{formatCurrency(expected.value)}</span>
        </div>
      )}
      {received && (
        <div className="flex items-center justify-between gap-6 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 shrink-0" />
            <span className="text-xs text-slate-500">Received</span>
          </div>
          <span className="text-xs font-semibold text-slate-700">{formatCurrency(received.value)}</span>
        </div>
      )}
      {pct !== null && (
        <div className={`text-center text-xs font-bold mt-1 pt-2 border-t border-slate-100 ${pct >= 100 ? 'text-emerald-500' : pct >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
          {pct}% collected
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { loans } = useLoans();
  const { payments } = usePayments();
  const { displayName, profile } = useAuth();
  const { loading } = useApp();
  const navigate = useNavigate();
  const [viewAsPhone, setViewAsPhone] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const kpis = useMemo(() => computeKPIs(loans, payments), [loans, payments]);

  const statusData = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const l of loans) sums[l.loanStatus] = (sums[l.loanStatus] ?? 0) + l.principalAmount;
    return Object.entries(sums).map(([name, value]) => ({ name, value }));
  }, [loans]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = formatMonthYear(d);
      const mp = payments.filter((p) => p.monthYear === label);
      const exp = Math.round(mp.reduce((s, p) => s + p.netAmountExpected, 0));
      const rec = Math.round(mp.reduce((s, p) => s + p.amountReceived, 0));
      return {
        month: label.split('-')[0],
        Expected: exp,
        Received: rec,
        Rate: exp > 0 ? Math.round((rec / exp) * 100) : 0,
      };
    });
    // Don't waste chart space on empty months before the data starts
    return trimLeadingEmpty(months, (m) => m.Expected > 0 || m.Received > 0);
  }, [payments]);

  const thisMonthStats = useMemo(() => {
    const label = formatMonthYear(new Date());
    const mp = payments.filter((p) => p.monthYear === label);
    const expected  = mp.reduce((s, p) => s + p.netAmountExpected, 0);
    const collected = mp.reduce((s, p) => s + p.amountReceived, 0);
    const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
    return { label, expected, collected, rate, pending: Math.max(0, expected - collected) };
  }, [payments]);

  const overduePayments = useMemo(() =>
    payments
      .filter((p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived')
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 10),
    [payments]
  );

  const upcomingDues = useMemo(() => {
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 86400000);
    return payments
      .filter((p) => {
        if (p.paymentStatus === 'Received' || p.paymentStatus === 'Waived') return false;
        const d = new Date(p.dueDate);
        return d >= today && d <= in7;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 10);
  }, [payments]);

  // Distinct borrowers, not loans — one borrower can have several loans
  const uniqueBorrowerCount = useMemo(() => {
    const set = new Set<string>();
    for (const l of loans) set.add(l.borrowerPhone?.replace(/\D/g, '').slice(-10) || l.borrowerName);
    return set.size;
  }, [loans]);

  // Collect all unique phone users from loans
  const knownUsers = useMemo(() => {
    const map = new Map<string, string>(); // phone → name
    for (const l of loans) {
      if (l.borrowerPhone) map.set(l.borrowerPhone.replace(/\D/g, '').slice(-10), l.borrowerName);
      if (l.mediatorPhone) map.set(l.mediatorPhone.replace(/\D/g, '').slice(-10), l.mediatorName || l.mediatorPhone);
      if (l.lenderPhone)   map.set(l.lenderPhone.replace(/\D/g, '').slice(-10),   l.lenderName  || l.lenderPhone);
    }
    return Array.from(map.entries())
      .map(([phone, name]) => ({ phone, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loans]);

  function recordPayment(loanId: string) {
    navigate('/payments', { state: { openForm: true, loanId } });
  }

  if (loading) return <PageSkeleton />;

  // Render the selected user's dashboard
  if (viewAsPhone) {
    return <MediatorDashboardPage />;
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* Toolbar */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => exportAdminPDF(displayName, loans, payments)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <FileText size={15} className="text-red-500" /> Download PDF
        </button>
        {knownUsers.length > 0 && (
          <button
            onClick={() => setShowUserPicker(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <Users size={15} /> View as User
          </button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard title="Active Loans"  value={String(kpis.totalActiveLoans)}                subtitle={`${loans.length} total`} onClick={() => navigate('/loans')} />
        <KPICard title="Principal"     value={formatCurrency(kpis.totalPrincipalOutstanding)} accent="default" onClick={() => navigate('/loans')} />
        <KPICard title="Mthly Expected" value={formatCurrency(kpis.monthlyInterestExpected)} onClick={() => navigate('/payments')} />
        <KPICard title="Net Income"    value={formatCurrency(kpis.netMonthlyIncome)}          accent="green" subtitle="after commission" onClick={() => navigate('/payments')} />
        <KPICard title="Overdue"       value={String(kpis.totalOverduePayments)}              accent="red"   subtitle={kpis.totalPendingAmount > 0 ? formatCurrency(kpis.totalPendingAmount) + ' pending' : undefined} onClick={() => navigate('/payments', { state: { filter: 'Overdue' } })} />
        <KPICard title="Borrowers"     value={String(uniqueBorrowerCount)} onClick={() => navigate('/loans')} />
      </div>

      {/* This Month Collection — click to open this month's payments */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate('/payments', { state: { search: formatMonthYear(new Date()) } })}
        onKeyDown={(e) => { if (e.key === 'Enter') navigate('/payments', { state: { search: formatMonthYear(new Date()) } }); }}
        className="bg-white rounded-2xl border border-slate-100 p-5 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            {thisMonthStats.label} — Collection Progress
          </p>
          <span className={`text-sm font-bold ${
            thisMonthStats.rate >= 90 ? 'text-emerald-500' :
            thisMonthStats.rate >= 60 ? 'text-amber-500' : 'text-red-500'
          }`}>{thisMonthStats.rate}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              thisMonthStats.rate >= 90 ? 'bg-emerald-500' :
              thisMonthStats.rate >= 60 ? 'bg-amber-400' : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min(100, thisMonthStats.rate)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-400 mb-1">Expected</p>
            <p className="text-base font-bold text-slate-700">{formatCurrency(thisMonthStats.expected)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Collected</p>
            <p className="text-base font-bold text-emerald-600">{formatCurrency(thisMonthStats.collected)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Pending</p>
            <p className={`text-base font-bold ${thisMonthStats.pending > 0 ? 'text-red-500' : 'text-slate-400'}`}>
              {formatCurrency(thisMonthStats.pending)}
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Monthly Income — Last 6 Months</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={monthlyData} barGap={3} barCategoryGap="30%">
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={38} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={36} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar yAxisId="left" dataKey="Expected" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="Received" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" dataKey="Rate" name="Rate %" type="monotone" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Portfolio by Principal</p>
          {statusData.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-sm text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="45%" outerRadius={70} innerRadius={30} dataKey="value" paddingAngle={3}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), 'Principal']}
                  contentStyle={{ border: 'none', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Overdue + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Overdue */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Top Overdue Payments</p>
            <button
              onClick={() => navigate('/payments', { state: { filter: 'Overdue' } })}
              className="text-xs font-medium text-indigo-500 hover:text-indigo-700 hover:underline"
            >
              View all
            </button>
          </div>
          {overduePayments.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-400">No overdue payments</div>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-slate-50">
                {overduePayments.map((p) => (
                  <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-semibold text-indigo-500">{p.loanId}</p>
                      <p className="text-sm font-medium text-slate-800 truncate">{p.borrowerName}</p>
                      <p className="text-xs text-slate-400">{p.monthYear} · <span className="text-red-500">{p.daysOverdue}d</span></p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <p className="text-sm font-semibold text-red-500">{formatCurrency(p.pendingAmount)}</p>
                      <div className="flex gap-1">
                        <WhatsAppButton
                          phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                          message={overdueMessage({ borrowerName: p.borrowerName, amount: p.pendingAmount, monthYear: p.monthYear, daysOverdue: p.daysOverdue, upiId: profile?.upiId ?? undefined })}
                        />
                        <button onClick={() => recordPayment(p.loanId)} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                          <CheckCircle2 size={14} /> Record
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop */}
              <table className="hidden md:table min-w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    {['Loan', 'Borrower', 'Month', 'Pending', 'Days', ''].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {overduePayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{p.loanId}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{p.borrowerName}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{p.monthYear}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-red-500">{formatCurrency(p.pendingAmount)}</td>
                      <td className="px-5 py-3"><span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{p.daysOverdue}d</span></td>
                      <td className="px-5 py-3">
                        <WhatsAppButton
                          phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                          message={overdueMessage({ borrowerName: p.borrowerName, amount: p.pendingAmount, monthYear: p.monthYear, daysOverdue: p.daysOverdue, upiId: profile?.upiId ?? undefined })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Upcoming */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Upcoming Dues — Next 7 Days</p>
            <button
              onClick={() => navigate('/payments', { state: { filter: 'Pending' } })}
              className="text-xs font-medium text-indigo-500 hover:text-indigo-700 hover:underline"
            >
              View all
            </button>
          </div>
          {upcomingDues.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-400">No upcoming dues</div>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-slate-50">
                {upcomingDues.map((p) => (
                  <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-semibold text-indigo-500">{p.loanId}</p>
                      <p className="text-sm font-medium text-slate-800 truncate">{p.borrowerName}</p>
                      <p className="text-xs text-slate-400">Due {formatDate(p.dueDate)}</p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <p className="text-sm font-semibold text-slate-800">{formatCurrency(p.netAmountExpected)}</p>
                      <div className="flex gap-1">
                        <WhatsAppButton
                          phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                          message={dueMessage({ borrowerName: p.borrowerName, amount: p.netAmountExpected, monthYear: p.monthYear, dueDate: p.dueDate, upiId: profile?.upiId ?? undefined })}
                        />
                        <button onClick={() => recordPayment(p.loanId)} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                          <CheckCircle2 size={14} /> Record
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop */}
              <table className="hidden md:table min-w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    {['Loan', 'Borrower', 'Due Date', 'Amount', 'Status', ''].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {upcomingDues.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono font-semibold text-indigo-500">{p.loanId}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{p.borrowerName}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDate(p.dueDate)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{formatCurrency(p.netAmountExpected)}</td>
                      <td className="px-5 py-3"><StatusBadge status={p.paymentStatus} /></td>
                      <td className="px-5 py-3">
                        <WhatsAppButton
                          phone={loans.find(l => l.loanId === p.loanId)?.borrowerPhone ?? ''}
                          message={dueMessage({ borrowerName: p.borrowerName, amount: p.netAmountExpected, monthYear: p.monthYear, dueDate: p.dueDate, upiId: profile?.upiId ?? undefined })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
      {/* User picker modal */}
      {showUserPicker && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={() => setShowUserPicker(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm z-10">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">View as User</h2>
                <button onClick={() => setShowUserPicker(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={18} />
                </button>
              </div>
              <div className="p-2 max-h-80 overflow-y-auto">
                {knownUsers.map(({ phone, name }) => (
                  <button
                    key={phone}
                    onClick={() => { setViewAsPhone(phone); setShowUserPicker(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold shrink-0">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{name}</p>
                      <p className="text-xs text-slate-400">{phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
