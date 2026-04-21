import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CheckCircle2, Users, X, FileText } from 'lucide-react';
import { useLoans } from '@/context/LoanContext';
import { usePayments } from '@/context/PaymentContext';
import { useAuth } from '@/context/AuthContext';
import { computeKPIs } from '@/services/calculationService';
import { formatCurrency, formatDate, formatMonthYear } from '@/utils/formatUtils';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { MediatorDashboardPage } from '@/pages/MediatorDashboardPage';
import { exportAdminPDF } from '@/services/pdfService';

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
  const { displayName } = useAuth();
  const navigate = useNavigate();
  const [viewAsPhone, setViewAsPhone] = useState('');
  const [viewAsName, setViewAsName] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const kpis = useMemo(() => computeKPIs(loans, payments), [loans, payments]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of loans) counts[l.loanStatus] = (counts[l.loanStatus] ?? 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [loans]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = formatMonthYear(d);
      const mp = payments.filter((p) => p.monthYear === label);
      return {
        month: label.split('-')[0], // "Apr" only — shorter on chart
        Expected: Math.round(mp.reduce((s, p) => s + p.netAmountExpected, 0)),
        Received: Math.round(mp.reduce((s, p) => s + p.amountReceived, 0)),
      };
    });
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

  // Render the selected user's dashboard
  if (viewAsPhone) {
    return (
      <MediatorDashboardPage
        viewAsPhone={viewAsPhone}
        viewAsName={viewAsName}
        onExitViewAs={() => { setViewAsPhone(''); setViewAsName(''); }}
      />
    );
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
        <KPICard title="Active Loans"  value={String(kpis.totalActiveLoans)}                subtitle={`${loans.length} total`} />
        <KPICard title="Principal"     value={formatCurrency(kpis.totalPrincipalOutstanding)} accent="default" />
        <KPICard title="Mthly Expected" value={formatCurrency(kpis.monthlyInterestExpected)} />
        <KPICard title="Net Income"    value={formatCurrency(kpis.netMonthlyIncome)}          accent="green" subtitle="after commission" />
        <KPICard title="Overdue"       value={String(kpis.totalOverduePayments)}              accent="red"   subtitle={kpis.totalPendingAmount > 0 ? formatCurrency(kpis.totalPendingAmount) + ' pending' : undefined} />
        <KPICard title="Borrowers"     value={String(loans.length)} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Monthly Income — Last 6 Months</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barGap={3} barCategoryGap="30%">
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={38} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="Expected" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Received" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Loan Status</p>
          {statusData.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-sm text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="45%" outerRadius={70} innerRadius={30} dataKey="value" paddingAngle={3}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Tooltip contentStyle={{ border: 'none', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Overdue + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Overdue */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Top Overdue Payments</p>
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
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-red-500">{formatCurrency(p.pendingAmount)}</p>
                      <button onClick={() => recordPayment(p.loanId)} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                        <CheckCircle2 size={14} /> Record
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop */}
              <table className="hidden md:table min-w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    {['Loan', 'Borrower', 'Month', 'Pending', 'Days'].map((h) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Upcoming */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Upcoming Dues — Next 7 Days</p>
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
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-800">{formatCurrency(p.netAmountExpected)}</p>
                      <button onClick={() => recordPayment(p.loanId)} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                        <CheckCircle2 size={14} /> Record
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop */}
              <table className="hidden md:table min-w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    {['Loan', 'Borrower', 'Due Date', 'Amount', 'Status'].map((h) => (
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
                    onClick={() => { setViewAsPhone(phone); setViewAsName(name); setShowUserPicker(false); }}
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
