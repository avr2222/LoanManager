import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CreditCard, BarChart3, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const commonNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/loans',     icon: CreditCard,      label: 'Loans' },
  { to: '/payments',  icon: BarChart3,        label: 'Payments' },
];

const adminOnlyNav = [
  { to: '/import', icon: Upload, label: 'Import' },
];

export function BottomNav() {
  const { isAdmin } = useAuth();
  const navItems = isAdmin ? [...commonNav, ...adminOnlyNav] : commonNav;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100 md:hidden">
      <div className={isAdmin ? 'grid grid-cols-4' : 'grid grid-cols-3'}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                isActive ? 'text-indigo-600' : 'text-slate-400'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
