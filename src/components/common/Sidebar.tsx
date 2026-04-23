import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, CreditCard, BarChart3, Upload, HandCoins, User, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const commonNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/loans',     icon: CreditCard,      label: 'Loans' },
  { to: '/payments',  icon: BarChart3,        label: 'Payments' },
];

const adminOnlyNav = [
  { to: '/users',  icon: Users,  label: 'Users' },
  { to: '/import', icon: Upload, label: 'Import / Export' },
];

export function Sidebar() {
  const { isAdmin, displayName } = useAuth();
  const navItems = isAdmin ? [...commonNav, ...adminOnlyNav] : commonNav;
  const roleLabel = isAdmin ? 'Admin' : 'User';
  const initials = displayName.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');

  return (
    <aside className="w-56 bg-slate-950 text-white flex flex-col h-screen sticky top-0 shrink-0">
      <Link to="/dashboard" className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800 hover:bg-slate-900 transition-colors">
        <div className="bg-indigo-500 p-1.5 rounded-lg shrink-0">
          <HandCoins size={16} className="text-white" />
        </div>
        <div>
          <div className="font-semibold text-sm text-white leading-tight">Loan Book</div>
          <div className="text-xs text-slate-500">{roleLabel}</div>
        </div>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
          {initials || <User size={13} />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-300 truncate">{displayName}</p>
          <p className="text-xs text-slate-600">{roleLabel}</p>
        </div>
      </div>
    </aside>
  );
}
