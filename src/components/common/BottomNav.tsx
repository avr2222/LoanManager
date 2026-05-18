import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CreditCard, BarChart3, Upload, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

export function BottomNav() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  const commonNav = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/loans',     icon: CreditCard,      label: t('nav.loans') },
    { to: '/payments',  icon: BarChart3,        label: t('nav.payments') },
  ];
  const adminOnlyNav = [
    { to: '/users',  icon: Users,  label: t('nav.users') },
    { to: '/import', icon: Upload, label: t('nav.importShort') },
  ];

  const navItems = isAdmin ? [...commonNav, ...adminOnlyNav] : commonNav;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-md border-t border-slate-200/60 md:hidden shadow-[0_-1px_12px_rgba(0,0,0,0.06)]">
      <div className={`grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-3'}`}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full"
                    style={{ background: 'linear-gradient(90deg, #6366f1, #4f46e5)' }} />
                )}
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
