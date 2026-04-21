import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useApp } from '@/context/AppContext';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/loans':     'Loans',
  '/payments':  'Payments',
  '/mediators': 'Mediators',
  '/import':    'Import / Export',
};

export function AppShell() {
  const { loading, autoImporting } = useApp();
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? 'Loan Book';

  if (loading || autoImporting) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">
            {autoImporting ? 'Importing loan data…' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
