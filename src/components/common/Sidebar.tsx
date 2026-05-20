import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, CreditCard, BarChart3, Upload, HandCoins, User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { usePayments } from '@/context/PaymentContext';

export function Sidebar() {
  const { t } = useTranslation();
  const { isAdmin, displayName } = useAuth();
  const { payments } = usePayments();

  const overdueCount = payments.filter(
    (p) => p.daysOverdue > 0 && p.paymentStatus !== 'Received' && p.paymentStatus !== 'Waived'
  ).length;

  const commonNav = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), badge: 0 },
    { to: '/loans',     icon: CreditCard,      label: t('nav.loans'),     badge: 0 },
    { to: '/payments',  icon: BarChart3,        label: t('nav.payments'),  badge: overdueCount },
  ];
  const adminGlobalNav = [
    { to: '/loans?all=1',    icon: CreditCard, label: 'All Loans',    badge: 0 },
    { to: '/payments?all=1', icon: BarChart3,  label: 'All Payments', badge: overdueCount },
  ];
  const adminOnlyNav = [
    { to: '/users',  icon: Users,  label: t('nav.users'),   badge: 0 },
    { to: '/import', icon: Upload, label: t('nav.import'),  badge: 0 },
  ];

  const roleLabel = isAdmin ? t('nav.admin') : t('nav.member');

  const initials = displayName.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');

  return (
    <aside className="w-60 flex flex-col h-screen sticky top-0 shrink-0 border-r border-white/5"
      style={{ background: 'linear-gradient(180deg, #0c0f1a 0%, #111827 100%)' }}>

      {/* Logo */}
      <Link
        to="/dashboard"
        className="flex items-center gap-3 px-5 py-5 border-b border-white/5 hover:bg-white/5 transition-colors group"
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
          <HandCoins size={15} className="text-white" />
        </div>
        <div>
          <div className="font-semibold text-sm text-white leading-tight tracking-tight">{t('nav.loanBook')}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">{roleLabel}</div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-2">{t('nav.menu')}</p>
        {commonNav.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-indigo-400" />
                )}
                <div className="relative shrink-0">
                  <Icon size={15} className={isActive ? 'text-indigo-400' : ''} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-3.5 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                {label}
              </>
            )}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mt-4 mb-2">Admin</p>
            {[...adminGlobalNav, ...adminOnlyNav].map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-indigo-400" />
                    )}
                    <div className="relative shrink-0">
                      <Icon size={15} className={isActive ? 'text-indigo-400' : ''} />
                      {badge > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-3.5 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </div>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-4 py-3.5 border-t border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}>
            {initials || <User size={12} />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate leading-tight">{displayName || 'Account'}</p>
            <p className="text-[11px] text-slate-600 mt-0.5">{roleLabel}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
